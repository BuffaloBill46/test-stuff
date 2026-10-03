// Run the offline browser tests on WINDOWS in the real Chrome with the graphics card (~60 fps) instead of WSL's software
// drawing (~3 fps, where one test took 2–12 minutes and page loads timed out). Loaded in front of a test, unchanged:
//   PW=<folder with node_modules/playwright> node --import ./win-chrome.mjs drop-test.mjs
// What it adapts (the tests were written for WSL):
//   - `npm root -g` (where the tests look for Playwright) answers PW's node_modules;
//   - chromium.launch uses the installed Chrome, without the software-drawing switches;
//   - file: URLs' .pathname gives a Windows path (C:\…), so the tests' little web servers find the game's files.
import { createRequire, syncBuiltinESMExports } from 'module'; import path from 'path';
import cp from 'child_process'; import { createHash } from 'crypto'; import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
if (!process.env.PW) throw new Error('set PW to the folder holding node_modules/playwright');
const modules = path.join(process.env.PW, 'node_modules');

// The tests fetch each library/font from the internet with a blocking `curl` on every page load; kept on disk after the first
// time (out/cdn-cache), since those URLs carry fixed versions. Only the plain `curl -sS -L "<url>"` form is cached.
const CACHE = path.resolve('out/cdn-cache'); mkdirSync(CACHE, { recursive: true });
const execSync = cp.execSync;
cp.execSync = (cmd, ...rest) => {
  const c = String(cmd).trim();
  if (c === 'npm root -g') return Buffer.from(modules);
  const m = c.match(/^curl -sS -L "([^"]+)"$/);
  if (m) { const f = path.join(CACHE, createHash('sha1').update(m[1]).digest('hex'));
    if (existsSync(f)) return readFileSync(f);
    const out = execSync(cmd, ...rest); writeFileSync(f, out); return out; }
  return execSync(cmd, ...rest);
};
syncBuiltinESMExports(); // so `import { execSync } from 'child_process'` in the tests sees it too

const { chromium } = require(path.join(modules, 'playwright'));
const launch = chromium.launch.bind(chromium);
chromium.launch = (opts = {}) => launch({ ...opts, channel: 'chrome', args: (opts.args || []).filter((a) => !/swiftshader|use-gl=|use-angle=/.test(a)) });

const desc = Object.getOwnPropertyDescriptor(URL.prototype, 'pathname');
// (not fileURLToPath: it reads .pathname itself, which would loop back here)
const winPath = (p) => decodeURIComponent(p).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
// Only for the tests' own code: Node's loader reads .pathname too and needs the URL form (its caller is a node: frame).
Object.defineProperty(URL.prototype, 'pathname', { ...desc, get() {
  const p = desc.get.call(this); if (this.protocol !== 'file:') return p;
  const caller = (new Error().stack || '').split('\n')[2] || '';
  return caller.includes('node:') ? p : winPath(p);
} });
