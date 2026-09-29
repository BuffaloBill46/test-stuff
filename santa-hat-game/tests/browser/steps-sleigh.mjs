export default async (page, label, out) => {
  const st = () => page.evaluate(() => { const d = window.__arcade.game.debug; return { mode: d.mode, score: d.score, lit: d.street.items.filter((i) => i.delivered).length, houses: d.street.items.filter((i) => i.kind === 'house').length, y: +d.y.toFixed(1) }; });
  // attract mode auto-drops when the marker lines up: proves the marker math lands presents
  await page.waitForTimeout(9000);
  console.log('attract after 9s', JSON.stringify(await st()));
  await page.screenshot({ path: `${out}-${label}-attract.png` });
  if (label === 'phone') { await page.tap('.go'); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}-${label}-play.png` }); return; }
  await page.click('.go'); await page.waitForTimeout(300);
  await page.keyboard.down('KeyS'); await page.waitForTimeout(800); await page.keyboard.up('KeyS');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(500); }
  console.log('play', JSON.stringify(await st()));
  await page.screenshot({ path: `${out}-${label}-play.png` });
};
