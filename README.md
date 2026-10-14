# addtomap.co

Static marketing site for **AddToMap** (offline audio walking tours for iPhone), served by GitHub
Pages from this repo with the custom domain in `CNAME`.

| Path | What |
|---|---|
| `index.html` | Landing page: inline CSS/JS, the six-language `I18N` table, tour cards with audio previews, hero video |
| `t/<slug>/index.html` | One page per tour (rich link previews: og:/twitter: tags, canonical), opens the tour in the app |
| `privacy.html`, `impressum.html` | Privacy policy (the App Store Connect privacy URL) and legal notice |
| `img/` | Covers, localized app screenshots (`screen-*_<lang>.jpg`), hero posters, icons |
| `video/hero_<lang>.mp4` | Silent hero loop of the app, recorded in each UI language |
| `audio/<slug>_preview_<lang>[_f].mp3` | Tour previews, male / female (`_f`) voice; `background_music.mp3` |
| `sitemap.xml`, `robots.txt`, `version.txt` | SEO; `version.txt` + `<meta name="build">` make returning visitors refresh |

## Working on the site

```bash
npm ci                 # once: Playwright + html-validate (dev tools only, nothing ships)
npm run serve          # http://localhost:4173
npm test               # everything CI runs: check + lint:html + test:e2e
```

- `npm run check` — `scripts/check-site.mjs`, Node only, ~1 s: every local link/src resolves; every
  `data-i18n` key exists in en/de/fr/es/it/ru; localized screenshots, hero videos/posters and tour
  previews exist for every language and voice; each tour card has its page with title, og:image,
  canonical and a sitemap entry; build stamp consistent; `CNAME` intact; size budgets; no credentials.
- `npm run lint:html` — html-validate (recommended rules).
- `npm run test:e2e` — Playwright in **Google Chrome** (desktop + Pixel 7): no console errors or
  failed requests, no third-party requests, each language switches texts, screenshots and the hero
  video (which must actually play), previews play in both voices, every tour page loads, legal pages,
  no horizontal scroll, reduced motion keeps the hero still. Chrome, not Playwright's Chromium:
  only Chrome decodes the H.264/MP3 media.

## CI/CD

Everything goes through pull requests; `main` is what is live.

```
branch → PR → ci (static, e2e, lighthouse) + Claude review → squash-merge → deploy → addtomap.co
```

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every PR, push to `main` | `static` (check + html-validate), `e2e` (Playwright), `lighthouse` (accessibility / best practices / SEO below 0.9 fail, performance below 0.8 warns; report link in the job) |
| Claude review (local) | new commit on a PR, within 5 min | `scripts/claude-pr-review.py` on the owner's Mac (launchd): a GitHub review with verdict + inline comments, see below |
| `deploy.yml` | push to `main` | stamps the build, publishes to GitHub Pages without the repo tooling, then waits until addtomap.co serves the new build and smoke-tests key URLs |
| `links.yml` | Mondays, manual | external links (social, App Store); opens/updates an issue when one breaks |
| Dependabot | Mondays | grouped updates for the actions and the npm dev tools |

The build stamp is set by the deploy job — no need to run `./stamp.sh` by hand any more.

### Repository settings (one-time)

- **Pages → Source: GitHub Actions** (the deploy workflow publishes; "Deploy from a branch" is off).
- **Branch protection for `main`**: pull request required; required status checks `static` and `e2e`
  (up to date with `main`); no force pushes or deletions. No approval count: the owner cannot
  approve their own PRs; the Claude review is the second pair of eyes and stays advisory.
- **Pull requests**: squash merging only, delete head branches automatically, auto-merge allowed.

### Claude review

Like the insta travel bot, the review runs on the owner's Mac instead of in GitHub Actions: the local
`claude` CLI reaches Claude through the proxy configured in `~/.claude/settings.json`, so there is no
API key in GitHub. A launchd agent runs `scripts/claude-pr-review.py` every 5 minutes; for each new
head commit of a non-draft PR from this repo (never forks) Claude reads the diff (no tools) and returns
findings, which the script posts with `gh` as one review: verdict, summary, inline comments.
Reviews only happen while the Mac is on; the PR checks themselves do not depend on it.

```bash
python3 scripts/claude-pr-review.py --pr 12 --dry-run   # see what it would post
launchctl unload ~/Library/LaunchAgents/com.anton.addtomap-pr-review.plist   # pause it
tail -f ~/Library/Logs/addtomap-pr-review.log
```
