#!/bin/bash
# Builds a 9:16 Reel (1080x1920, 30 fps, H.264 + silent audio track) from photos and transparent text layers.
#
# Usage: make-reel.sh <layers-dir> <output.mp4> <photo1> <photo2> ... <photoN>
#   <layers-dir> holds s1.png .. sN.png (transparent text layers, one per photo), shade.png (dark gradient)
#   and s<N+1>.png (opaque end card, shown 3.5 s). Photos are names in marketing/photos without .jpg.
# Each photo scene lasts 3 s with a slow zoom; scenes cross-fade for 0.4 s. Music is added in Instagram.
set -euo pipefail
LAYERS="$(cd "$1" && pwd)"; OUT="$2"; shift 2
PHOTOS_DIR="$(cd "$(dirname "$0")/../photos" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SCENE=3; FADE=0.4; END=3.5

n=0
for photo in "$@"; do
  n=$((n + 1))
  ffmpeg -y -loglevel error -i "$PHOTOS_DIR/$photo.jpg" -loop 1 -t $SCENE -i "$LAYERS/shade.png" -loop 1 -t $SCENE -i "$LAYERS/s$n.png" \
    -filter_complex "[0]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='1+0.0009*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$((SCENE * 30)):s=1080x1920:fps=30[bg];[2]format=rgba,fade=in:st=0.25:d=0.5:alpha=1[t];[bg][1]overlay[b];[b][t]overlay,format=yuv420p" \
    -t $SCENE -r 30 -c:v libx264 -crf 18 "$TMP/clip$n.mp4"
done
n=$((n + 1))
ffmpeg -y -loglevel error -loop 1 -t $END -i "$LAYERS/s$n.png" -vf "scale=1080:1920,format=yuv420p" -r 30 -c:v libx264 -crf 18 "$TMP/clip$n.mp4"

inputs=(); filter=""; prev="0"
for i in $(seq 1 $n); do inputs+=(-i "$TMP/clip$i.mp4"); done
for i in $(seq 1 $((n - 1))); do
  offset=$(echo "$i * ($SCENE - $FADE)" | bc)
  label="x$i"
  filter+="[$prev][$i]xfade=transition=fade:duration=$FADE:offset=$offset[$label];"
  prev="$label"
done
total=$(echo "($n - 1) * ($SCENE - $FADE) + $END" | bc)
ffmpeg -y -loglevel error "${inputs[@]}" -f lavfi -t "$total" -i anullsrc=r=44100:cl=stereo \
  -filter_complex "${filter}[$prev]format=yuv420p[v]" -map "[v]" -map "$n:a" \
  -c:v libx264 -crf 20 -preset slow -c:a aac -shortest -movflags +faststart "$OUT"
echo "built $OUT (${total}s)"
