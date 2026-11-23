// Web-app entry. One JSON endpoint; the front end POSTs text/plain (no CORS preflight).

var ACTIONS_ = {
  whoami:       { role: 'any',   fn: whoami_ },
  register:     { role: 'any',   fn: customerRegister_ },
  getCard:      { role: 'any',   fn: customerCard_ },
  lookup:       { role: 'staff', fn: staffLookup_, write: false },
  addPoints:    { role: 'staff', fn: staffAddPoints_, write: true },
  redeem:       { role: 'staff', fn: staffRedeem_, write: true },
  cancel:       { role: 'staff', fn: staffCancel_, write: true },
  myToday:      { role: 'staff', fn: staffMyToday_ },
  ownerDay:     { role: 'owner', fn: ownerDay_ },
  ownerAdjust:  { role: 'owner', fn: ownerAdjust_, write: true }
};
// register writes too (it creates a customer), so serialise it as well.
ACTIONS_.register.write = true;

function handleRequest_(env, raw) {
  try {
    var params;
    try { params = JSON.parse(raw); } catch (e) { throw appError_('BAD_REQUEST', 'คำขอไม่ถูกต้อง'); }
    var action = ACTIONS_[params && params.action];
    if (!action || !Object.prototype.hasOwnProperty.call(ACTIONS_, params.action)) {
      throw appError_('BAD_REQUEST', 'ไม่รู้จักคำสั่งนี้');
    }
    var settings = parseSettings_(env.store.getSettingsMap());
    var user = env.verifyToken(params.idToken, settings);
    var staffList = env.store.getStaff();
    var role = roleOf_(user.userId, settings, staffList);
    var staffName = user.name;
    staffList.forEach(function (s) { if (s.lineUserId === user.userId && s.name) staffName = s.name; });
    var ctx = { env: env, params: params, settings: settings, user: user, role: role, staffName: staffName };
    requireRole_(ctx, action.role);
    var data = action.write ? env.withLock(function () { return action.fn(ctx); }) : action.fn(ctx);
    return { ok: true, data: data };
  } catch (err) {
    if (err && err.isAppError) {
      return { ok: false, error: { code: err.code, message: err.message, extra: err.extra } };
    }
    if (typeof console !== 'undefined') console.error(err && err.stack ? err.stack : String(err));
    return { ok: false, error: { code: 'INTERNAL', message: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' } };
  }
}

function makeEnv_() {
  return {
    store: makeSheetStore_(),
    now: function () { return new Date(); },
    random: Math.random,
    newId: function (prefix) { return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); },
    verifyToken: verifyLineToken_,
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try { return fn(); } finally { lock.releaseLock(); }
    }
  };
}

function doPost(e) {
  var out = handleRequest_(makeEnv_(), e && e.postData ? e.postData.contents : '');
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'shop-points' }))
    .setMimeType(ContentService.MimeType.JSON);
}
