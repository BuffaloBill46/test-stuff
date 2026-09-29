export default async (page, label, out) => {
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  console.log('headless fps', fps);
  await page.click('.go'); await page.waitForTimeout(300);
  // steer hard right with D the whole time and see if any heads get hit in play mode
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1500); await page.keyboard.up('KeyD');
  let s = await page.evaluate(() => { const d = window.__arcade.game.debug; return { mode: d.mode, bounces: d.bounces, y: +d.hat.pos.y.toFixed(2) }; });
  console.log('after steering', JSON.stringify(s));
  // force a drop far from any head: must end the run
  await page.evaluate(() => { const d = window.__arcade.game.debug; d.hat.pos.set(12, 0.6, 0); d.hat.vel.set(0, -6, 0); d.crowd.forEach((w) => { if (Math.hypot(w.pos.x - 12, w.pos.z) < 2) w.pos.x -= 4; }); });
  await page.waitForTimeout(800);
  s = await page.evaluate(() => { const d = window.__arcade.game.debug; return { mode: d.mode, card: !document.getElementById('card').hidden, h2: document.querySelector('#card h2')?.textContent }; });
  console.log('after forced drop', JSON.stringify(s));
  await page.screenshot({ path: `${out}-${label}-over.png` });
};
