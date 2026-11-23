const test = require('node:test');
const assert = require('node:assert/strict');
const { makeApp, OWNER, STAFF1, STAFF2, CUST1, CUST2 } = require('./harness');

function setup() {
  const app = makeApp();
  const r1 = app.call(CUST1, 'register', { phone: '081-111-1111', name: 'ลูกค้า 1' });
  const r2 = app.call(CUST2, 'register', { phone: '0822222222' });
  assert.ok(r1.ok && r2.ok, JSON.stringify([r1, r2]));
  return { app, c1: r1.data, c2: r2.data };
}
const earn = (app, c, extra = {}) =>
  app.call(STAFF1, 'addPoints', { customerId: c.customerId, billAmount: 300, points: 3, ...extra });

test('auth: missing / bad / expired token and unknown action', () => {
  const { app } = setup();
  assert.equal(app.call(null, 'getCard').error.code, 'UNAUTHENTICATED');
  assert.equal(app.call(CUST1, 'nope').error.code, 'BAD_REQUEST');
  assert.equal(app.call(CUST1, 'constructor').error.code, 'BAD_REQUEST');
  const expired = JSON.parse(JSON.stringify(app.g.handleRequest_(app.env, JSON.stringify({ action: 'getCard', idToken: 'expired' }))));
  assert.equal(expired.error.code, 'TOKEN_EXPIRED');
  assert.equal(JSON.parse(JSON.stringify(app.g.handleRequest_(app.env, 'not json'))).error.code, 'BAD_REQUEST');
});

test('roles: customers cannot use staff/owner actions; inactive staff is a customer', () => {
  const { app, c1 } = setup();
  assert.equal(app.call(CUST1, 'lookup', { query: '0822222222' }).error.code, 'FORBIDDEN');
  assert.equal(app.call(STAFF2, 'lookup', { query: '0822222222' }).error.code, 'FORBIDDEN');
  assert.equal(app.call(STAFF1, 'ownerDay').error.code, 'FORBIDDEN');
  assert.equal(app.call(STAFF1, 'ownerAdjust', { customerId: c1.customerId, points: 1, reason: 'x' }).error.code, 'FORBIDDEN');
  assert.equal(app.call(OWNER, 'whoami').data.role, 'owner');
  assert.equal(app.call(STAFF1, 'whoami').data.role, 'staff');
  assert.equal(app.call(CUST1, 'whoami').data.role, 'customer');
});

test('register: validates phone, rejects duplicate phone, is idempotent per LINE user', () => {
  const app = makeApp();
  assert.equal(app.call(CUST1, 'getCard').error.code, 'NOT_REGISTERED');
  assert.equal(app.call(CUST1, 'register', { phone: '123' }).error.code, 'BAD_PHONE');
  const a = app.call(CUST1, 'register', { phone: '+66811111111' });
  assert.equal(a.data.phone, '0811111111');
  assert.match(a.data.memberCode, /^SP[A-Z2-9]{8}$/);
  assert.equal(app.call(CUST2, 'register', { phone: '0811111111' }).error.code, 'PHONE_TAKEN');
  const again = app.call(CUST1, 'register', { phone: '0899999999' });
  assert.equal(again.data.memberCode, a.data.memberCode); // existing member: phone not changed
  assert.equal(again.data.phone, '0811111111');
});

test('lookup by phone and by member code (case/space tolerant)', () => {
  const { app, c1 } = setup();
  assert.equal(app.call(STAFF1, 'lookup', { query: '081 111 1111' }).data.customerId, c1.customerId);
  assert.equal(app.call(STAFF1, 'lookup', { query: ' ' + c1.memberCode.toLowerCase() }).data.customerId, c1.customerId);
  assert.equal(app.call(STAFF1, 'lookup', { query: '0899999999' }).error.code, 'NOT_FOUND');
  assert.equal(app.call(STAFF1, 'lookup', { query: 'garbage' }).error.code, 'NOT_FOUND');
});

test('addPoints: happy path updates balance, card and rewards', () => {
  const { app, c1 } = setup();
  const r = earn(app, c1, { billAmount: 5000, points: 50 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.balance, 50);
  const card = app.call(CUST1, 'getCard').data;
  assert.equal(card.points, 50);
  assert.equal(card.history[0].type, 'earn');
  assert.deepEqual(JSON.parse(JSON.stringify(card.rewards.map((x) => [x.id, x.remaining, x.canRedeem]))), [['R1', 0, true], ['R2', 50, false]]);
});

test('addPoints: validation', () => {
  const { app, c1 } = setup();
  const bad = (p) => app.call(STAFF1, 'addPoints', { customerId: c1.customerId, billAmount: 300, points: 3, ...p }).error.code;
  assert.equal(bad({ billAmount: 'x' }), 'BAD_AMOUNT');
  assert.equal(bad({ billAmount: 0 }), 'BAD_AMOUNT');
  assert.equal(bad({ points: 0 }), 'BAD_POINTS');
  assert.equal(bad({ points: -3 }), 'BAD_POINTS');
  assert.equal(bad({ points: 1.5 }), 'BAD_POINTS');
  assert.equal(bad({ points: 501, billAmount: 99999, confirmed: true }), 'BAD_POINTS'); // above max_points_per_entry
  assert.equal(bad({ customerId: 'nope' }), 'NOT_FOUND');
  assert.equal(app.store.listAllTx().length, 0);
});

test('addPoints: more than suggested needs confirmation, then goes through', () => {
  const { app, c1 } = setup();
  const first = earn(app, c1, { points: 10 }); // suggested 3
  assert.equal(first.error.code, 'NEEDS_CONFIRMATION');
  assert.equal(first.error.extra.issues[0].type, 'EXTRA_POINTS');
  assert.equal(first.error.extra.issues[0].suggested, 3);
  assert.equal(app.store.listAllTx().length, 0); // nothing written yet
  const ok = earn(app, c1, { points: 10, confirmed: true });
  assert.equal(ok.data.balance, 10);
});

test('addPoints: repeat entry within 30 min warns; after 31 min does not', () => {
  const { app, c1 } = setup();
  assert.equal(earn(app, c1).ok, true);
  app.advance(10);
  const warn = earn(app, c1);
  assert.equal(warn.error.code, 'NEEDS_CONFIRMATION');
  assert.equal(warn.error.extra.issues[0].type, 'RECENT_ENTRY');
  assert.equal(earn(app, c1, { confirmed: true }).ok, true);
  app.advance(31);
  assert.equal(earn(app, c1).ok, true);
});

test('addPoints: repeated bill number warns, even for another customer; cancelled bill is reusable', () => {
  const { app, c1, c2 } = setup();
  const a = earn(app, c1, { billNo: 'INV-9' });
  assert.equal(a.ok, true);
  const dup = earn(app, c2, { billNo: 'INV-9' });
  assert.equal(dup.error.code, 'NEEDS_CONFIRMATION');
  assert.equal(dup.error.extra.issues[0].type, 'DUPLICATE_BILL');
  assert.equal(app.call(STAFF1, 'cancel', { txId: a.data.txId }).ok, true);
  assert.equal(earn(app, c2, { billNo: 'INV-9' }).ok, true);
});

test('redeem: deducts, blocks when short, blocks inactive/unknown reward', () => {
  const { app, c1 } = setup();
  earn(app, c1, { billAmount: 6000, points: 60 });
  const short = app.call(STAFF1, 'redeem', { customerId: c1.customerId, rewardId: 'R2' });
  assert.equal(short.error.code, 'INSUFFICIENT_POINTS');
  const ok = app.call(STAFF1, 'redeem', { customerId: c1.customerId, rewardId: 'R1' });
  assert.equal(ok.data.balance, 10);
  assert.equal(app.call(STAFF1, 'redeem', { customerId: c1.customerId, rewardId: 'R3' }).error.code, 'NOT_FOUND');
  assert.equal(app.call(STAFF1, 'redeem', { customerId: c1.customerId, rewardId: 'zzz' }).error.code, 'NOT_FOUND');
  assert.equal(app.call(CUST1, 'getCard').data.points, 10);
});

test('cancel: own entry, same day, once; reverses points; log stays append-only', () => {
  const { app, c1 } = setup();
  const t = earn(app, c1);
  assert.equal(app.call(CUST1, 'cancel', { txId: t.data.txId }).error.code, 'FORBIDDEN');
  const c = app.call(STAFF1, 'cancel', { txId: t.data.txId });
  assert.equal(c.data.balance, 0);
  assert.equal(app.call(STAFF1, 'cancel', { txId: t.data.txId }).error.code, 'ALREADY_CANCELLED');
  const txs = app.store.listAllTx();
  assert.deepEqual(JSON.parse(JSON.stringify(txs.map((x) => [x.type, x.points]))), [['earn', 3], ['cancel', -3]]);
  assert.equal(txs[1].refTxId, t.data.txId);
});

test('cancel: staff cannot cancel someone else\'s entry; owner can; next day is too late', () => {
  const { app, c1 } = setup();
  const t = earn(app, c1);
  app.store.appendTx({ ...app.store.getTx(t.data.txId), txId: 'T-x', staffId: 'U_other' }); // someone else's entry
  assert.equal(app.call(STAFF1, 'cancel', { txId: 'T-x' }).error.code, 'FORBIDDEN');
  assert.equal(app.call(OWNER, 'cancel', { txId: 'T-x' }).ok, true);
  app.setNow('2026-11-22T17:30:00Z'); // 00:30 next day in Bangkok
  assert.equal(app.call(STAFF1, 'cancel', { txId: t.data.txId }).error.code, 'TOO_LATE');
});

test('cancel: refused when it would make the balance negative', () => {
  const { app, c1 } = setup();
  const t = earn(app, c1, { billAmount: 5000, points: 50 });
  app.call(STAFF1, 'redeem', { customerId: c1.customerId, rewardId: 'R1' });
  assert.equal(app.call(STAFF1, 'cancel', { txId: t.data.txId }).error.code, 'INSUFFICIENT_POINTS');
});

test('cancel: cannot cancel a cancel or an adjustment', () => {
  const { app, c1 } = setup();
  const t = earn(app, c1);
  const c = app.call(STAFF1, 'cancel', { txId: t.data.txId });
  assert.equal(app.call(STAFF1, 'cancel', { txId: c.data.txId }).error.code, 'NOT_FOUND');
});

test('myToday lists only own entries from today with cancelled flag', () => {
  const { app, c1 } = setup();
  const t = earn(app, c1);
  app.advance(40);
  earn(app, c1, { billNo: 'B2' });
  app.call(STAFF1, 'cancel', { txId: t.data.txId });
  const list = app.call(STAFF1, 'myToday').data.entries;
  assert.equal(list.length, 2);
  assert.equal(list.find((e) => e.txId === t.data.txId).cancelled, true);
  assert.equal(list.every((e) => e.type === 'earn'), true);
});

test('owner adjust: two-step confirm shows new balance, needs reason, never below zero', () => {
  const { app, c1 } = setup();
  earn(app, c1);
  const p = { customerId: c1.customerId, points: 7, reason: 'แก้ไขให้ลูกค้า' };
  assert.equal(app.call(OWNER, 'ownerAdjust', { ...p, reason: ' ' }).error.code, 'REASON_REQUIRED');
  assert.equal(app.call(OWNER, 'ownerAdjust', { ...p, points: 0 }).error.code, 'BAD_POINTS');
  const ask = app.call(OWNER, 'ownerAdjust', p);
  assert.equal(ask.error.code, 'NEEDS_CONFIRMATION');
  assert.equal(ask.error.extra.issues[0].newBalance, 10);
  assert.equal(app.store.listAllTx().length, 1);
  assert.equal(app.call(OWNER, 'ownerAdjust', { ...p, confirmed: true }).data.balance, 10);
  assert.equal(app.call(OWNER, 'ownerAdjust', { ...p, points: -11, confirmed: true }).error.code, 'INSUFFICIENT_POINTS');
  assert.equal(app.call(OWNER, 'ownerAdjust', { ...p, points: -10, confirmed: true }).data.balance, 0);
});

test('ownerDay: totals ignore cancelled entries; date validated', () => {
  const { app, c1, c2 } = setup();
  earn(app, c1, { billAmount: 5000, points: 50 });
  const b = earn(app, c2, { billAmount: 2000, points: 20 });
  app.call(STAFF1, 'redeem', { customerId: c1.customerId, rewardId: 'R1' });
  app.call(STAFF1, 'cancel', { txId: b.data.txId });
  const d = app.call(OWNER, 'ownerDay', { date: '2026-11-22' }).data;
  assert.deepEqual(d.totals, { earned: 50, redeemed: 50 });
  assert.equal(d.entries.length, 4);
  assert.equal(app.call(OWNER, 'ownerDay', { date: '22/11/2026' }).error.code, 'BAD_DATE');
  assert.equal(app.call(OWNER, 'ownerDay', { date: '2026-01-01' }).data.entries.length, 0);
});

test('unexpected exceptions are hidden behind a generic error', () => {
  const { app } = setup();
  app.store.getRewards = () => { throw new Error('secret db detail'); };
  const orig = console.error; console.error = () => {};
  const r = app.call(CUST1, 'getCard');
  console.error = orig;
  assert.equal(r.error.code, 'INTERNAL');
  assert.doesNotMatch(JSON.stringify(r), /secret/);
});

test('write actions run under the lock', () => {
  const { app, c1 } = setup();
  let locks = 0;
  const orig = app.env.withLock;
  app.env.withLock = (fn) => { locks++; return orig(fn); };
  earn(app, c1);
  app.call(STAFF1, 'lookup', { query: c1.memberCode });
  assert.equal(locks, 1);
});
