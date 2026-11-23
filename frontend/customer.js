(function () {
  var el = App.el, root = App.$('app');

  function renderRegister(name) {
    App.clear(root);
    var phone = el('input', { type: 'tel', inputmode: 'numeric', autocomplete: 'tel', placeholder: '0812345678', maxlength: '15' });
    var btn = el('button', { text: 'ลงทะเบียน' });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      App.api('register', { phone: phone.value, name: name }).then(renderCard, function (e) {
        App.toast(e.message, true); btn.disabled = false;
      });
    });
    root.appendChild(el('div', { class: 'card' }, [
      el('h1', { text: 'ยินดีต้อนรับ' }),
      el('p', { class: 'muted', text: 'กรอกเบอร์โทรเพื่อรับบัตรสะสมแต้ม พนักงานจะใช้เบอร์นี้ค้นหาคุณเมื่อไม่สะดวกสแกน' }),
      el('label', { text: 'เบอร์โทรศัพท์' }), phone, btn
    ]));
  }

  function renderCard(c) {
    App.clear(root);
    var qr = qrcode(0, 'M'); qr.addData(c.memberCode); qr.make();
    root.appendChild(el('div', { class: 'card center qr' }, [
      el('h1', { text: c.shopName }),
      el('div', { class: 'muted', text: c.name }),
      el('img', { src: qr.createDataURL(8, 2), alt: 'QR สมาชิก ' + c.memberCode }),
      el('div', { class: 'code', text: c.memberCode }),
      el('div', { class: 'muted', text: 'ให้พนักงานสแกน หรือแคปหน้าจอไว้ใช้ตอนไม่มีเน็ต' })
    ]));
    root.appendChild(el('div', { class: 'card center' }, [
      el('h2', { text: 'แต้มสะสม' }), el('div', { class: 'points', id: 'pts', text: String(c.points) })
    ]));
    var rw = el('div', { class: 'card' }, [el('h2', { text: 'ของรางวัล' })]);
    if (!c.rewards.length) rw.appendChild(el('p', { class: 'muted', text: 'ยังไม่มีของรางวัล' }));
    c.rewards.forEach(function (r) {
      var pct = Math.min(100, Math.round((c.points / r.cost) * 100));
      rw.appendChild(el('div', { class: 'reward' }, [
        el('div', { class: 'top' }, [
          el('span', { text: r.name + ' (' + r.cost + ' แต้ม)' }),
          el('strong', { class: r.canRedeem ? 'pos' : 'muted', text: r.canRedeem ? 'แลกได้เลย' : 'อีก ' + r.remaining + ' แต้ม' })
        ]),
        el('div', { class: 'bar' }, [el('i', { style: 'width:' + pct + '%' })])
      ]));
    });
    root.appendChild(rw);
    var h = el('div', { class: 'card' }, [el('h2', { text: 'ประวัติล่าสุด' })]);
    if (!c.history.length) h.appendChild(el('p', { class: 'muted', text: 'ยังไม่มีรายการ' }));
    var ul = el('ul', { class: 'list' });
    c.history.forEach(function (t) {
      ul.appendChild(el('li', {}, [
        el('span', {}, [App.typeLabel(t.type) + (t.note ? ' · ' + t.note : ''), el('br'), el('span', { class: 'muted', text: App.fmtTime(t.timestamp) })]),
        el('span', { class: 'pts ' + (t.points >= 0 ? 'pos' : 'neg'), text: App.fmtPts(t.points) })
      ]));
    });
    h.appendChild(ul); root.appendChild(h);
  }

  App.init().then(function () {
    return liff.getProfile().catch(function () { return { displayName: '' }; }).then(function (p) {
      return App.api('getCard').then(renderCard, function (e) {
        if (e.code === 'NOT_REGISTERED') return renderRegister(p.displayName);
        throw e;
      });
    });
  }).catch(function (e) { App.showFatal(root, e); });
})();
