export default async (page, label, out) => {
  const st = () => page.evaluate(() => { const d = window.__arcade.game.debug; return { mode: d.mode, score: d.score, stack: d.stack, loose: d.loose.map((h) => (h.spare ? 'spare' : 'mine')) }; });
  await page.waitForTimeout(6000);
  console.log('attract', JSON.stringify(await st()));
  if (label === 'phone') { await page.tap('.go'); await page.evaluate(() => window.__arcade.game.debug.setStack(5)); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}-${label}-play.png` }); return; }
  await page.click('.go'); await page.waitForTimeout(300);
  await page.evaluate(() => window.__arcade.game.debug.setStack(6));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}-${label}-stack.png` });
  // knock every hat off, then do nothing: game must end only after the flying hats are lost
  await page.evaluate(() => { const d = window.__arcade.game.debug; for (let i = 0; i < 6; i++) d.knock(); });
  await page.waitForTimeout(400);
  console.log('all knocked', JSON.stringify(await st()));
  await page.screenshot({ path: `${out}-${label}-knocked.png` });
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(800); const s = await st(); if (s.mode !== 'play') { console.log('ended', JSON.stringify(s), await page.textContent('#card h2')); break; } if (i === 19) console.log('never ended', JSON.stringify(s)); }
};
