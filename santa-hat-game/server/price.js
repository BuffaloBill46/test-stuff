// SERVER: the SANTA price the game uses = the middle value (median) of the last 10 minutes of samples (audit 2026-09-30).
// A sample is taken at most once a minute. One live reading can't move it much: to shift the median, a manipulated price
// has to hold for about 5 minutes, which costs far more than it could win.
export const WINDOW_MIN = 10, SAMPLE_EVERY_S = 60;

export function makePrice({ db, livePrice, now = () => Date.now() }) {
  return async function price() {
    const [last] = await db.query('select extract(epoch from at) * 1000 as t from public.price_samples order by at desc limit 1');
    if (!last || now() - Number(last.t) >= SAMPLE_EVERY_S * 1000) {
      try { const p = await livePrice(); await db.query('insert into public.price_samples (at, usd) values ($1, $2) on conflict do nothing', [new Date(now()).toISOString(), p.usd]); }
      catch (e) { if (!last) throw e; } // no fresh reading: keep using recent samples
    }
    const rows = await db.query(`select usd from public.price_samples where at > $1 order by usd`, [new Date(now() - WINDOW_MIN * 60_000).toISOString()]);
    if (!rows.length) throw new Error('no recent SANTA price');
    const v = rows.map((r) => +r.usd), mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return { usd: mid, samples: v.length };
  };
}
