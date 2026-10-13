#!/usr/bin/env bash
# Regenerates docs/media/dariokart-demo.{mp4,gif} and the README screenshots.
# Requires: a running dev server (npm run dev), ffmpeg, and `npx playwright install chromium`.
set -euo pipefail
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d)
node scripts/demo/record.mjs "$TMP/frames"          # deterministic 30 fps frames
node scripts/demo/audio.mjs "$TMP/frames/cues.json" "$TMP/audio.webm"   # the game's own music + SFX, replayed on the same frames
mkdir -p docs/media
ffmpeg -y -loglevel error -framerate 30 -i "$TMP/frames/f%05d.jpg" -i "$TMP/audio.webm" \
  -c:v libx264 -preset veryslow -crf 30 -tune animation -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -af "loudnorm=I=-16:TP=-1.5:LRA=11" -shortest docs/media/dariokart-demo.mp4
# the README GIF is the action reel, cut from the encoded video (its smoother frames palettise far smaller)
read GIF_START GIF_FRAMES < "$TMP/frames/gif-range.txt"
ffmpeg -y -loglevel error -ss "$(echo "$GIF_START / 30" | bc -l)" -t "$(echo "$GIF_FRAMES / 30" | bc -l)" -i docs/media/dariokart-demo.mp4 \
  -vf "fps=12,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  docs/media/dariokart-demo.gif
for pair in $(cat "$TMP/frames/shots.txt"); do
  ffmpeg -y -loglevel error -i "$TMP/frames/f${pair%%:*}.jpg" -vf scale=960:-1 -q:v 4 "docs/media/shot-${pair##*:}.jpg"
done
[ -n "${KEEP_FRAMES:-}" ] && echo "frames kept in $TMP" || rm -rf "$TMP"
echo "done → docs/media"
