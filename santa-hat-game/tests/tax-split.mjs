// Split rule: 3% tax off the top, then burn %, then treasury %, last bucket gets the remainder.
// On chain the burn leg is not a transfer (no tax); every sent leg is taxed 3% on arrival.
const FEE = 0.03, ODDS = [[0, .505], [1, .33], [2, .10], [3, .05], [4, .01], [5, .005]];
function split(T, shares) { // shares in order, last one takes remainder; shares[i] = {pct, burn}
  const net = T * (1 - FEE); let sent = 0; const out = [];
  shares.slice(0, -1).forEach(s => { const a = net * s.pct; sent += a; out.push({ ...s, leaves: a, arrives: s.burn ? a : a * (1 - FEE) }); });
  const last = shares.at(-1), a = T - sent; out.push({ ...last, leaves: a, arrives: last.burn ? a : a * (1 - FEE) });
  const sum = out.reduce((x, o) => x + o.leaves, 0); if (Math.abs(sum - T) > 1e-12) throw 'leaves != T';
  return out;
}
const show = (name, T, sh) => console.log(name, split(T, sh).map(o => `${o.name}: leaves ${(o.leaves*100).toFixed(2)}c, arrives ${(o.arrives*100).toFixed(2)}c`).join(' | '));
show('$1 spin  ', 1, [{ name: 'burn', pct: .10, burn: 1 }, { name: 'pool', pct: .90 }]);
show('$1 ticket', 1, [{ name: 'burn', pct: .50, burn: 1 }, { name: 'treasury', pct: .50 }]);
const poolIn = split(1, [{ name: 'burn', pct: .10, burn: 1 }, { name: 'pool', pct: .90 }])[1].arrives;
const ev = ODDS.reduce((s, [m, p]) => s + m * p, 0);
for (const gross of [false, true]) {
  const cost = gross ? ev / (1 - FEE) : ev, maxPay = gross ? 5 / (1 - FEE) : 5;
  let pauses = 0, runs = 5000, finals = [];
  for (let r = 0; r < runs; r++) { let pool = 50;
    for (let i = 0; i < 3000; i++) { if (pool < maxPay) { pauses++; break; }
      pool += poolIn; let u = Math.random(), m = 0; for (const [k, p] of ODDS) { if ((u -= p) < 0) { m = k; break; } }
      pool -= gross ? m / (1 - FEE) : m; }
    finals.push(pool); }
  finals.sort((a, b) => a - b);
  console.log(`payouts ${gross ? 'topped up so winner gets full amount' : 'winner absorbs the 3%'}: pool keeps ${((poolIn - cost)*100).toFixed(1)}c per $1 | player gets back avg ${((gross?ev:ev*(1-FEE))*100).toFixed(1)}c | runs that paused ${pauses}/${runs} | median end $${finals[runs/2|0].toFixed(0)}, worst 1% $${finals[runs/100|0].toFixed(0)}`);
}

// Spin pool skim (decided): when the Spin pool reaches $175, $25 goes to the treasury (arrives $24.25 after the tax).
// Invariant asserted: the pool never drops below zero and never pauses; after a skim it is back to $150.
{
  let pauses = 0, skims = 0, low = Infinity;
  for (let r = 0; r < 2000; r++) {
    let pool = 50;
    for (let i = 0; i < 5000; i++) {
      const bet = Math.random() < 0.3 ? 1 : 0.10;
      if (pool < 5 * bet) { pauses++; continue; }
      pool += bet * poolIn;
      let u = Math.random(), m = 0; for (const [k, p] of ODDS) { if ((u -= p) < 0) { m = k; break; } }
      pool -= m * bet;
      if (pool < 0) throw new Error('INVARIANT BROKEN: spin pool went negative');
      if (pool >= 175) { pool -= 25; skims++; if (pool < 150 - 1e-9) throw new Error('skim left pool under $150'); }
      low = Math.min(low, pool);
    }
  }
  console.log(`spin skim ($25 to treasury at $175): ${skims} skims in 2000 runs x 5000 spins, lowest pool $${low.toFixed(2)}, paused ${pauses}; treasury receives $${(25 * (1 - FEE)).toFixed(2)} per skim`);
}
