#!/usr/bin/env bash
# Regenerates assets/*.png|gif from the HTML terminal mockups in scripts/mockups. Needs chromium and ImageMagick.
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
for page in fresh card ask controls; do
  shot "$page"
  magick "$tmp/$page.png" -fuzz 4% -trim +repage -bordercolor '#11111b' -border 40 -strip "assets/$page.png"
done
# The flow GIF: type → forging → card. Frames share one canvas size so the GIF doesn't jump.
for page in flow-1 flow-2 flow-3; do
  shot "$page"
  magick "$tmp/$page.png" -fuzz 4% -trim +repage -bordercolor '#11111b' -border 40 "$tmp/$page-t.png"
done
magick "$tmp"/flow-?-t.png -gravity north -background '#11111b' -extent "$(magick "$tmp"/flow-3-t.png -format '%wx%h' info:)" "$tmp/f-%d.png"
magick -delay 220 "$tmp/f-0.png" -delay 140 "$tmp/f-1.png" -delay 480 "$tmp/f-2.png" -loop 0 -resize 50% -layers Optimize assets/flow.gif
rm -rf "$tmp"
