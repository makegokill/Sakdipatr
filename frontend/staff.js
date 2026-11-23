(function () {
  var el = App.el, root = App.$('app');
  var current = null, busy = false;

  function build() {
    App.clear(root);
    var q = el('input', { type: 'search', id: 'q', placeholder: 'เบอร์โทร หรือ รหัสสมาชิก', autocomplete: 'off', inputmode: 'search' });
    var go = el('button', { text: 'ค้นหา', onclick: function () { search(q.value); } });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') search(q.value); });
    var scan = el('button', { class: 'secondary', id: 'scan', text: 'สแกน QR ลูกค้า', onclick: doScan });
    root.appendChild(el('div', { class: 'card' }, [el('h1', { text: 'เพิ่มแต้ม / แลกรางวัล' }), el('div', { class: 'row' }, [q, go]), scan]));
    root.appendChild(el('div', { id: 'cust' }));
    root.appendChild(el('div', { class: 'card' }, [el('h2', { text: 'รายการของฉันวันนี้' }), el('ul', { class: 'list', id: 'mine' })]));
    loadMine();
  }

  function doScan() {
    if (!(window.liff && liff.isApiAvailable && liff.isApiAvailable('scanCodeV2'))) {
      return App.toast('เปิดจากแอป LINE เพื่อสแกน หรือพิมพ์เบอร์โทรแทน', true);
    }
    liff.scanCodeV2().then(function (r) { if (r && r.value) { App.$('q').value = r.value; search(r.value); } },
      function () { App.toast('สแกนไม่สำเร็จ ลองพิมพ์เบอร์โทรแทน', true); });
  }

  function search(query) {
    if (!String(query).trim()) return;
    App.api('lookup', { query: query }).then(function (c) { current = c; renderCustomer(); },
      function (e) { current = null; App.clear(App.$('cust')); App.toast(e.message, true); });
  }

  function renderCustomer() {
    var c = current, box = App.clear(App.$('cust'));
    var bill = el('input', { type: 'number', inputmode: 'decimal', id: 'bill', min: '0', step: '0.01', placeholder: '0' });
    var pts = el('input', { type: 'number', inputmode: 'numeric', id: 'pts', min: '1', step: '1', placeholder: '0' });
    var no = el('input', { type: 'text', id: 'billno', maxlength: '40', placeholder: 'ไม่บังคับ' });
    var hint = el('div', { class: 'muted', id: 'hint' });
    bill.addEventListener('input', function () {
      var s = Math.floor((Number(bill.value) || 0) / c.bahtPerPoint);
      pts.value = s > 0 ? s : '';
      hint.textContent = s > 0 ? 'คำนวณได้ ' + s + ' แต้ม (' + c.bahtPerPoint + ' บาท = 1 แต้ม)' : '';
    });
    var save = el('button', { id: 'save', text: 'บันทึกแต้ม', onclick: function () { addPoints(bill.value, pts.value, no.value, false); } });
    box.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'สมาชิก' }), el('strong', { text: c.name || '(ไม่มีชื่อ)' }),
      el('div', { class: 'muted', text: c.phone + ' · ' + c.memberCode }),
      el('div', { class: 'points', id: 'bal', text: String(c.points) }), el('div', { class: 'muted', text: 'แต้มคงเหลือ' })
    ]));
    box.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'เพิ่มแต้ม' }),
      el('label', { text: 'ยอดบิล (บาท)', for: 'bill' }), bill, hint,
      el('label', { text: 'แต้มที่จะให้', for: 'pts' }), pts,
      el('label', { text: 'เลขที่บิล', for: 'billno' }), no, save
    ]));
    var rw = el('div', { class: 'card' }, [el('h2', { text: 'แลกของรางวัล' })]);
    if (!c.rewards.length) rw.appendChild(el('p', { class: 'muted', text: 'ยังไม่มีของรางวัล' }));
    c.rewards.forEach(function (r) {
      rw.appendChild(el('div', { class: 'reward' }, [el('div', { class: 'top' }, [
        el('span', { text: r.name + ' (' + r.cost + ')' }),
        r.canRedeem ? el('button', { class: 'small', text: 'แลก', onclick: function () { redeem(r); } })
                    : el('span', { class: 'muted', text: 'อีก ' + r.remaining })
      ])]));
    });
    box.appendChild(rw);
  }

  function refreshCustomer() { return App.api('lookup', { query: current.memberCode }).then(function (c) { current = c; renderCustomer(); }); }

  function addPoints(billAmount, points, billNo, confirmed) {
    if (busy) return; busy = true;
    var p = { customerId: current.customerId, billAmount: billAmount, points: points, billNo: billNo, confirmed: confirmed };
    App.api('addPoints', p).then(function (r) {
      App.toast('เพิ่ม ' + r.points + ' แต้มแล้ว · คงเหลือ ' + r.balance);
      return refreshCustomer().then(loadMine);
    }, function (e) {
      if (e.code === 'NEEDS_CONFIRMATION') {
        busy = false;
        return App.confirm('ตรวจสอบก่อนบันทึก', App.issueLines(e.extra.issues), 'ยืนยันบันทึก').then(function (ok) {
          if (ok) addPoints(billAmount, points, billNo, true);
        });
      }
      App.toast(e.message, true);
    }).then(function () { busy = false; }, function () { busy = false; });
  }

  function redeem(r) {
    App.confirm('แลก ' + r.name + '?', ['หักแต้ม ' + r.cost + ' แต้ม จาก ' + current.name], 'ยืนยันแลก').then(function (ok) {
      if (!ok) return;
      App.api('redeem', { customerId: current.customerId, rewardId: r.id }).then(function (res) {
        App.toast('แลกแล้ว · คงเหลือ ' + res.balance);
        return refreshCustomer().then(loadMine);
      }, function (e) { App.toast(e.message, true); });
    });
  }

  function loadMine() {
    return App.api('myToday').then(function (d) {
      var ul = App.clear(App.$('mine'));
      if (!d.entries.length) ul.appendChild(el('li', {}, [el('span', { class: 'muted', text: 'ยังไม่มีรายการ' })]));
      d.entries.forEach(function (t) {
        var label = el('span', { class: t.cancelled ? 'struck' : '' }, [
          App.typeLabel(t.type) + ' · ' + t.customerName, el('br'),
          el('span', { class: 'muted', text: App.fmtTime(t.timestamp) + ' · ' + App.fmtPts(t.points) })]);
        var act = t.cancelled ? el('span', { class: 'muted', text: 'ยกเลิกแล้ว' })
          : el('button', { class: 'small danger', text: 'ยกเลิก', onclick: function () { cancel(t); } });
        ul.appendChild(el('li', {}, [label, act]));
      });
    }, function () {});
  }

  function cancel(t) {
    App.confirm('ยกเลิกรายการนี้?', [t.customerName + ' · ' + App.fmtPts(t.points) + ' แต้ม'], 'ยกเลิกรายการ').then(function (ok) {
      if (!ok) return;
      App.api('cancel', { txId: t.txId }).then(function () {
        App.toast('ยกเลิกแล้ว');
        return (current ? refreshCustomer() : Promise.resolve()).then(loadMine);
      }, function (e) { App.toast(e.message, true); });
    });
  }

  App.init().then(function () { return App.api('whoami'); }).then(function (who) {
    if (who.role === 'customer') return App.noAccess(root, who, 'พนักงาน');
    build();
  }).catch(function (e) { App.showFatal(root, e); });
})();
