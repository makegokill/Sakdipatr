// Loads the Apps Script files (shared global scope, no modules) into one VM context,
// exactly how Apps Script runs them, with a memory store and a fake clock.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'backend', 'src');
const FILES = ['errors.js', 'points.js', 'store-memory.js', 'store-sheet.js', 'auth.js',
  'actions-customer.js', 'actions-staff.js', 'actions-owner.js', 'main.js'];

function load() {
  const ctx = vm.createContext({ console, Date, Math, JSON, Object, Number, String, Array, Error, isFinite });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

const OWNER = 'U_owner', STAFF1 = 'U_staff1', STAFF2 = 'U_staff2', CUST1 = 'U_cust1', CUST2 = 'U_cust2';

function makeApp(opts = {}) {
  const g = load();
  let nowMs = Date.parse(opts.start || '2026-11-22T03:00:00Z'); // 10:00 Bangkok
  let n = 0;
  const store = g.makeMemoryStore_({
    settings: {
      shop_name: 'ร้านทดสอบ', line_channel_id: '123', owner_line_user_id: OWNER,
      baht_per_point: 100, max_points_per_entry: 500, duplicate_window_minutes: 30
    },
    rewards: [
      { id: 'R1', name: 'ส่วนลด 50', cost: 50, active: true },
      { id: 'R2', name: 'ของแถม', cost: 100, active: true },
      { id: 'R3', name: 'เลิกขาย', cost: 10, active: false }
    ],
    staff: [
      { lineUserId: STAFF1, name: 'สมชาย', active: true },
      { lineUserId: STAFF2, name: 'สมหญิง', active: false }
    ]
  });
  const env = {
    store,
    now: () => new Date(nowMs),
    random: (() => { let s = opts.seed || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(),
    newId: (p) => `${p}-${++n}`,
    verifyToken: (tok) => {
      if (tok === 'expired') throw g.appError_('TOKEN_EXPIRED', 'x');
      if (!tok || !tok.startsWith('tok:')) throw g.appError_('UNAUTHENTICATED', 'x');
      return { userId: tok.slice(4), name: 'name-' + tok.slice(4) };
    },
    withLock: (fn) => fn()
  };
  const call = (as, action, params = {}) =>
    JSON.parse(JSON.stringify(g.handleRequest_(env, JSON.stringify({ action, idToken: as && 'tok:' + as, ...params }))));
  return { g, env, store, call, advance: (min) => { nowMs += min * 60000; }, setNow: (iso) => { nowMs = Date.parse(iso); } };
}

module.exports = { makeApp, OWNER, STAFF1, STAFF2, CUST1, CUST2 };
