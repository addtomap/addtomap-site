## What

<!-- One or two sentences: what changes on addtomap.co and why. -->

## Checklist

- [ ] `npm test` passes locally (static checks, HTML validation, Playwright in Chrome) — or CI is green
- [ ] Every new visible string has all six languages (en, de, fr, es, it, ru) in the `I18N` table
- [ ] New or changed assets exist in every language that uses them (screenshots, hero video + poster, previews × 2 voices)
- [ ] Claims match the app: prices, stops, km, narration languages (en/de/fr/ru; Rome also es; no Italian narration), no subscription
- [ ] No third-party requests (fonts, analytics, embeds) — or privacy.html updated and consent handled
- [ ] New tour → card, `t/<slug>/` page with og:/canonical tags, cover image, previews, `sitemap.xml`
- [ ] Images/videos within the size budget (`scripts/check-site.mjs`)

## Screenshots

<!-- Desktop + phone, before/after, for any visible change. -->
