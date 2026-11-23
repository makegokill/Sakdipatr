const test = require('node:test');
const assert = require('node:assert/strict');
const { makeApp } = require('./harness');
const { g } = makeApp();

test('normalizePhone_', () => {
  assert.equal(g.normalizePhone_('081-234-5678'), '0812345678');
  assert.equal(g.normalizePhone_('+66 81 234 5678'), '0812345678');
  assert.equal(g.normalizePhone_('66812345678'), '0812345678');
  assert.equal(g.normalizePhone_('812345678'), null); // lost leading zero
  assert.equal(g.normalizePhone_('abc'), null);
  assert.equal(g.normalizePhone_(''), null);
  assert.equal(g.normalizePhone_(null), null);
  assert.equal(g.normalizePhone_('02 123 4567'), '021234567'); // landline, 9 digits
});

test('parseAmount_', () => {
  assert.equal(g.parseAmount_('250.50'), 250.5);
  assert.equal(g.parseAmount_(100), 100);
  for (const bad of ['', null, 0, -5, 'x', 1000001, '1.234', NaN, Infinity]) assert.equal(g.parseAmount_(bad), null, String(bad));
});

test('parsePoints_', () => {
  assert.equal(g.parsePoints_('5'), 5);
  assert.equal(g.parsePoints_(-3), -3);
  for (const bad of ['', null, 1.5, 'x', 1e9]) assert.equal(g.parsePoints_(bad), null, String(bad));
});

test('suggestPoints_ floors', () => {
  const s = { bahtPerPoint: 100 };
  assert.equal(g.suggestPoints_(99.99, s), 0);
  assert.equal(g.suggestPoints_(250, s), 2);
});

test('isoBangkok_ is +07:00 wall time, bangkokDay_ crosses midnight correctly', () => {
  assert.equal(g.isoBangkok_(new Date('2026-11-22T03:00:00Z')), '2026-11-22T10:00:00+07:00');
  const late = g.isoBangkok_(new Date('2026-11-22T17:30:00Z')); // 00:30 next day in Bangkok
  assert.equal(late, '2026-11-23T00:30:00+07:00');
  assert.equal(g.bangkokDay_(late), '2026-11-23');
});

test('minutesBetween_ across offsets', () => {
  assert.equal(g.minutesBetween_('2026-11-22T10:00:00+07:00', '2026-11-22T10:20:00+07:00'), 20);
});

test('member code format and normalizeCode_', () => {
  const code = g.makeMemberCode_(Math.random);
  assert.match(code, /^SP[A-HJKMNP-Z2-9]{8}$/);
  assert.equal(g.normalizeCode_(' sp-' + code.slice(2) + ' '), code);
  assert.equal(g.normalizeCode_('SP0OI1LL'), null);
  assert.equal(g.normalizeCode_('0812345678'), null);
});

test('rewardProgress_ hides inactive, sorts, computes remaining', () => {
  const out = g.rewardProgress_(60, [
    { id: 'b', name: 'B', cost: 100, active: true },
    { id: 'a', name: 'A', cost: 50, active: true },
    { id: 'c', name: 'C', cost: 10, active: false }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [
    { id: 'a', name: 'A', cost: 50, remaining: 0, canRedeem: true },
    { id: 'b', name: 'B', cost: 100, remaining: 40, canRedeem: false }
  ]);
});

test('parseSettings_ uses defaults for blank / bad values', () => {
  const s = g.parseSettings_({ baht_per_point: 'abc', shop_name: '  ', max_points_per_entry: '250' });
  assert.equal(s.bahtPerPoint, 100);
  assert.equal(s.shopName, 'Shop Points');
  assert.equal(s.maxPointsPerEntry, 250);
});
