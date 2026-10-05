// EVERY PAGE FILE GETS PUBLISHED (Cody, 2026-10-04 to-do #1). deploy-pages.sh copies a hand-written list of files to the site;
// a page that loads a file not on that list breaks for players. The script itself refuses to publish then (its own check, run
// at publish time); this test checks the same thing on every change, without publishing: it reads the copy list from
// deploy-pages.sh, then follows every `import`, `import()` and <script src> from the published pages and requires each file
// they load to be on the list (and to exist). Run: node tests/publish-list.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url), read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const sh = read('deploy-pages.sh').replace(/\r\n/g, '\n');
// the copy lines: cp "$SRC/a.html" "$OUT/b.html"  and  cp "$SRC"/{a,b,c}.js "$OUT/"  (and the mockups/ sub-folder)
const site = new Map(), sub = new Map(); // published name → source file
for (const line of sh.split('\n').filter((l) => /^cp "\$SRC/.test(l))) {
  const toSub = /"\$OUT\/mockups\//.test(line);
  const one = line.match(/^cp "\$SRC\/([\w.-]+)" "\$OUT\/(?:mockups\/)?([\w.-]+)"/);
  if (one) { (toSub ? sub : site).set(one[2], one[1]); continue; }
  const many = line.match(/^cp "\$SRC"\/\{([^}]+)\}\.(\w+) /); // (other files may follow on the same line, e.g. hat-logo.png)
  if (many) for (const n of many[1].split(',')) (toSub ? sub : site).set(`${n.trim()}.${many[2]}`, `${n.trim()}.${many[2]}`);
}
assert.ok(site.has('index.html') && site.size > 40, `read the publish list from deploy-pages.sh (${site.size} files)`);
// every file the published pages load, followed through the imports
const loads = (src) => [...src.matchAll(/(?:from|import\(|import) *['"]\.\/([\w-]+\.js)['"]|<script[^>]*src=["'](?:\.\/)?([\w-]+\.js)["']/g)].map((m) => m[1] || m[2]);
const problems = [];
for (const [pub, map] of [['site', site], ['mockups/', sub]]) {
  const seen = new Set(), queue = [...map.keys()].filter((n) => /\.(html|js)$/.test(n));
  while (queue.length) {
    const name = queue.shift(); if (seen.has(name)) continue; seen.add(name);
    const src = map.get(name); if (!src) continue;
    const file = new URL(`mockups/${src === 'index.html' && pub === 'mockups/' ? 'index.html' : src}`, ROOT);
    if (!existsSync(file)) { problems.push(`${pub}: ${src} is on the publish list but doesn't exist`); continue; }
    for (const dep of loads(readFileSync(file, 'utf8'))) {
      if (!map.has(dep)) problems.push(`${pub}: ${name} loads ./${dep}, which is NOT on the publish list in deploy-pages.sh`);
      else queue.push(dep);
    }
  }
}
assert.deepEqual(problems, [], 'every file a published page loads is published:\n  ' + problems.join('\n  '));
console.log(`OK: publish list: ${site.size + sub.size} files; every file the published pages load (imports, on-demand imports, scripts) is on it and exists`);
