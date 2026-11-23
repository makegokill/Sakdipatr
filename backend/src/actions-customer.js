function whoami_(ctx) {
  return { userId: ctx.user.userId, name: ctx.user.name, role: ctx.role, shopName: ctx.settings.shopName };
}

function customerRegister_(ctx) {
  var store = ctx.env.store;
  var existing = store.findCustomerByLineId(ctx.user.userId);
  if (existing) return customerCard_(ctx);
  var phone = normalizePhone_(ctx.params.phone);
  if (!phone) throw appError_('BAD_PHONE', 'เบอร์โทรไม่ถูกต้อง (ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก)');
  if (store.findCustomerByPhone(phone)) {
    throw appError_('PHONE_TAKEN', 'เบอร์นี้ลงทะเบียนแล้ว กรุณาติดต่อพนักงาน');
  }
  var code;
  do { code = makeMemberCode_(ctx.env.random); } while (store.findCustomerByCode(code));
  store.createCustomer({
    customerId: ctx.env.newId('C'),
    lineUserId: ctx.user.userId,
    displayName: String(ctx.params.name || ctx.user.name || '').slice(0, 60),
    phone: phone,
    memberCode: code,
    createdAt: isoBangkok_(ctx.env.now())
  });
  return customerCard_(ctx);
}

function cardFor_(ctx, customer, historyLimit) {
  var txs = ctx.env.store.listTxByCustomer(customer.customerId);
  var balance = sumPoints_(txs);
  var history = txs.slice().sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0; })
    .slice(0, historyLimit)
    .map(function (t) {
      return { txId: t.txId, timestamp: t.timestamp, type: t.type, points: t.points, note: t.note };
    });
  return {
    customerId: customer.customerId,
    name: customer.displayName,
    phone: customer.phone,
    memberCode: customer.memberCode,
    points: balance,
    rewards: rewardProgress_(balance, ctx.env.store.getRewards()),
    history: history
  };
}

function customerCard_(ctx) {
  var c = ctx.env.store.findCustomerByLineId(ctx.user.userId);
  if (!c) throw appError_('NOT_REGISTERED', 'ยังไม่ได้ลงทะเบียน');
  var card = cardFor_(ctx, c, 10);
  card.shopName = ctx.settings.shopName;
  return card;
}
