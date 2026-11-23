// Google Sheet store. Append-only for Transactions: the code never edits or deletes a row.
var TAB_ = {
  settings: 'Settings', rewards: 'Rewards', staff: 'Staff',
  customers: 'Customers', tx: 'Transactions', balances: 'Balances'
};
var HEADERS_ = {
  Settings: ['key', 'value', 'note'],
  Rewards: ['id', 'name', 'cost', 'active'],
  Staff: ['lineUserId', 'name', 'active'],
  Customers: ['customerId', 'lineUserId', 'displayName', 'phone', 'memberCode', 'createdAt'],
  Transactions: ['txId', 'timestamp', 'customerId', 'type', 'points', 'billAmount', 'billNo',
                 'staffId', 'staffName', 'note', 'refTxId']
};
// Columns that must stay plain text so Sheets never turns them into numbers/dates
// (a phone number loses its leading zero otherwise).
var TEXT_COLS_ = {
  Settings: ['value'],
  Rewards: ['id'],
  Staff: ['lineUserId'],
  Customers: ['customerId', 'lineUserId', 'phone', 'memberCode', 'createdAt'],
  Transactions: ['txId', 'timestamp', 'customerId', 'billNo', 'staffId', 'refTxId']
};

function truthy_(v) {
  var s = String(v).trim().toLowerCase();
  return v === true || s === 'true' || s === 'yes' || s === '1' || s === 'y' || s === 'ใช่';
}

function makeSheetStore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  function sheet(name) {
    var s = ss.getSheetByName(name);
    if (!s) throw appError_('SETUP_REQUIRED', 'ระบบยังไม่ได้ตั้งค่า กรุณาให้เจ้าของร้านรัน setupSheet');
    return s;
  }
  function table(name) {
    var values = sheet(name).getDataRange().getValues();
    if (values.length < 2) return [];
    var head = values[0], out = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r], obj = {}, empty = true;
      for (var c = 0; c < head.length; c++) {
        obj[head[c]] = row[c];
        if (row[c] !== '' && row[c] != null) empty = false;
      }
      if (!empty) out.push(obj);
    }
    return out;
  }
  function str(v) { return v == null ? '' : String(v); }
  function normCustomer(o) {
    return {
      customerId: str(o.customerId), lineUserId: str(o.lineUserId), displayName: str(o.displayName),
      phone: str(o.phone), memberCode: str(o.memberCode), createdAt: str(o.createdAt)
    };
  }
  function normTx(o) {
    return {
      txId: str(o.txId), timestamp: str(o.timestamp), customerId: str(o.customerId), type: str(o.type),
      points: Number(o.points) || 0, billAmount: o.billAmount === '' ? null : Number(o.billAmount),
      billNo: str(o.billNo), staffId: str(o.staffId), staffName: str(o.staffName),
      note: str(o.note), refTxId: str(o.refTxId)
    };
  }
  // appendRow (not getLastRow()+1 writes) so the tab grows past its initial row count.
  function append(name, obj) {
    var h = HEADERS_[name];
    sheet(name).appendRow(h.map(function (k) { return obj[k] == null ? '' : obj[k]; }));
  }
  function customers() { return table(TAB_.customers).map(normCustomer); }
  function firstCustomer(pred) {
    var list = customers();
    for (var i = 0; i < list.length; i++) if (pred(list[i])) return list[i];
    return null;
  }
  function txs() { return table(TAB_.tx).map(normTx); }

  return {
    getSettingsMap: function () {
      var m = {};
      table(TAB_.settings).forEach(function (r) { m[str(r.key)] = r.value; });
      return m;
    },
    getRewards: function () {
      return table(TAB_.rewards).map(function (r) {
        return { id: str(r.id), name: str(r.name), cost: Number(r.cost) || 0, active: truthy_(r.active) };
      }).filter(function (r) { return r.id && r.cost > 0; });
    },
    getStaff: function () {
      return table(TAB_.staff).map(function (r) {
        return { lineUserId: str(r.lineUserId), name: str(r.name), active: truthy_(r.active) };
      });
    },
    findCustomerById: function (id) { return firstCustomer(function (c) { return c.customerId === id; }); },
    findCustomerByLineId: function (id) { return firstCustomer(function (c) { return c.lineUserId === id; }); },
    findCustomerByPhone: function (p) { return firstCustomer(function (c) { return c.phone === p; }); },
    findCustomerByCode: function (code) { return firstCustomer(function (c) { return c.memberCode === code; }); },
    createCustomer: function (c) { append(TAB_.customers, c); return c; },
    appendTx: function (tx) { append(TAB_.tx, tx); return tx; },
    getTx: function (id) {
      var list = txs();
      for (var i = 0; i < list.length; i++) if (list[i].txId === id) return list[i];
      return null;
    },
    listAllTx: txs,
    listTxByCustomer: function (cid) { return txs().filter(function (t) { return t.customerId === cid; }); },
    listTxByDay: function (day) { return txs().filter(function (t) { return t.timestamp.slice(0, 10) === day; }); },
    customerNames: function () {
      var m = {};
      customers().forEach(function (c) { m[c.customerId] = c.displayName; });
      return m;
    }
  };
}

// Run once from the Apps Script editor. Safe to re-run: it never clears existing data.
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS_).forEach(function (name) {
    var s = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = HEADERS_[name];
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
    (TEXT_COLS_[name] || []).forEach(function (col) {
      var idx = h.indexOf(col) + 1;
      s.getRange(1, idx, s.getMaxRows(), 1).setNumberFormat('@');
    });
  });
  var settings = ss.getSheetByName(TAB_.settings);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, 6, 3).setValues([
      ['shop_name', 'Shop Points', 'ชื่อร้าน'],
      ['line_channel_id', '', 'LINE Login channel ID (ตัวเลข)'],
      ['owner_line_user_id', '', 'LINE userId ของเจ้าของร้าน (ดูได้จากหน้า owner.html)'],
      ['baht_per_point', 100, 'ซื้อกี่บาทได้ 1 แต้ม'],
      ['max_points_per_entry', 1000, 'แต้มสูงสุดต่อ 1 รายการ'],
      ['duplicate_window_minutes', 30, 'เตือนถ้าลูกค้าคนเดิมถูกเพิ่มแต้มซ้ำภายในกี่นาที']
    ]);
  }
  var rewards = ss.getSheetByName(TAB_.rewards);
  if (rewards.getLastRow() < 2) {
    rewards.getRange(2, 1, 3, 4).setValues([
      ['R1', 'ส่วนลด 50 บาท', 50, 'TRUE'],
      ['R2', 'ส่วนลด 120 บาท', 100, 'TRUE'],
      ['R3', 'ของสมนาคุณ', 200, 'TRUE']
    ]);
  }
  // Read-only per-customer totals: header row 1 is part of the range, headers=1.
  var bal = ss.getSheetByName(TAB_.balances) || ss.insertSheet(TAB_.balances);
  bal.getRange('A1').setFormula(
    '=QUERY(Transactions!C1:E, "select C, sum(E) where C is not null group by C label sum(E) \'points\'", 1)');
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  SpreadsheetApp.flush();
}
