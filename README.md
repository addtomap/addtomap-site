# addtomap.co — marketing site

Static landing page + privacy policy for the AddToMap app, modeled on
touringbee.com (hero → free tours → why → how it works → CTA → footer), minus
fake testimonials.

- `index.html` — landing (self-contained, inline CSS).
- `privacy.html` — Privacy Policy. **This is the Privacy Policy URL for App Store
  Connect:** `https://addtomap.co/privacy.html`.
- `img/` — tour cover images (recompressed, ~350 KB each).

## Deploy (addtomap.co = Cloudflare DNS → GitHub Pages)
`addtomap.co` currently serves from the GitHub Pages repo behind
`stillsoftwords.github.io`. To publish this site:
1. Copy `index.html`, `privacy.html`, `img/` into the repo that serves
   `addtomap.co` (the one holding the `CNAME` file with `addtomap.co`).
2. Keep the existing **`CNAME`** file (= `addtomap.co`) so the domain stays mapped.
3. Commit + push → GitHub Pages redeploys in ~1 min.

⚠️ This replaces the current addtomap.co root page — back up whatever is there now
if you want to keep it (e.g. move it to a subpath).

Alternatively create a dedicated repo (e.g. `addtomap-site`), add a `CNAME` with
`addtomap.co`, enable Pages, and point the domain there.

## After launch
- Swap the "Soon on the App Store" badge for the real **App Store download badge + link**.
- Update tour cards as cities are added.
