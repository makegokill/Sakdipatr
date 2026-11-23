function findCustomerByQuery_(ctx, query) {
  var store = ctx.env.store;
  var code = normalizeCode_(query);
  var c = code ? store.findCustomerByCode(code) : null;
  if (!c) {
    var phone = normalizePhone_(query);
    if (phone) c = store.findCustomerByPhone(phone);
  }
  return c;
}

function staffLookup_(ctx) {
  var c = findCustomerByQuery_(ctx, ctx.params.query);
  if (!c) throw appError_('NOT_FOUND', 'ไม่พบสมาชิก ตรวจสอบเบอร์โทรหรือสแกนใหม่');
  var card = cardFor_(ctx, c, 5);
  card.bahtPerPoint = ctx.settings.bahtPerPoint;
  return card;
}

function requireCustomer_(ctx) {
  var c = ctx.env.store.findCustomerById(String(ctx.params.customerId || ''));
  if (!c) throw appError_('NOT_FOUND', 'ไม่พบสมาชิก');
  return c;
}

function newTx_(ctx, customer, type, points, extra) {
  var tx = {
    txId: ctx.env.newId('T'),
    timestamp: isoBangkok_(ctx.env.now()),
    customerId: customer.customerId,
    type: type,
    points: points,
    billAmount: '',
    billNo: '',
    staffId: ctx.user.userId,
    staffName: ctx.staffName,
    note: '',
    refTxId: ''
  };
  for (var k in extra) tx[k] = extra[k];
  return ctx.env.store.appendTx(tx);
}

function staffAddPoints_(ctx) {
  var customer = requireCustomer_(ctx);
  var bill = parseAmount_(ctx.params.billAmount);
  if (bill == null) throw appError_('BAD_AMOUNT', 'ยอดบิลไม่ถูกต้อง');
  var points = parsePoints_(ctx.params.points);
  if (points == null || points < 1) throw appError_('BAD_POINTS', 'แต้มต้องเป็นจำนวนเต็มตั้งแต่ 1');
  if (points > ctx.settings.maxPointsPerEntry) {
    throw appError_('BAD_POINTS', 'แต้มสูงสุดต่อรายการคือ ' + ctx.settings.maxPointsPerEntry);
  }
  var billNo = String(ctx.params.billNo == null ? '' : ctx.params.billNo).trim().slice(0, 40);

  var suggested = suggestPoints_(bill, ctx.settings);
  var now = isoBangkok_(ctx.env.now());
  var issues = [];
  if (points > suggested) issues.push({ type: 'EXTRA_POINTS', suggested: suggested, points: points });
  var mine = ctx.env.store.listTxByCustomer(customer.customerId);
  var recent = mine.filter(function (t) {
    return t.type === 'earn' && minutesBetween_(t.timestamp, now) < ctx.settings.duplicateWindowMinutes;
  });
  if (recent.length) issues.push({ type: 'RECENT_ENTRY', minutes: Math.round(minutesBetween_(recent[recent.length - 1].timestamp, now)) });
  if (billNo) {
    var all = ctx.env.store.listAllTx();
    var dup = all.some(function (t) {
      return t.type === 'earn' && t.billNo === billNo && !isCancelled_(t.txId, all);
    });
    if (dup) issues.push({ type: 'DUPLICATE_BILL', billNo: billNo });
  }
  if (issues.length && ctx.params.confirmed !== true) {
    throw appError_('NEEDS_CONFIRMATION', 'ต้องยืนยันก่อนบันทึก', { issues: issues });
  }

  var tx = newTx_(ctx, customer, 'earn', points, { billAmount: bill, billNo: billNo });
  return { txId: tx.txId, points: points, balance: sumPoints_(mine) + points, customerName: customer.displayName };
}

function staffRedeem_(ctx) {
  var customer = requireCustomer_(ctx);
  var reward = null;
  ctx.env.store.getRewards().forEach(function (r) { if (r.id === String(ctx.params.rewardId) && r.active) reward = r; });
  if (!reward) throw appError_('NOT_FOUND', 'ไม่พบของรางวัล');
  var balance = sumPoints_(ctx.env.store.listTxByCustomer(customer.customerId));
  if (balance < reward.cost) {
    throw appError_('INSUFFICIENT_POINTS', 'แต้มไม่พอ (ต้องใช้ ' + reward.cost + ' แต้ม มี ' + balance + ' แต้ม)');
  }
  var tx = newTx_(ctx, customer, 'redeem', -reward.cost, { note: reward.name });
  return { txId: tx.txId, reward: reward.name, balance: balance - reward.cost, customerName: customer.displayName };
}

// Staff can cancel only their own entries, same Bangkok day, once. Owner can cancel any same-day entry.
function staffCancel_(ctx) {
  var store = ctx.env.store;
  var tx = store.getTx(String(ctx.params.txId || ''));
  if (!tx || (tx.type !== 'earn' && tx.type !== 'redeem')) throw appError_('NOT_FOUND', 'ไม่พบรายการ');
  if (ctx.role !== 'owner' && tx.staffId !== ctx.user.userId) {
    throw appError_('FORBIDDEN', 'ยกเลิกได้เฉพาะรายการที่ตัวเองบันทึก');
  }
  var now = isoBangkok_(ctx.env.now());
  if (bangkokDay_(tx.timestamp) !== bangkokDay_(now)) {
    throw appError_('TOO_LATE', 'ยกเลิกได้เฉพาะรายการของวันนี้ กรุณาแจ้งเจ้าของร้าน');
  }
  if (isCancelled_(tx.txId, store.listAllTx())) throw appError_('ALREADY_CANCELLED', 'รายการนี้ถูกยกเลิกไปแล้ว');
  var customer = store.findCustomerById(tx.customerId);
  var balance = sumPoints_(store.listTxByCustomer(tx.customerId));
  if (balance - tx.points < 0) {
    throw appError_('INSUFFICIENT_POINTS', 'ยกเลิกไม่ได้ เพราะลูกค้าใช้แต้มไปแล้ว');
  }
  var c = newTx_(ctx, customer, 'cancel', -tx.points, { refTxId: tx.txId, note: 'ยกเลิกรายการ' });
  return { txId: c.txId, balance: balance - tx.points };
}

function staffMyToday_(ctx) {
  var store = ctx.env.store;
  var day = bangkokDay_(isoBangkok_(ctx.env.now()));
  var all = store.listAllTx();
  var names = store.customerNames();
  return {
    entries: store.listTxByDay(day)
      .filter(function (t) { return t.staffId === ctx.user.userId && (t.type === 'earn' || t.type === 'redeem'); })
      .map(function (t) {
        return { txId: t.txId, timestamp: t.timestamp, type: t.type, points: t.points,
                 customerName: names[t.customerId] || '', cancelled: isCancelled_(t.txId, all) };
      })
      .reverse()
  };
}
