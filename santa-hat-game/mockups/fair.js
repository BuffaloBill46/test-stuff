// Provably fair numbers (works in the browser and in node). No game rules here.
// A secret (random bytes) is locked in by publishing its fingerprint (SHA-256 hash): a code that can't be turned back into
// the secret, but anyone can check a revealed secret against it. The play's random numbers come from
// HMAC-SHA256(secret, "playerSeed:playNumber:i"), so neither side alone decides them.
// The ORDER these are used in is Cody's safety rule and lives in house.js: payment, credit spent, THEN the secret.
// Secrets come from crypto.getRandomValues (secure). Never Math.random: it can be predicted.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

// Hashing needs a secure (https) page; say so plainly instead of failing with a cryptic error.
const subtle = () => { if (!globalThis.crypto?.subtle) throw new Error('fair results need a secure (https) page'); return crypto.subtle; };
export function newSeed(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return hex(a); }
export async function fingerprint(secret) { return hex(await subtle().digest('SHA-256', unhex(secret))); }

// `count` uniform numbers in [0, 1), 32 bits each.
export async function numbers(secret, playerSeed, playNo, count) {
  const key = await subtle().importKey('raw', unhex(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = [];
  for (let i = 0; out.length < count; i++) {
    const mac = new Uint8Array(await subtle().sign('HMAC', key, enc.encode(`${playerSeed}:${playNo}:${i}`)));
    for (let j = 0; j + 4 <= mac.length && out.length < count; j += 4) out.push((mac[j] * 2 ** 24 + (mac[j + 1] << 16) + (mac[j + 2] << 8) + mac[j + 3]) / 2 ** 32);
  }
  return out;
}
// Hands the numbers out one at a time. Running out is an error, never a quiet fallback to Math.random.
export function randFrom(nums) {
  let i = 0;
  return () => { if (i >= nums.length) throw new Error('fair: ran out of numbers'); return nums[i++]; };
}
