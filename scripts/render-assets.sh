#!/usr/bin/env bash
# Regenerates assets/*.png from the HTML terminal mockups in scripts/mockups. Needs chromium and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
cp scripts/mockups/*.html scripts/mockups/*.css "$tmp"/
shot() {
  local page=$1
  local size
  size=$(grep -o 'data-size="[0-9]*,[0-9]*"' "scripts/mockups/$page.html" | grep -o '[0-9]*,[0-9]*')
  chromium --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$size" --screenshot="$tmp/$page.png" "file://$tmp/$page.html" >/dev/null 2>&1
}
for page in fresh; do
  shot "$page"
  magick "$tmp/$page.png" -fuzz 4% -trim +repage -bordercolor '#11111b' -border 40 -strip "assets/$page.png"
done
rm -rf "$tmp"
