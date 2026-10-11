#!/usr/bin/env bash
# stamp.sh — bump the site build stamp so returning visitors auto-refresh.
# Run this before committing/pushing a site change:
#   ./stamp.sh && git add -A && git commit -m "..." && git push
set -euo pipefail
cd "$(dirname "$0")"
STAMP="$(date -u +%Y%m%d%H%M%S)"
# update the <meta name="build"> content and version.txt to the same value
perl -0pi -e "s/(<meta name=\"build\" content=\")[^\"]*(\")/\${1}${STAMP}\${2}/" index.html
printf '%s\n' "$STAMP" > version.txt
echo "stamped build: $STAMP"
