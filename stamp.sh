#!/usr/bin/env bash
# stamp.sh — bump the site build stamp so returning visitors auto-refresh.
# The deploy workflow (.github/workflows/deploy.yml) runs this on every publish; there is no need
# to run it by hand before committing.
set -euo pipefail
cd "$(dirname "$0")"
STAMP="$(date -u +%Y%m%d%H%M%S)"
# update the <meta name="build"> content and version.txt to the same value
perl -0pi -e "s/(<meta name=\"build\" content=\")[^\"]*(\")/\${1}${STAMP}\${2}/" index.html
printf '%s\n' "$STAMP" > version.txt
echo "stamped build: $STAMP"
