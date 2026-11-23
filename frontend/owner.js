(function () {
  var el = App.el, root = App.$('app');
  var found = null;

  function today() {
    var d = new Date(Date.now() + 7 * 3600 * 1000); return d.toISOString().slice(0, 10);
  }

  function build() {
    App.clear(root);
    var date = el('input', { type: 'date', id: 'date', value: today() });
    date.addEventListener('change', loadDay);
    root.appendChild(el('div', { class: 'card' }, [
      el('h1', { text: 'สรุปรายวัน' }), el('label', { text: 'วันที่', for: 'date' }), date,
      el('div', { id: 'totals', class: 'muted' }), el('ul', { class: 'list', id: 'day' })
    ]));

    var q = el('input', { type: 'search', id: 'q', placeholder: 'เบอร์โทร หรือ รหัสสมาชิก', autocomplete: 'off' });
    root.appendChild(el('div', { class: 'card' }, [
      el('h1', { text: 'ปรับแต้ม' }),
      el('div', { class: 'row' }, [q, el('button', { text: 'ค้นหา', onclick: function () { find(q.value); } })]),
      el('div', { id: 'adj' })
    ]));
    loadDay();
  }

  function loadDay() {
    App.api('ownerDay', { date: App.$('date').value }).then(function (d) {
      App.$('totals').textContent = 'ให้แต้ม ' + d.totals.earned + ' · แลกไป ' + d.totals.redeemed + ' แต้ม';
      var ul = App.clear(App.$('day'));
      if (!d.entries.length) ul.appendChild(el('li', {}, [el('span', { class: 'muted', text: 'ไม่มีรายการ' })]));
      d.entries.forEach(function (t) {
        var extra = [t.staffName, t.billAmount !== '' && t.billAmount != null ? t.billAmount + ' บาท' : '', t.billNo, t.note].filter(Boolean).join(' · ');
        ul.appendChild(el('li', {}, [
          el('span', { class: t.cancelled ? 'struck' : '' }, [
            App.typeLabel(t.type) + ' · ' + t.customerName, el('br'),
            el('span', { class: 'muted', text: App.fmtTime(t.timestamp) + (extra ? ' · ' + extra : '') })]),
          el('span', { class: 'pts ' + (t.points >= 0 ? 'pos' : 'neg') + (t.cancelled ? ' struck' : ''), text: App.fmtPts(t.points) })
        ]));
      });
    }, function (e) { App.toast(e.message, true); });
  }

  function find(query) {
    App.api('lookup', { query: query }).then(function (c) { found = c; renderAdjust(); },
      function (e) { found = null; App.clear(App.$('adj')); App.toast(e.message, true); });
  }

  function renderAdjust() {
    var box = App.clear(App.$('adj'));
    var pts = el('input', { type: 'number', inputmode: 'numeric', id: 'apts', step: '1', placeholder: 'เช่น 5 หรือ -5' });
    var why = el('input', { type: 'text', id: 'why', maxlength: '200', placeholder: 'เช่น แก้ไขที่พนักงานให้ผิด' });
    box.appendChild(el('p', {}, [el('strong', { text: found.name || '(ไม่มีชื่อ)' }), ' · ' + found.phone + ' · ' + found.points + ' แต้ม']));
    box.appendChild(el('label', { text: 'แต้มที่จะเพิ่ม (+) หรือลด (−)', for: 'apts' })); box.appendChild(pts);
    box.appendChild(el('label', { text: 'เหตุผล (จำเป็น)', for: 'why' })); box.appendChild(why);
    box.appendChild(el('button', { text: 'ปรับแต้ม', onclick: function () { adjust(pts.value, why.value, false); } }));
  }

  function adjust(points, reason, confirmed) {
    App.api('ownerAdjust', { customerId: found.customerId, points: points, reason: reason, confirmed: confirmed }).then(function (r) {
      App.toast('ปรับแล้ว · ' + r.customerName + ' คงเหลือ ' + r.balance);
      App.clear(App.$('adj')); found = null; loadDay();
    }, function (e) {
      if (e.code === 'NEEDS_CONFIRMATION') {
        return App.confirm('ยืนยันการปรับแต้ม', App.issueLines(e.extra.issues).concat(['เหตุผล: ' + reason]), 'ยืนยัน')
          .then(function (ok) { if (ok) adjust(points, reason, true); });
      }
      App.toast(e.message, true);
    });
  }

  App.init().then(function () { return App.api('whoami'); }).then(function (who) {
    if (who.role !== 'owner') return App.noAccess(root, who, 'เจ้าของร้าน (ใส่ใน Settings → owner_line_user_id)');
    build();
  }).catch(function (e) { App.showFatal(root, e); });
})();
