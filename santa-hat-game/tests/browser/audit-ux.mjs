// Play-experience audit: every tab at 5 screen sizes. Mechanical checks only (a person still has to judge feel):
// sideways overflow, tap targets under 40 px, low text contrast (WCAG AA 4.5:1 for small text), dialogs that don't fit,
// buttons without an accessible name, console errors, and download size. Writes out/audit-ux.json.
import { createRequire } from 'module'; import { readFileSync, existsSync, writeFileSync } from 'fs'; import { execSync } from 'child_process'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = new URL('../../mockups', import.meta.url).pathname;
const SIZES = [['phone-320', 320, 640], ['phone-360', 360, 760], ['phone-390', 390, 844], ['tablet', 768, 1024], ['desktop', 1366, 860]];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { issues: [], bytes: 0 };
for (const [label, w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 }); const errors = [];
  await ctx.route('**/*', async (route) => { const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/three@')) return route.fulfill({ body: readFileSync(path.resolve('node_modules/three/build', url.split('/build/')[1])), contentType: 'text/javascript' });
    if (/cdn\.jsdelivr\.net\/npm\/|fonts\.googleapis|fonts\.gstatic/.test(url)) { try { return route.fulfill({ body: execSync(`curl -sS -L "${url}"`, { maxBuffer: 1e8 }), contentType: url.includes('googleapis') ? 'text/css' : url.includes('gstatic') ? 'font/woff2' : 'text/javascript' }); } catch { return route.abort(); } }
    if (url.startsWith('http://localhost/')) { const p = url.replace('http://localhost/', '').split(/[?#]/)[0], f = path.join(ROOT, p); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' }); return route.fulfill({ body: readFileSync(f), contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.png') ? 'image/png' : 'text/html' }); }
    return route.fulfill({ status: 503, body: '' }); });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/503/.test(m.text())) errors.push(m.text()); });
  if (label === 'desktop') page.on('response', async (r) => { try { report.bytes += (await r.body()).length; } catch {} });
  await page.goto('http://localhost/online.html?net=local', { timeout: 90000 }); await page.waitForFunction(() => window.__sq, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  for (const tab of ['play', 'games', 'store', 'avatar', 'ranks']) {
    await page.evaluate((t) => document.querySelector('#t-' + t).click(), tab); await page.waitForTimeout(tab === 'games' ? 4000 : 1200);
    const found = await page.evaluate(() => {
      const out = [], vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
      const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] === undefined ? 1 : +m[3] }; };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, L = lum(c); if (L && L.a > 0.6) return L.l; } return lum('rgb(18,24,48)').l; };
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ kind: 'overflow', what: 'page is wider than the screen' });
      const pages = document.querySelector('#pages'); if (pages && pages.scrollWidth > pages.clientWidth + 1) out.push({ kind: 'overflow', what: 'tab content wider than the screen' });
      for (const el of document.querySelectorAll('button, [role=tab], a[href], input, summary, select')) {
        if (!vis(el) || el.disabled) continue; const r = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') || el.textContent || el.title || el.value || '').trim();
        if (!name) out.push({ kind: 'no-name', what: el.outerHTML.slice(0, 80) });
        if ((r.width < 40 || r.height < 40) && innerWidth < 800 && !el.closest('.strip, .examples, #payLines')) out.push({ kind: 'small-tap', what: `${name.slice(0, 30) || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}` });
        if (r.right > innerWidth + 1 || r.left < -1) out.push({ kind: 'offscreen', what: name.slice(0, 40) });
      }
      for (const el of document.querySelectorAll('#pages p, #pages span, #pages small, #pages li, #pages b, #pages i, #pages em, #nav *')) {
        if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el), fg = lum(s.color); if (!fg) continue;
        const bg = bgOf(el), ratio = (Math.max(fg.l, bg) + 0.05) / (Math.min(fg.l, bg) + 0.05);
        if (ratio < 4.5 && parseFloat(s.fontSize) < 18.6) out.push({ kind: 'contrast', what: `"${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1 (${s.color})` });
      }
      return out;
    });
    for (const f of found) report.issues.push({ size: label, tab, ...f });
  }
  // Dialogs: the buy confirm and how-to-win must fit the screen.
  await page.evaluate(() => document.querySelector('#t-games').click()); await page.waitForTimeout(1500);
  for (const [open, sel] of [[() => document.querySelector('#slots [data-run="5"]').click(), '#buyDlg'], [() => document.querySelector('#howBtn').click(), '#howDlg']]) {
    await page.evaluate(open); await page.waitForTimeout(500);
    const fit = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= -1; }, sel);
    if (!fit) report.issues.push({ size: label, tab: 'games', kind: 'dialog', what: sel + ' does not fit the screen' });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (await page.evaluate((s) => document.querySelector(s).open, sel)) report.issues.push({ size: label, tab: 'games', kind: 'keyboard', what: sel + ' does not close with Escape' });
  }
  for (const e of [...new Set(errors)]) report.issues.push({ size: label, kind: 'error', what: e.slice(0, 160) });
  await ctx.close();
}
await browser.close();
writeFileSync('out/audit-ux.json', JSON.stringify(report, null, 1));
const count = {}; for (const i of report.issues) count[i.kind] = (count[i.kind] || 0) + 1;
console.log('issues by kind:', JSON.stringify(count), '| desktop download:', (report.bytes / 1e6).toFixed(2), 'MB');
const uniq = [...new Map(report.issues.map((i) => [i.kind + i.what, i])).values()];
for (const i of uniq.slice(0, 60)) console.log(`${i.kind.padEnd(10)} ${String(i.size).padEnd(10)} ${String(i.tab || '').padEnd(7)} ${i.what}`);
