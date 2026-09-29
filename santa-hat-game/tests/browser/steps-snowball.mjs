export default async (page, label, out) => {
  const tap = label === 'phone';
  if (tap) await page.tap('.go'); else await page.click('.go');
  await page.waitForTimeout(300);
  const st = () => page.evaluate(() => { const d = window.__arcade.game.debug; return { mode: d.mode, hat: d.hat.state, holder: d.hat.holder?.isPlayer ? 'player' : d.hat.holder ? 'bot' : null, score: { ...d.score }, ammo: d.player.ammo, p: d.player.pos.toArray().map((v) => +v.toFixed(1)) }; });
  if (tap) {
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${out}-${label}-play.png` });
    console.log('phone state', JSON.stringify(await st()));
    return;
  }
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1300); await page.keyboard.up('KeyW');
  console.log('after walking to pedestal', JSON.stringify(await st()));
  await page.mouse.move(900, 300); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(2500);
  console.log('after 2.5s', JSON.stringify(await st()));
  await page.screenshot({ path: `${out}-${label}-play.png` });
  await page.evaluate(() => { const d = window.__arcade.game.debug; if (d.hat.state !== 'head') { d.hat.state = 'head'; d.hat.holder = d.player; } d.knock(); });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}-${label}-air.png` });
  console.log('knocked', JSON.stringify(await st()));
  await page.waitForTimeout(3000);
  console.log('3s after knock', JSON.stringify(await st()));
  await page.evaluate(() => { window.__arcade.game.debug.time = 0.05; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}-${label}-over.png` });
  console.log('end', JSON.stringify(await st()));
};
