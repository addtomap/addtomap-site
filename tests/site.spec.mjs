// addtomap.co end-to-end checks: what a visitor sees and hears, in every language.
import { test, expect } from '@playwright/test';

const LANGS = ['en', 'de', 'fr', 'es', 'it', 'ru'];

/** Collects JS errors, console errors and failed same-origin requests; asserts no third-party requests. */
function watch(page) {
  const problems = [];
  const thirdParty = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (!why.includes('ERR_ABORTED')) problems.push(`request failed: ${r.url()} (${why})`);  // aborted = media src switched
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (url.hostname !== 'localhost') thirdParty.push(r.url());
    else if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${url.pathname}`);
  });
  return { problems, thirdParty };
}

test('home page renders with no errors and no third-party requests', async ({ page }) => {
  const w = watch(page);
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveTitle(/AddToMap/);
  await expect(page.locator('.card')).toHaveCount(7);
  await page.waitForLoadState('networkidle');
  expect(w.problems).toEqual([]);
  expect(w.thirdParty, 'the landing page must not call other hosts (privacy)').toEqual([]);
});

for (const lang of LANGS) {
  test(`language ${lang}: texts, screenshots and hero video follow the picker`, async ({ page }) => {
    const w = watch(page);
    await page.goto('/');
    await page.selectOption('#lang', lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    const h1 = await page.evaluate((l) => I18N[l].hero_h1, lang);   // eslint-disable-line no-undef
    await expect(page.locator('h1')).toHaveText(h1);

    const video = page.locator('#herovideo');
    const size = (page.viewportSize()?.width ?? 1280) <= 720 ? '_s' : '';   // phones get the 400 px loop
    const build = await page.locator('meta[name="build"]').getAttribute('content');   // every localized media URL carries it: img/ and video/ are browser-cached for 4 h
    await expect(video).toHaveAttribute('src', `video/hero_${lang}${size}.mp4?v=${build}`);
    await expect(video).toHaveAttribute('poster', `img/hero_poster_${lang}.webp?v=${build}`);
    await expect.poll(() => video.evaluate((v) => !v.error && v.readyState >= 2 && v.currentTime > 0),
      { message: 'hero loop plays' }).toBe(true);

    for (const img of await page.locator('img.locimg').all()) {
      await expect(img).toHaveAttribute('src', new RegExp(`_${lang}\\.webp\\?v=${build}$`));
      await img.scrollIntoViewIfNeeded();           // loading="lazy": fetched only near the viewport
      await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    expect(w.problems).toEqual([]);
  });
}

test('tour preview plays in the chosen voice and stops on a second tap', async ({ page }) => {
  await page.goto('/');
  const btn = page.locator('.pvbtn').first();
  const slug = await btn.getAttribute('data-slug');
  const audio = page.waitForResponse((r) => r.url().includes(`/audio/${slug}_preview_en_f.mp3`) && r.ok());
  await btn.click();
  await audio;                                      // female voice by default, like the app
  await expect(btn).toHaveClass(/playing/);
  await btn.click();
  await expect(btn).not.toHaveClass(/playing/);

  await page.click('#vm');                          // male voice: persisted and used for the next preview
  expect(await page.evaluate(() => localStorage.getItem('pv'))).toBe('m');
  const male = page.waitForResponse((r) => r.url().includes(`/audio/${slug}_preview_en.mp3`) && r.ok());
  await btn.click();
  await male;
});

test('every tour card leads to its tour: desktop and Android go straight to the card on the main page', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('.card h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBe(7);
  for (const href of hrefs) {
    const slug = href.replace(/^\/t\/|\/$/g, '');
    const res = await page.goto(href);
    expect(res.status(), href).toBe(200);
    // /t/<slug> is the link shared from the app; without an iPhone there is nothing to open, so it redirects.
    await expect(page).toHaveURL(new RegExp(`/\\?tour=${slug}$`));
    await expect(page.locator(`#tour-${slug}`)).toBeVisible();
  }
});

test.describe('shared tour link on an iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  test('offers the app first, then falls back to the tour card', async ({ page, request }) => {
    // The DOM is checked from the raw HTML: in a browser the page hands off to addtomap:// at once and Chrome,
    // which cannot open that scheme, lands on the fallback before any assertion could run.
    const res = await request.get('/t/frankfurt/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<h1[^>]*>[^<]*Frankfurt/);
    expect(html).toContain('id="open" href="addtomap://tour/frankfurt"');
    expect(html).toMatch(/property="og:image" content="https:\/\/addtomap\.co\/img\//);
    expect(html).toMatch(/if\(\/iPhone\|iPad\|iPod\/\.test\(navigator\.userAgent\)\)/);
    expect(html).toContain('location.replace("/?tour="+slug)');
    // In the browser: no app → the 1.5 s fallback brings the tour card up.
    await page.goto('/t/frankfurt/', { waitUntil: 'commit' }).catch(() => {});
    await expect(page).toHaveURL(/\/\?tour=frankfurt$/, { timeout: 10000 });
    await expect(page.locator('#tour-frankfurt')).toBeVisible();
  });
});

test('legal pages load', async ({ page }) => {
  for (const p of ['/privacy.html', '/impressum.html']) {
    const res = await page.goto(p);
    expect(res.status(), p).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  }
});

test('no horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

/** Letterbox guard. A <video> (object-fit: contain by default) or an img with object-fit contain/none
 *  paints its content inside whatever box CSS gives it — so a stray fixed height (e.g. a width/height
 *  attribute that CSS forgets to override with height:auto) shows up as a tall white band around the
 *  media instead of an error. Every such element must render at its own intrinsic aspect ratio. */
test('no media is letterboxed: videos and contain-fit images keep their intrinsic aspect ratio', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.locator('#herovideo').evaluate((v) => v.videoWidth > 0)).toBe(true);
  const offenders = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('video, img')) {
      const fit = getComputedStyle(el).objectFit;
      const isVideo = el.tagName === 'VIDEO';
      if (!isVideo && !['contain', 'scale-down', 'none'].includes(fit)) continue;   // fill/cover never letterbox
      const iw = isVideo ? el.videoWidth : el.naturalWidth, ih = isVideo ? el.videoHeight : el.naturalHeight;
      const r = el.getBoundingClientRect();
      if (!iw || !ih || r.width < 100 || r.height < 2) continue;                    // not loaded / hidden / icons (the 30 px logo is boxed on purpose)
      const expected = r.width * ih / iw;
      if (Math.abs(r.height - expected) > Math.max(3, expected * 0.02)) {
        out.push(`${el.tagName.toLowerCase()}#${el.id || el.className}: box ${Math.round(r.width)}×${Math.round(r.height)} vs intrinsic ${iw}×${ih}`);
      }
    }
    return out;
  });
  expect(offenders).toEqual([]);
});

test('hero phone: the loop fills a phone-shaped frame right under the headline', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('#herovideo');
  await expect.poll(() => video.evaluate((v) => v.videoWidth > 0)).toBe(true);
  const m = await video.evaluate((v) => {
    const r = v.getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top + window.scrollY };
  });
  expect(m.h / m.w).toBeGreaterThan(1.9);     // a phone: taller than wide…
  expect(m.h / m.w).toBeLessThan(2.4);        // …but never a 300×1300 tower (the Oct-14 regression)
  const vh = page.viewportSize()?.height ?? 720;
  expect(m.top).toBeLessThan(vh * 1.6);       // starts within the first scroll, not pushed down by a band
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the hero loop stays still', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    expect(await page.locator('#herovideo').evaluate((v) => v.paused)).toBe(true);
  });
});
