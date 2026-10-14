#!/usr/bin/env python3
"""claude-pr-review.py — Claude Code review of open PRs, run on the owner's Mac (launchd, every minute).

Same strategy as the insta travel bot: no Anthropic API key in GitHub; the local `claude` CLI talks
to Claude through the proxy configured in ~/.claude/settings.json, so reviews happen while this Mac
is on and Claude Code is set up. Each new head commit of a non-draft PR from this repo (never forks)
gets one GitHub review: a summary with a verdict plus inline comments on changed lines. Claude only
reads the diff and returns JSON (no tools); this script posts it with `gh`.

    python3 scripts/claude-pr-review.py            # review what is new, then exit
    python3 scripts/claude-pr-review.py --pr 3     # force a (re)review of PR 3
    python3 scripts/claude-pr-review.py --dry-run  # print instead of posting

State: ~/.local/state/addtomap-pr-review/state.json (last reviewed head SHA per PR).
"""
import argparse, fcntl, json, os, pathlib, re, subprocess, sys, time

REPOS = ["addtomap/addtomap-site"]
STATE_DIR = pathlib.Path.home() / ".local/state/addtomap-pr-review"
MAX_DIFF = 180_000            # characters of diff sent to the model
GUIDE = {
    "addtomap/addtomap-site": """addtomap.co is the static marketing site of AddToMap (iOS app of offline audio walking tours),
plain HTML/CSS/vanilla JS on GitHub Pages: index.html (landing, inline CSS/JS, I18N table for en/de/fr/es/it/ru),
t/<slug>/index.html tour pages, privacy.html, impressum.html, assets in img/ audio/ video/, checks in
scripts/check-site.mjs, Playwright tests in tests/, workflows in .github/workflows/.
Priorities, most important first:
1. Correctness: broken links/asset paths, JS errors, language switching (every data-i18n key in all six
   languages; localized screenshots, hero video and previews switch with the picker), previews, mobile layout,
   CI/deploy workflow mistakes.
2. Truthful marketing copy: prices, stops, km, narration languages (en/de/fr/ru for all tours, Rome also es,
   no Italian narration), first three stops of paid tours free, no subscription. No fake claims or reviews.
3. Privacy/legal (German site): no third-party requests without consent + privacy.html update; Impressum complete.
4. Accessibility and SEO: alt texts, button types, lang, titles, og:/canonical tags, sitemap.xml in sync.
5. Performance: asset sizes within the budgets in scripts/check-site.mjs, lazy loading below the fold.
6. Tests: visible behavior changes need a Playwright test; new assets/pages need check-site coverage.""",
}

PROMPT = """You are reviewing pull request #{number} "{title}" in {repo}.

{guide}

PR description:
{body}

The unified diff follows on stdin. Review only what the diff changes. You see only the diff: code it relies on may
already exist elsewhere in the repo, so never report something as missing just because the diff does not show it;
report only what the changed lines themselves get wrong. Be concrete and brief, skip praise and style nits. Reply with ONLY a JSON object, no prose around it:
{{"summary": "<markdown: 1-6 bullet findings ordered by severity, or one line saying nothing is wrong>",
  "verdict": "approve" | "request changes",
  "comments": [{{"path": "<file path as in the diff>", "line": <line number in the NEW file, on a changed or
  context line of a hunk>, "body": "<what is wrong, why it matters, the fix>"}}]}}
At most 10 comments; leave "comments" empty when there is nothing line-specific."""


def sh(*cmd, input=None, timeout=120):
    r = subprocess.run(cmd, input=input, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError(f"{' '.join(cmd[:4])}… failed: {r.stderr.strip()[:400]}")
    return r.stdout


def commentable_lines(diff):
    """{path: {new-file line numbers that appear in a hunk}} — GitHub accepts review comments only there."""
    lines, path, n = {}, None, 0
    for row in diff.splitlines():
        if row.startswith("+++ "):
            path = row[6:] if row.startswith("+++ b/") else None
            continue
        m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", row)
        if m:
            n = int(m.group(1)); continue
        if path is None or row.startswith(("--- ", "diff ", "index ")):
            continue
        if row.startswith("+") or row.startswith(" "):
            lines.setdefault(path, set()).add(n); n += 1
    return lines


def set_status(repo, sha, state, description, url=None):
    """Commit status "claude-review" on the PR head: pending while Claude reads, then success (approve) or
    failure (request changes). Not a required check — a Mac that is off must not block merges."""
    args = ["gh", "api", f"repos/{repo}/statuses/{sha}", "-X", "POST", "-f", f"state={state}",
            "-f", "context=claude-review", "-f", f"description={description[:140]}"]
    if url:
        args += ["-f", f"target_url={url}"]
    sh(*args)


def review(repo, pr, dry_run):
    if not dry_run:
        set_status(repo, pr["headRefOid"], "pending", "Claude is reviewing this commit")
    diff = sh("gh", "pr", "diff", str(pr["number"]), "--repo", repo, timeout=120)
    truncated = len(diff) > MAX_DIFF
    prompt = PROMPT.format(number=pr["number"], title=pr["title"], repo=repo, guide=GUIDE.get(repo, ""),
                           body=(pr.get("body") or "(none)")[:4000])
    if truncated:
        prompt += f"\nNote: the diff was cut at {MAX_DIFF} characters; say so in the summary."
    # Clean environment: the CLI then uses the proxy/token from ~/.claude/settings.json (as under launchd),
    # not the variables of a Claude Code session this may be started from. No tools, no MCP servers, a short
    # system prompt: the review only reads the diff, and each call costs cents instead of a full agent setup.
    env = {"HOME": str(pathlib.Path.home()), "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}
    r = subprocess.run(["claude", "-p", prompt, "--output-format", "json", "--tools", "", "--strict-mcp-config",
                        "--system-prompt", "You are a meticulous senior reviewer of pull requests. Answer with JSON only."],
                       input=diff[:MAX_DIFF], capture_output=True, text=True, timeout=900, env=env)
    out = r.stdout
    if r.returncode or json.loads(out or "{}").get("is_error", True):
        raise RuntimeError(f"claude failed: {(out or r.stderr)[:400]}")
    text = json.loads(out).get("result", "")
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise RuntimeError(f"no JSON in Claude's answer: {text[:300]}")
    res = json.loads(m.group(0))

    allowed = commentable_lines(diff)
    inline, loose = [], []
    for c in res.get("comments") or []:
        path, line = c.get("path"), c.get("line")
        if path in allowed and isinstance(line, int) and line in allowed[path]:
            inline.append({"path": path, "line": line, "side": "RIGHT", "body": c["body"]})
        else:
            loose.append(f"- `{path}:{line}` — {c.get('body', '')}")
    verdict = res.get("verdict", "approve")
    body = (f"### 🤖 Claude review — {'✅ approve' if verdict == 'approve' else '⚠️ request changes'}\n\n"
            f"{res.get('summary', '').strip()}\n" + ("\n**Other notes:**\n" + "\n".join(loose) + "\n" if loose else "") +
            f"\n<sub>Commit {pr['headRefOid'][:7]} · local Claude Code review (scripts/claude-pr-review.py)</sub>")
    payload = {"commit_id": pr["headRefOid"], "event": "COMMENT", "body": body, "comments": inline}
    if dry_run:
        print(json.dumps(payload, indent=1, ensure_ascii=False)); return
    posted = json.loads(sh("gh", "api", f"repos/{repo}/pulls/{pr['number']}/reviews", "-X", "POST", "--input", "-",
                           input=json.dumps(payload)))
    set_status(repo, pr["headRefOid"], "success" if verdict == "approve" else "failure",
               f"Claude: {verdict}, {len(inline)} inline comment(s)", posted.get("html_url"))
    print(f"{repo}#{pr['number']} {pr['headRefOid'][:7]}: {verdict}, {len(inline)} inline comment(s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pr", type=int); ap.add_argument("--repo", default=None); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock = open(STATE_DIR / "lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # the previous run is still reviewing
    state_file = STATE_DIR / "state.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    for repo in [a.repo] if a.repo else REPOS:
        prs = json.loads(sh("gh", "pr", "list", "--repo", repo, "--state", "open", "--limit", "30",
                            "--json", "number,title,body,headRefOid,isDraft,isCrossRepository"))
        for pr in prs:
            key = f"{repo}#{pr['number']}"
            if a.pr and pr["number"] != a.pr:
                continue
            if not a.pr and (pr["isDraft"] or pr["isCrossRepository"] or state.get(key) == pr["headRefOid"]):
                continue
            try:
                review(repo, pr, a.dry_run)
                if not a.dry_run:
                    state[key] = pr["headRefOid"]; state_file.write_text(json.dumps(state, indent=1))
            except Exception as e:
                print(f"{time.strftime('%F %T')} {key}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
