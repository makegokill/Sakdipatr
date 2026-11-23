// Identity comes only from a LINE ID token verified server-side. The browser never
// tells us who it is or what role it has.

function verifyLineToken_(idToken, settings) {
  if (!idToken) throw appError_('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ LINE ใหม่');
  if (!settings.lineChannelId) throw appError_('SETUP_REQUIRED', 'ยังไม่ได้ตั้งค่า line_channel_id ใน Settings');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: settings.lineChannelId },
    muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) { body = {}; }
  if (res.getResponseCode() !== 200) {
    if (/expired/i.test(String(body.error_description || ''))) {
      throw appError_('TOKEN_EXPIRED', 'เซสชันหมดอายุ กำลังเข้าสู่ระบบใหม่');
    }
    throw appError_('UNAUTHENTICATED', 'ยืนยันตัวตนไม่สำเร็จ');
  }
  var ident = { userId: String(body.sub), name: String(body.name || '') };
  var ttl = Math.max(1, Math.min(300, Number(body.exp) - Math.floor(Date.now() / 1000)));
  cache.put(key, JSON.stringify(ident), ttl);
  return ident;
}

// -> 'owner' | 'staff' | 'customer'
function roleOf_(userId, settings, staffList) {
  if (settings.ownerLineUserId && settings.ownerLineUserId === userId) return 'owner';
  for (var i = 0; i < staffList.length; i++) {
    if (staffList[i].lineUserId === userId && staffList[i].active) return 'staff';
  }
  return 'customer';
}

function requireRole_(ctx, needed) {
  if (needed === 'any') return;
  var ok = needed === 'staff' ? (ctx.role === 'staff' || ctx.role === 'owner') : ctx.role === 'owner';
  if (!ok) throw appError_('FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
}
