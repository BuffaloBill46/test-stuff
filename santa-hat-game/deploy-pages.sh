#!/usr/bin/env bash
# Publishes the game to the gh-pages branch (served free by GitHub Pages).
#   Site root  -> Santa Hat Legends (Snowball Square + Games tab)
#   /mockups/  -> the four single-player mockups
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=santa-hat-game/mockups
# Never publish a broken page: every game file must parse as a MODULE, the way the browser loads it (2026-10-03: a `//` note
# put mid-line swallowed code; `node --check file.js` passed because it reads .js as an old-style script; the site wouldn't load).
bad=0; for f in "$SRC"/*.js; do node --input-type=module --check < "$f" >/dev/null 2>&1 || { echo "NOT PUBLISHED: $f does not parse as a module"; bad=1; }; done
[ "$bad" = 0 ] || exit 1
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
cp "$SRC/admin.html" "$OUT/admin.html"   # the escrow controls page (not linked from the game)
cp "$SRC/plinko.html" "$OUT/plinko.html" # Snowball Drop preview for Cody (not linked from the game)
cp "$SRC/feedback.html" "$OUT/feedback.html" # focus-group feedback form (TEST_PLAN A; not linked from the game)
cp "$SRC/guide.html" "$OUT/guide.html"       # the player guide (linked from the Play and Games pages)
cp "$SRC"/{kit,plaza,sim,net,online,catalog,tabs,slots,slots3d,games,spin,spin3d,spinui,dropui,runui,credits,fair,house,playcredits,market,sfx,matchmaker,gameserver,wallet,pay,levels,lottery,lotteryui,admin,adminmsg,settings,plinko,plinko-page,plinkoboard,stocking,stockingui,stockingboard,specials,gear,runpick,slowdown,themes,shopui,shoprules,refcore,human,ballfx,ranked,gameclock,seasons,seasonui,buildcheck,moneystrip,coach,callouts,walletline,jackpotbar,sharecard,weekly,celebrate}.js "$SRC/hat-logo.png" "$OUT/"
mkdir -p "$OUT/mockups"
cp "$SRC"/{kit,plaza,themes,village,snowball,bethehat,sleigh,hatchase}.js "$OUT/mockups/"
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'
  cat "$SRC/index.html"; printf '\n</body></html>\n'; } > "$OUT/mockups/index.html"
touch "$OUT/.nojekyll"
# The game's own address (Cody bought santahatgames.com, 2026-10-02). GitHub serves the site there when the branch holds a
# CNAME file, and then forwards the old github.io address to it. Written ONLY once the domain really points at GitHub
# (otherwise the old address would forward to a name that doesn't work yet and the site would go dark).
DOMAIN=santahatgames.com
if nslookup "$DOMAIN" 2>/dev/null | grep -q '185\.199\.10[89]\.153\|185\.199\.11[01]\.153'; then
  echo "$DOMAIN" > "$OUT/CNAME"; echo "custom domain: $DOMAIN"
else echo "custom domain NOT set: $DOMAIN doesn't point at GitHub yet (site stays on github.io)"; fi

# Refuse to publish a build with a missing file: every './x.js' a published page imports must have been copied.
missing=0
for dir in "$OUT" "$OUT/mockups"; do
  for f in $(grep -ohE "(from|import\(|import) *'\./[A-Za-z0-9_-]+\.js'" "$dir"/*.js "$dir"/*.html 2>/dev/null | grep -oE "[A-Za-z0-9_-]+\.js" | sort -u); do
    [ -f "$dir/$f" ] || { echo "MISSING in ${dir#$OUT}/: $f (add it to the cp list in deploy-pages.sh)"; missing=1; }
  done
done
[ "$missing" = 0 ] || { echo "Not published."; exit 1; }

# One BUILD id per publish (2026-10-03): GitHub caches every file up to 10 minutes, so after a publish a browser could mix new
# and old code (a new file asking an old one for something it doesn't have stops the page loading). Every file the code loads
# gets ?v=<build>, so the code is always one matching set; the page's <html data-build> and buildcheck.js get the same id, so
# an old cached page meeting new code reloads once (mockups/buildcheck.js). The id is a fingerprint of what's published, so an
# unchanged publish stays "Nothing changed".
BUILD=$(cat "$OUT"/*.js "$OUT"/*.html "$OUT"/mockups/*.js "$OUT"/mockups/*.html | md5sum | cut -c1-10)
for f in "$OUT"/*.js "$OUT"/*.html "$OUT"/mockups/*.js "$OUT"/mockups/*.html; do
  sed -i -E "s#((from|import\(|import) *'\./[A-Za-z0-9_-]+\.js)'#\1?v=$BUILD'#g; s#(<script type=\"module\" src=\"(\./)?[A-Za-z0-9_-]+\.js)\"#\1?v=$BUILD\"#g; s#data-build=\"dev\"#data-build=\"$BUILD\"#; s#^export const BUILD = 'dev';#export const BUILD = '$BUILD';#" "$f"
done
# and check it took: no file reference left unstamped, the page and buildcheck.js carry the id
left=$(grep -lE "(from|import\(|import) *'\./[A-Za-z0-9_-]+\.js'|<script type=\"module\" src=\"(\./)?[A-Za-z0-9_-]+\.js\"" "$OUT"/*.js "$OUT"/*.html "$OUT"/mockups/*.js "$OUT"/mockups/*.html 2>/dev/null || true)  # (nothing found is the good case)
[ -z "$left" ] || { echo "NOT PUBLISHED: file references without the build id in: $left"; exit 1; }
grep -q "data-build=\"$BUILD\"" "$OUT/index.html" && grep -q "BUILD = '$BUILD'" "$OUT/buildcheck.js" || { echo "NOT PUBLISHED: build id missing from index.html or buildcheck.js"; exit 1; }
echo "build $BUILD"
# DRY_RUN=1: build and stamp, publish nothing (KEEP_DIR=<folder>: keep a copy there to load in a browser first)
[ "${DRY_RUN:-}" = 1 ] && { [ -n "${KEEP_DIR:-}" ] && cp -r "$OUT/." "$KEEP_DIR/" && rm -rf "$KEEP_DIR/.git"; echo "DRY RUN: built, not published${KEEP_DIR:+ (copy in $KEEP_DIR)}"; exit 0; }

git -C "$OUT" add -A
if git -C "$OUT" diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
git -C "$OUT" commit -q -m "Publish game build from $(git rev-parse --short HEAD)"
git -C "$OUT" push -q -u origin gh-pages
echo "Published. Live at https://buffalobill46.github.io/test-stuff/ (Pages must be set to the gh-pages branch once)."
