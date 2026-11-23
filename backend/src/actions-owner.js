function ownerDay_(ctx) {
  var store = ctx.env.store;
  var day = String(ctx.params.date || bangkokDay_(isoBangkok_(ctx.env.now())));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw appError_('BAD_DATE', 'วันที่ไม่ถูกต้อง');
  var names = store.customerNames();
  var all = store.listAllTx();
  var entries = store.listTxByDay(day).map(function (t) {
    return {
      txId: t.txId, timestamp: t.timestamp, type: t.type, points: t.points,
      customerName: names[t.customerId] || '', staffName: t.staffName, billAmount: t.billAmount,
      billNo: t.billNo, note: t.note, cancelled: isCancelled_(t.txId, all)
    };
  }).reverse();
  var earned = 0, redeemed = 0;
  entries.forEach(function (e) {
    if (e.type === 'earn' && !e.cancelled) earned += e.points;
    if (e.type === 'redeem' && !e.cancelled) redeemed += -e.points;
  });
  return { date: day, entries: entries, totals: { earned: earned, redeemed: redeemed } };
}

// Two-step: first call returns NEEDS_CONFIRMATION with the new balance; second call (confirmed:true) writes.
function ownerAdjust_(ctx) {
  var customer = requireCustomer_(ctx);
  var points = parsePoints_(ctx.params.points);
  if (points == null || points === 0) throw appError_('BAD_POINTS', 'กรุณาระบุแต้มที่จะเพิ่ม/ลด (ไม่เป็น 0)');
  var reason = String(ctx.params.reason == null ? '' : ctx.params.reason).trim().slice(0, 200);
  if (!reason) throw appError_('REASON_REQUIRED', 'กรุณาระบุเหตุผล');
  var balance = sumPoints_(ctx.env.store.listTxByCustomer(customer.customerId));
  var newBalance = balance + points;
  if (newBalance < 0) throw appError_('INSUFFICIENT_POINTS', 'แต้มติดลบไม่ได้ (ลูกค้ามี ' + balance + ' แต้ม)');
  if (ctx.params.confirmed !== true) {
    throw appError_('NEEDS_CONFIRMATION', 'ยืนยันการปรับแต้ม',
      { issues: [{ type: 'ADJUST', name: customer.displayName, points: points, balance: balance, newBalance: newBalance }] });
  }
  var tx = newTx_(ctx, customer, 'adjust', points, { note: reason });
  return { txId: tx.txId, balance: newBalance, customerName: customer.displayName };
}
