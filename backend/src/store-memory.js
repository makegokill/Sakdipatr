// In-memory store with the same interface as the Sheet store. Used by tests.
function makeMemoryStore_(seed) {
  seed = seed || {};
  var data = {
    settings: seed.settings || {},
    rewards: (seed.rewards || []).slice(),
    staff: (seed.staff || []).slice(),
    customers: (seed.customers || []).slice(),
    txs: (seed.txs || []).slice()
  };
  function find(list, pred) {
    for (var i = 0; i < list.length; i++) if (pred(list[i])) return list[i];
    return null;
  }
  return {
    getSettingsMap: function () { return data.settings; },
    getRewards: function () { return data.rewards.slice(); },
    getStaff: function () { return data.staff.slice(); },
    findCustomerById: function (id) { return find(data.customers, function (c) { return c.customerId === id; }); },
    findCustomerByLineId: function (id) { return find(data.customers, function (c) { return c.lineUserId === id; }); },
    findCustomerByPhone: function (p) { return find(data.customers, function (c) { return c.phone === p; }); },
    findCustomerByCode: function (code) { return find(data.customers, function (c) { return c.memberCode === code; }); },
    createCustomer: function (c) { data.customers.push(c); return c; },
    appendTx: function (tx) { data.txs.push(tx); return tx; },
    getTx: function (id) { return find(data.txs, function (t) { return t.txId === id; }); },
    listAllTx: function () { return data.txs.slice(); },
    listTxByCustomer: function (cid) { return data.txs.filter(function (t) { return t.customerId === cid; }); },
    listTxByDay: function (day) { return data.txs.filter(function (t) { return String(t.timestamp).slice(0, 10) === day; }); },
    customerNames: function () {
      var m = {};
      data.customers.forEach(function (c) { m[c.customerId] = c.displayName; });
      return m;
    }
  };
}
