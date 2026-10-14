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
    await expect(video).toHaveAttribute('src', `video/hero_${lang}${size}.mp4`);
    await expect(video).toHaveAttribute('poster', `img/hero_poster_${lang}.webp`);
    await expect.poll(() => video.evaluate((v) => !v.error && v.readyState >= 2 && v.currentTime > 0),
      { message: 'hero loop plays' }).toBe(true);

    for (const img of await page.locator('img.locimg').all()) {
      await expect(img).toHaveAttribute('src', new RegExp(`_${lang}\\.webp$`));
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

test('every tour card opens a working tour page', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('.card h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBe(7);
  for (const href of hrefs) {
    const w = watch(page);
    const res = await page.goto(href);
    expect(res.status(), href).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\/addtomap\.co\/img\//);
    const cover = page.locator('img.cover');
    await cover.scrollIntoViewIfNeeded();
    await expect.poll(() => cover.evaluate((i) => i.complete && i.naturalWidth > 0), { message: `${href} cover` }).toBe(true);
    expect(w.problems, href).toEqual([]);
  }
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

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the hero loop stays still', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    expect(await page.locator('#herovideo').evaluate((v) => v.paused)).toBe(true);
  });
});
