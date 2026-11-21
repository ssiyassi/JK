#!/bin/bash
# Renders every creative template to PNG at its exact size with headless Chrome.
# Usage: marketing/creatives/render.sh <output-folder>
set -e
cd "$(dirname "$0")/templates"
OUT="$(cd .. && mkdir -p "$1" && cd "$1" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in *.html; do
  case "$f" in story-*) size=1080,1920 ;; *) size=1080,1350 ;; esac
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files \
    --virtual-time-budget=8000 --window-size=$size --screenshot="$OUT/${f%.html}.png" "file://$PWD/$f" 2>/dev/null
  echo "rendered $OUT/${f%.html}.png"
done
