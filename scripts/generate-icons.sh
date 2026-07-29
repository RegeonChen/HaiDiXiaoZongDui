#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_image="$repo_root/art/icon-source.jpg"
build_icon="$repo_root/build/icon.png"
runtime_icon="$repo_root/src/public/icon.png"
favicon="$repo_root/src/public/favicon.png"

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick is required. Install it with: brew install imagemagick" >&2
  exit 1
fi

if [[ ! -f "$source_image" ]]; then
  echo "Missing icon source: $source_image" >&2
  exit 1
fi

mkdir -p "$(dirname "$build_icon")" "$(dirname "$runtime_icon")"

magick "$source_image" \
  -crop 900x900+62+62 +repage \
  -resize 1024x1024 \
  \( -size 1024x1024 xc:none -fill white \
    -draw 'roundrectangle 100,100 924,924 190,190' \) \
  -alpha off -compose CopyOpacity -composite \
  -strip -define png:compression-level=9 -define png:compression-filter=5 \
  "PNG32:$build_icon"

magick "$build_icon" \
  -resize 512x512 \
  -strip -define png:compression-level=9 -define png:compression-filter=5 \
  "PNG32:$runtime_icon"

magick "$build_icon" \
  -resize 128x128 \
  -strip -define png:compression-level=9 -define png:compression-filter=5 \
  "PNG32:$favicon"

node "$repo_root/scripts/verify-icon-assets.cjs"
