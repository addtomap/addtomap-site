#!/usr/bin/env node
// check-site.mjs — fast static checks for addtomap.co (Node standard library only, no network).
// Fails (exit 1) on: a local link/src/poster that points nowhere; a data-i18n key missing in any of
// the six languages; a missing localized asset (screenshots, hero video + poster, tour previews in
// every language × voice); a tour card without its /t/<slug>/ page, or a page without title /
// og:title / og:image / canonical; sitemap entries that 404 locally or tour pages missing from it;
// version.txt ≠ <meta name="build">; CNAME ≠ addtomap.co; files over the size budget; anything that
// looks like a credential (the repo is public).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LANGS = ['en', 'de', 'fr', 'es', 'it', 'ru'];
const PAGES = ['index.html', 'privacy.html', ...['de', 'fr', 'es', 'it', 'ru'].map((l) => `privacy-${l}.html`).filter((f) => fs.existsSync(path.join(ROOT, f))), 'impressum.html', 'support.html',
  ...fs.readdirSync(path.join(ROOT, 't')).map((s) => `t/${s}/index.html`)];
const BUDGET = { '.mp4': 3e6, '.jpg': 9e5, '.png': 9e5, '.mp3': 2e6, '.html': 1.5e5 };
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

// ---- local references in every page ------------------------------------------------------------
for (const page of PAGES) {
  const html = read(page);
  for (const m of html.matchAll(/\s(?:src|href|poster)="([^"]+)"/g)) {
    let ref = m[1].split('#')[0].split('?')[0];
    if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;   // any scheme: https, mailto, addtomap://, …
    let target = ref.startsWith('/') ? ref.slice(1) : path.posix.join(path.posix.dirname(page), ref);
    if (target === '' || target.endsWith('/')) target += 'index.html';
    else if (!path.posix.extname(target) && exists(target + '/index.html')) target += '/index.html';
    if (!exists(target)) err(`${page}: "${m[1]}" → ${target} does not exist`);
  }
  if (!/<title>[^<]+<\/title>/.test(html)) err(`${page}: no <title>`);
  if (!/<html[^>]* lang="/.test(html)) err(`${page}: <html> without lang`);
}

// ---- i18n: every data-i18n key in all six languages ---------------------------------------------
const index = read('index.html');
const i18nSrc = index.match(/(?:var|const|let) I18N\s*=\s*(\{[\s\S]*?\n\});/);
if (!i18nSrc) err('index.html: I18N table not found');
else {
  const I18N = vm.runInNewContext(`(${i18nSrc[1]})`);
  const used = new Set([...index.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]));
  for (const l of LANGS) {
    if (!I18N[l]) { err(`I18N: language ${l} missing`); continue; }
    for (const k of used) if (!(k in I18N[l]) || String(I18N[l][k]).trim() === '') err(`I18N.${l}: key "${k}" missing or empty`);
    for (const k of Object.keys(I18N[l])) if (!(k in I18N.en)) warn(`I18N.${l}: key "${k}" is not in en`);
  }
}

// ---- localized assets -------------------------------------------------------------------------
for (const base of new Set([...index.matchAll(/data-base="([^"]+)"/g)].map((m) => m[1])))
  for (const l of LANGS) if (!exists(`img/${base}_${l}.jpg`)) err(`img/${base}_${l}.jpg missing (localized screenshot)`);
if (index.includes('id="herovideo"'))
  for (const l of LANGS) {
    for (const f of [`video/hero_${l}.mp4`, `img/hero_poster_${l}.jpg`])
      if (!exists(f)) err(`${f} missing (hero loop + poster)`);
  }
const slugs = [...new Set([...index.matchAll(/class="card"[^>]*data-slug="([^"]+)"/g)].map((m) => m[1]))];
if (!slugs.length) err('index.html: no tour cards found');
const previewSlugs = new Set([...index.matchAll(/class="pvbtn" data-slug="([^"]+)"/g)].map((m) => m[1]));
for (const s of previewSlugs)
  for (const l of LANGS) for (const v of ['', '_f'])
    if (!exists(`audio/${s}_preview_${l}${v}.mp3`)) err(`audio/${s}_preview_${l}${v}.mp3 missing (tour preview)`);
if (previewSlugs.size && !exists('audio/background_music.mp3')) err('audio/background_music.mp3 missing (preview music fallback)');

// ---- privacy policy in every language (GDPR Art. 12: in the language of the audience) ---------
for (const l of LANGS) {
  const f = l === 'en' ? 'privacy.html' : `privacy-${l}.html`;
  if (!exists(f)) { err(`${f} missing (privacy policy, ${l})`); continue; }
  const html = read(f);
  if (!html.includes(`<html lang="${l}"`)) err(`${f}: <html lang="${l}"> expected`);
  for (const o of LANGS) if (!html.includes(`hreflang="${o}"`)) err(`${f}: no hreflang link to ${o}`);
}

// ---- tour pages + sitemap ----------------------------------------------------------------------
const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>https:\/\/addtomap\.co\/([^<]*)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  const f = loc === '' || loc.endsWith('/') ? `${loc}index.html` : loc;
  if (!exists(f)) err(`sitemap.xml: ${loc || '/'} → ${f} does not exist`);
}
for (const s of slugs) {
  const page = `t/${s}/index.html`;
  if (!exists(page)) { err(`tour card ${s}: ${page} missing`); continue; }
  const html = read(page);
  for (const [what, re] of [['og:title', /property="og:title" content="[^"]+"/], ['og:image', /property="og:image" content="([^"]+)"/],
                            ['canonical', /rel="canonical" href="[^"]+"/], ['h1', /<h1[^>]*>[^<]+<\/h1>/]])
    if (!re.test(html)) err(`${page}: no ${what}`);
  const og = html.match(/property="og:image" content="https:\/\/addtomap\.co\/([^"]+)"/);
  if (og && !exists(og[1])) err(`${page}: og:image ${og[1]} does not exist`);
  if (!locs.includes(`t/${s}/`)) err(`sitemap.xml: /t/${s}/ missing`);
  // the price on the card is the price of the tour page (packs/all-cities cost more than a single tour)
  const card = index.match(new RegExp(`data-slug="${s}"[\\s\\S]*?class="free paid">([0-9]+,[0-9]{2}) €`));
  if (card) {
    const single = Number(card[1].replace(',', '.'));
    for (const [, p] of html.matchAll(/([0-9]+,[0-9]{2}) €/g)) {
      const v = Number(p.replace(',', '.'));
      if (v < single * 1.4 && v !== single) err(`${page}: price ${p} € ≠ the card's ${card[1]} € on the landing page`);
    }
  }
}

// ---- build stamp, domain, sizes, secrets -------------------------------------------------------
const meta = index.match(/<meta name="build" content="([^"]*)"/)?.[1];
const version = read('version.txt').trim();
if (meta !== version) err(`build stamp mismatch: <meta name="build"> ${meta} vs version.txt ${version} (run ./stamp.sh)`);
if (read('CNAME').trim() !== 'addtomap.co') err('CNAME must be exactly "addtomap.co" (custom domain mapping)');

const SECRET = /(sk_[a-f0-9]{40,}|cfut_[A-Za-z0-9]{40}|cfat_[A-Za-z0-9]{40}|cfk_[A-Za-z0-9]{40}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
  const rel = path.posix.join(dir, d.name);
  if (['.git', 'node_modules', 'test-results', 'playwright-report', '.lighthouseci'].includes(d.name)) return [];
  return d.isDirectory() ? walk(rel) : [rel];
});
for (const f of walk('.')) {
  const ext = path.extname(f).toLowerCase(), size = fs.statSync(path.join(ROOT, f)).size;
  if (BUDGET[ext] && size > BUDGET[ext])
    err(`${f}: ${(size / 1e6).toFixed(2)} MB over the ${(BUDGET[ext] / 1e6).toFixed(1)} MB budget for ${ext}`);
  if (['.html', '.js', '.mjs', '.json', '.md', '.txt', '.xml', '.yml', '.yaml', '.sh', '.css'].includes(ext) && size < 2e6) {
    const hit = read(f).match(SECRET);
    if (hit) err(`${f}: looks like a credential (${hit[0].slice(0, 6)}…) — never commit keys to this public repo`);
  }
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error:   ${e}`);
console.log(`${PAGES.length} pages, ${slugs.length} tours, ${previewSlugs.size} with previews, ${LANGS.length} languages: ` +
  (errors.length ? `${errors.length} error(s)` : 'OK') + (warnings.length ? `, ${warnings.length} warning(s)` : ''));
process.exit(errors.length ? 1 : 0);
