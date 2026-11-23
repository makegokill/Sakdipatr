// Pure helpers: no Sheet, no network. Everything here is unit-tested in Node.

var DEFAULT_SETTINGS_ = {
  shopName: 'Shop Points',
  lineChannelId: '',
  ownerLineUserId: '',
  bahtPerPoint: 100,
  maxPointsPerEntry: 1000,
  duplicateWindowMinutes: 30
};

// rows: { key: value } map straight from the Settings tab (values may be strings).
function parseSettings_(map) {
  function num(k, d) {
    var v = Number(map[k]);
    return isFinite(v) && v > 0 ? v : d;
  }
  function str(k, d) {
    var v = map[k];
    return v == null || String(v).trim() === '' ? d : String(v).trim();
  }
  return {
    shopName: str('shop_name', DEFAULT_SETTINGS_.shopName),
    lineChannelId: str('line_channel_id', ''),
    ownerLineUserId: str('owner_line_user_id', ''),
    bahtPerPoint: num('baht_per_point', DEFAULT_SETTINGS_.bahtPerPoint),
    maxPointsPerEntry: Math.floor(num('max_points_per_entry', DEFAULT_SETTINGS_.maxPointsPerEntry)),
    duplicateWindowMinutes: num('duplicate_window_minutes', DEFAULT_SETTINGS_.duplicateWindowMinutes)
  };
}

// Thai mobile/landline, with or without +66 / 66 prefix. Returns "0XXXXXXXXX" or null.
function normalizePhone_(input) {
  var s = String(input == null ? '' : input).replace(/[\s\-().]/g, '');
  if (s.indexOf('+66') === 0) s = '0' + s.slice(3);
  else if (/^66\d{9}$/.test(s)) s = '0' + s.slice(2);
  return /^0\d{8,9}$/.test(s) ? s : null;
}

// Bill amount in baht: positive, at most 2 decimals, at most 1,000,000.
function parseAmount_(input) {
  if (input === '' || input == null) return null;
  var n = Number(input);
  if (!isFinite(n) || n <= 0 || n > 1000000) return null;
  if (Math.round(n * 100) / 100 !== n) return null;
  return n;
}

// Whole-number points (any sign). Returns null if not a safe integer.
function parsePoints_(input) {
  if (input === '' || input == null) return null;
  var n = Number(input);
  return isFinite(n) && Math.floor(n) === n && Math.abs(n) <= 1000000 ? n : null;
}

function suggestPoints_(bill, settings) {
  return Math.floor(bill / settings.bahtPerPoint);
}

// Bangkok-time ISO string, e.g. 2026-11-22T20:15:30+07:00. No Utilities needed.
function isoBangkok_(date) {
  var t = new Date(date.getTime() + 7 * 3600 * 1000);
  return t.toISOString().slice(0, 19) + '+07:00';
}

function bangkokDay_(iso) {
  return String(iso).slice(0, 10);
}

function minutesBetween_(isoA, isoB) {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / 60000;
}

var CODE_ALPHABET_ = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
function makeMemberCode_(rand) {
  var out = 'SP';
  for (var i = 0; i < 8; i++) out += CODE_ALPHABET_.charAt(Math.floor(rand() * CODE_ALPHABET_.length));
  return out;
}

function normalizeCode_(input) {
  var s = String(input == null ? '' : input).trim().toUpperCase().replace(/[\s\-]/g, '');
  return /^SP[A-Z2-9]{8}$/.test(s) ? s : null;
}

function sumPoints_(txs) {
  var total = 0;
  for (var i = 0; i < txs.length; i++) total += Number(txs[i].points) || 0;
  return total;
}

// rewards: [{id,name,cost,active}] -> with `remaining` points the customer still needs.
function rewardProgress_(balance, rewards) {
  var out = [];
  for (var i = 0; i < rewards.length; i++) {
    var r = rewards[i];
    if (!r.active) continue;
    out.push({
      id: r.id,
      name: r.name,
      cost: r.cost,
      remaining: Math.max(0, r.cost - balance),
      canRedeem: balance >= r.cost
    });
  }
  out.sort(function (a, b) { return a.cost - b.cost; });
  return out;
}

// A tx can be cancelled once: look for a `cancel` entry that points back at it.
function isCancelled_(txId, allTxs) {
  for (var i = 0; i < allTxs.length; i++) {
    if (allTxs[i].type === 'cancel' && allTxs[i].refTxId === txId) return true;
  }
  return false;
}
