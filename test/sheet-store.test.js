const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal fake of the Google Sheets API surface the store uses.
function fakeSpreadsheet() {
  const sheets = new Map();
  const mk = (name) => {
    const s = {
      name, rows: [], formats: {}, formulas: {}, frozen: 0,
      getLastRow() { return s.rows.length; },
      getMaxRows() { return 1000; },
      getDataRange() { return { getValues: () => s.rows.map((r) => r.slice()) }; },
      appendRow(r) { s.rows.push(r.slice()); },
      setFrozenRows(n) { s.frozen = n; },
      getRange(a, b, c, d) {
        const rng = {
          setValues(vals) {
            vals.forEach((row, i) => { s.rows[a - 1 + i] = s.rows[a - 1 + i] || []; row.forEach((v, j) => { s.rows[a - 1 + i][b - 1 + j] = v; }); });
            return rng;
          },
          setFontWeight() { return rng; },
          setNumberFormat(f) { s.formats[b] = f; return rng; },
          setFormula(f) { s.formulas[a] = f; return rng; }
        };
        return rng;
      }
    };
    sheets.set(name, s);
    return s;
  };
  const ss = {
    sheets,
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => mk(n),
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name)
  };
  mk('Sheet1');
  return ss;
}

function loadWith(ss) {
  const ctx = vm.createContext({ console, Date, Math, JSON, Object, Number, String, Array, Error, isFinite,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} } });
  for (const f of ['errors.js', 'points.js', 'store-sheet.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'src', f), 'utf8'), ctx);
  return ctx;
}

test('setupSheet creates six tabs, text formats, defaults; re-run keeps data', () => {
  const ss = fakeSpreadsheet();
  const g = loadWith(ss);
  g.setupSheet();
  assert.deepEqual([...ss.sheets.keys()].sort(), ['Balances', 'Customers', 'Rewards', 'Settings', 'Staff', 'Transactions']);
  const cust = ss.getSheetByName('Customers');
  assert.equal(cust.formats[4], '@'); // phone column is plain text
  assert.equal(ss.getSheetByName('Transactions').formats[2], '@'); // timestamp stays a string
  assert.match(ss.getSheetByName('Balances').formulas['A1'], /^=QUERY\(Transactions!C1:E,.*, 1\)$/);
  assert.ok(ss.getSheetByName('Settings').rows.length > 3);
  ss.getSheetByName('Settings').rows[4][1] = 250; // owner edits baht_per_point
  g.setupSheet();
  assert.equal(ss.getSheetByName('Settings').rows[4][1], 250);
});

test('sheet store: customers keep leading-zero phone, tx round-trip, append-only growth', () => {
  const ss = fakeSpreadsheet();
  const g = loadWith(ss);
  g.setupSheet();
  const store = g.makeSheetStore_();
  store.createCustomer({ customerId: 'C-1', lineUserId: 'U1', displayName: 'A', phone: '0812345678', memberCode: 'SPAAAAAAAA', createdAt: '2026-11-22T10:00:00+07:00' });
  assert.equal(store.findCustomerByPhone('0812345678').customerId, 'C-1');
  assert.equal(store.findCustomerByCode('SPAAAAAAAA').lineUserId, 'U1');
  assert.equal(store.findCustomerByLineId('nobody'), null);
  for (let i = 0; i < 1500; i++) { // far beyond the default 1000 rows
    store.appendTx({ txId: 'T-' + i, timestamp: '2026-11-22T10:00:00+07:00', customerId: 'C-1', type: 'earn', points: 1, billAmount: 100, billNo: '', staffId: 'S', staffName: 'n', note: '', refTxId: '' });
  }
  assert.equal(store.listTxByCustomer('C-1').length, 1500);
  assert.equal(store.listTxByDay('2026-11-22').length, 1500);
  assert.equal(store.getTx('T-1499').points, 1);
  assert.equal(store.getTx('T-1499').billNo, '');
  assert.equal(store.customerNames()['C-1'], 'A');
});

test('sheet store: settings, rewards, staff parsing (TRUE/ใช่/blank rows)', () => {
  const ss = fakeSpreadsheet();
  const g = loadWith(ss);
  g.setupSheet();
  const store = g.makeSheetStore_();
  const settings = g.parseSettings_(store.getSettingsMap());
  assert.equal(settings.bahtPerPoint, 100);
  ss.getSheetByName('Rewards').rows.push(['R9', 'X', 5, 'FALSE'], ['', '', '', ''], ['R8', 'Y', 'abc', 'TRUE']);
  const rewards = store.getRewards();
  assert.deepEqual([...rewards.map((r) => r.id)], ['R1', 'R2', 'R3', 'R9']); // R8 dropped: non-numeric cost
  assert.equal(rewards.find((r) => r.id === 'R9').active, false);
  ss.getSheetByName('Staff').rows.push(['U_s', 'สมชาย', 'ใช่'], ['U_t', 'T', 'no']);
  const staff = store.getStaff();
  assert.deepEqual([...staff.map((s) => s.active)], [true, false]);
});

test('sheet store before setupSheet gives a clear SETUP_REQUIRED error', () => {
  const g = loadWith(fakeSpreadsheet());
  const store = g.makeSheetStore_();
  assert.throws(() => store.getRewards(), (e) => e.code === 'SETUP_REQUIRED');
});
