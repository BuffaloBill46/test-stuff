#!/usr/bin/env bash
# Publishes the game to the gh-pages branch (served free by GitHub Pages).
#   Site root  -> Snowball Square Online
#   /mockups/  -> the four single-player mockups
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=santa-hat-game/mockups
OUT=$(mktemp -d)
trap 'git worktree remove --force "$OUT" 2>/dev/null || true' EXIT

git fetch -q origin gh-pages 2>/dev/null || true
if git show-ref -q --verify refs/remotes/origin/gh-pages; then
  git worktree add -q -f "$OUT" -B gh-pages origin/gh-pages
  git -C "$OUT" rm -rq --ignore-unmatch .
else
  git worktree add -q --detach "$OUT"
  git -C "$OUT" checkout -q --orphan gh-pages
  git -C "$OUT" rm -rq --cached . && find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
fi

cp "$SRC/online.html" "$OUT/index.html"
cp "$SRC"/{kit,plaza,sim,net,online}.js "$OUT/"
mkdir -p "$OUT/mockups"
cp "$SRC"/{kit,plaza,village,snowball,bethehat,sleigh,hatchase}.js "$OUT/mockups/"
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'
  cat "$SRC/index.html"; printf '\n</body></html>\n'; } > "$OUT/mockups/index.html"
touch "$OUT/.nojekyll"

git -C "$OUT" add -A
if git -C "$OUT" diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
git -C "$OUT" commit -q -m "Publish game build from $(git rev-parse --short HEAD)"
git -C "$OUT" push -q -u origin gh-pages
echo "Published. Live at https://buffalobill46.github.io/test-stuff/ (Pages must be set to the gh-pages branch once)."
