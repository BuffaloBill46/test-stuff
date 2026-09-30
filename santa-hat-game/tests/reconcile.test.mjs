// Books vs wallets: the reconciliation check spots any difference (audit 2026-09-30).
import assert from 'node:assert/strict';
import { reconcile } from '../server/reconcile.js';

// A pool: 1,000 in the books after a $50 win (queued), a skim of 25 (queued) and a top-off of 300 (waiting for Cody).
const base = { bookRaw: 1000, payouts: [{ id: 1, status: 'queued', amount_raw: 50 }], transfers: [{ id: 2, kind: 'skim', status: 'queued', amount_raw: 25 }, { id: 3, kind: 'top-off', status: 'needs_approval', amount_raw: 300 }] };
assert.ok(reconcile({ ...base, walletRaw: 1000 + 50 + 25 - 300 }).ok, 'nothing sent yet: the wallet still holds the win and the skim, and not the top-off');
assert.ok(reconcile({ ...base, walletRaw: 1000 - 300, payouts: [{ id: 1, status: 'sent', amount_raw: 50 }], transfers: [{ id: 2, kind: 'skim', status: 'sent', amount_raw: 25 }, base.transfers[1]] }).ok, 'after sending');
assert.ok(reconcile({ ...base, walletRaw: 1000, payouts: [{ id: 1, status: 'sent', amount_raw: 50 }], transfers: [{ id: 2, kind: 'skim', status: 'sent', amount_raw: 25 }, { id: 3, kind: 'top-off', status: 'sent', amount_raw: 300 }] }).ok, 'all settled: books = wallet');
const off = reconcile({ ...base, walletRaw: 1000 + 50 + 25 - 300 - 7 });
assert.equal(off.ok, false); assert.equal(off.drift, -7, 'SANTA missing from the wallet is caught, to the unit');
assert.ok(reconcile({ ...base, walletRaw: 1000 + 25 - 300, sendingLanded: new Set([1]), payouts: [{ id: 1, status: 'sending', amount_raw: 50 }] }).ok, 'a payout that landed but isn\'t marked yet is counted as sent');
console.log('OK: reconciliation: books = wallet + everything still owed; any drift is caught to the smallest unit');
