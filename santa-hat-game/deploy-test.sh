#!/usr/bin/env bash
# Publishes the game to the TEST SITE, https://test.santahatgames.com (Cody 2026-10-05, to-do #11): the same build as the main
# site (deploy-pages.sh in DRY_RUN mode: every check and the build id), copied to the Droplet, where Caddy serves it and passes
# /api to the TEST game server (devnet: test SANTA, no real value). Changes go here first; santahatgames.com is untouched.
# Not indexed by search engines (robots.txt + a noindex header in Caddy). Run: bash santa-hat-game/deploy-test.sh
set -euo pipefail
cd "$(dirname "$0")"
KEY=C:/santa-devnet-keys/santa-droplet; HOST=root@147.182.219.161
DIR=$(mktemp -d); trap 'rm -rf "$DIR"' EXIT
DRY_RUN=1 KEEP_DIR="$DIR" bash deploy-pages.sh | grep -E "^build|NOT|MISSING" || true
[ -f "$DIR/index.html" ] && grep -q 'data-build="[0-9a-f]\{10\}"' "$DIR/index.html" || { echo "NOT PUBLISHED: the build failed"; exit 1; }
rm -f "$DIR/CNAME" "$DIR/.nojekyll"
printf 'User-agent: *\nDisallow: /\n' > "$DIR/robots.txt"
# copy as a new folder, then swap it in at once (a player never loads half an old build and half a new one)
tar -C "$DIR" -czf - . | ssh -i "$KEY" -o BatchMode=yes "$HOST" 'set -e; rm -rf /var/www/santa-test.new; mkdir -p /var/www/santa-test.new;
  tar -xzf - -C /var/www/santa-test.new; chmod -R a+rX /var/www/santa-test.new;
  rm -rf /var/www/santa-test.old; [ -d /var/www/santa-test ] && mv /var/www/santa-test /var/www/santa-test.old; mv /var/www/santa-test.new /var/www/santa-test'
echo "Published to the TEST site: https://test.santahatgames.com ($(grep -o 'data-build="[0-9a-f]*"' "$DIR/index.html"))"
