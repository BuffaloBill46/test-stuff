export default async (page, label, out) => {
  const st = () => page.evaluate(() => { const d = window.__arcade.game.debug; return { mode: d.mode, score: d.score, bounces: d.bounces, hat: d.hat.pos.toArray().map((v) => +v.toFixed(1)) }; });
  // attract mode should keep the hat alive on its own and bounce on heads
  await page.waitForTimeout(4000);
  console.log('attract', JSON.stringify(await st()));
  if (label === 'phone') { await page.tap('.go'); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}-${label}-play.png` }); console.log('phone', JSON.stringify(await st())); return; }
  await page.click('.go');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}-${label}-play.png` });
  // no input: pedestal bounce, then shoved off, then the snow -> game over
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(700); const s = await st(); if (s.mode !== 'play') { console.log('ended after idle', JSON.stringify(s)); break; } }
  await page.screenshot({ path: `${out}-${label}-over.png` });
};
