// Shared by all pages: LIFF login, API calls, tiny DOM + dialog helpers. No framework.
(function () {
  var CFG = window.SHOP_CONFIG || {};
  var App = (window.App = {});
  var forever = function () { return new Promise(function () {}); };

  App.el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  };
  App.$ = function (id) { return document.getElementById(id); };
  App.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  App.init = function () {
    return liff.init({ liffId: CFG.LIFF_ID }).then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return forever(); }
    });
  };

  // Resolves with `data`; rejects with Error that has .code and .extra. An expired
  // LINE sign-in transparently restarts login instead of showing an error.
  App.api = function (action, params) {
    var body = JSON.stringify(Object.assign({ action: action, idToken: liff.getIDToken() }, params || {}));
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.ok) return json.data;
        var c = json.error && json.error.code;
        if (c === 'TOKEN_EXPIRED' || c === 'UNAUTHENTICATED') {
          try { liff.logout(); } catch (e) {}
          liff.login({ redirectUri: location.href });
          return forever();
        }
        var err = new Error(json.error ? json.error.message : 'ระบบขัดข้อง');
        err.code = c; err.extra = json.error && json.error.extra;
        throw err;
      }, function () { throw new Error('เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); });
  };

  var toastTimer;
  App.toast = function (msg, bad) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = App.el('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg, role: 'status' });
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 3500);
  };

  // lines: array of strings. Resolves true/false.
  App.confirm = function (title, lines, okLabel) {
    return new Promise(function (resolve) {
      var done = function (v) { ov.remove(); resolve(v); };
      var ov = App.el('div', { class: 'overlay' }, [
        App.el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [
          App.el('h3', { text: title })
        ].concat(lines.map(function (l) { return App.el('p', { text: l }); })).concat([
          App.el('button', { text: okLabel || 'ยืนยัน', onclick: function () { done(true); } }),
          App.el('button', { class: 'secondary', text: 'ยกเลิก', onclick: function () { done(false); } })
        ]))
      ]);
      document.body.appendChild(ov);
    });
  };

  App.fmtTime = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + ' ' + m[4] + ':' + m[5] : '';
  };
  App.fmtPts = function (n) { return (n > 0 ? '+' : '') + n; };
  var TYPES = { earn: 'สะสมแต้ม', redeem: 'แลกของรางวัล', adjust: 'ปรับแต้ม', cancel: 'ยกเลิกรายการ' };
  App.typeLabel = function (t) { return TYPES[t] || t; };

  App.issueLines = function (issues) {
    return (issues || []).map(function (i) {
      if (i.type === 'EXTRA_POINTS') return 'แต้มที่ใส่ (' + i.points + ') มากกว่าที่คำนวณได้ (' + i.suggested + ')';
      if (i.type === 'RECENT_ENTRY') return 'ลูกค้าคนนี้เพิ่งได้แต้มเมื่อ ' + i.minutes + ' นาทีที่แล้ว';
      if (i.type === 'DUPLICATE_BILL') return 'เลขที่บิล ' + i.billNo + ' เคยบันทึกแล้ว';
      if (i.type === 'ADJUST') return i.name + ': ' + i.balance + ' → ' + i.newBalance + ' แต้ม (' + App.fmtPts(i.points) + ')';
      return '';
    });
  };

  App.showFatal = function (root, err) {
    App.clear(root).appendChild(App.el('div', { class: 'notice error', text: err.message || 'เกิดข้อผิดพลาด' }));
  };

  // Staff/owner who aren't set up yet need their LINE userId to put in the Sheet.
  App.noAccess = function (root, who, what) {
    App.clear(root).appendChild(App.el('div', { class: 'card' }, [
      App.el('h1', { text: 'ยังไม่มีสิทธิ์' }),
      App.el('p', { class: 'muted', text: 'บัญชี LINE นี้ยังไม่ได้ถูกเพิ่มเป็น' + what + ' ให้ส่งรหัสด้านล่างให้เจ้าของร้านเพื่อใส่ใน Google Sheet' }),
      App.el('div', { class: 'code', text: who.userId })
    ]));
  };
})();
