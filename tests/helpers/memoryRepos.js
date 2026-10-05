/** In-memory twins of the MySQL repositories (same interface, snake_case rows). */
function createMemoryRepos() {
  let cid = 0, oid = 0, mid = 0;
  const customerRows = [], orderRows = [], history = [], commRows = [];

  const customers = {
    rows: customerRows,
    async upsertByEmail(i) {
      let c = customerRows.find((x) => x.email === i.email);
      if (c) {
        if (i.firstName) c.first_name = i.firstName;
        if (i.lastName) c.last_name = i.lastName;
        c.phone = i.phone ?? c.phone;
        return { ...c };
      }
      c = { id: ++cid, email: i.email, first_name: i.firstName, last_name: i.lastName, phone: i.phone, address: i.address, tags: "", woocommerce_customer_id: i.wooCustomerId };
      customerRows.push(c);
      return { ...c };
    },
    async findById(id) {
      const c = customerRows.find((x) => x.id === Number(id));
      if (!c) return null;
      const mine = orderRows.filter((o) => o.customer_id === c.id);
      return { ...c, order_count: mine.length, total_spent: mine.reduce((s, o) => s + Number(o.total), 0) };
    },
    async list() { return customerRows.map((c) => ({ ...c })); },
    async count() { return customerRows.length; },
    async setTags(id, tags) { customerRows.find((x) => x.id === Number(id)).tags = tags; },
    async addNote() {},
    async listNotes() { return []; },
  };

  const orders = {
    rows: orderRows,
    history,
    async findByWooId(w) { const o = orderRows.find((x) => x.woocommerce_order_id === w); return o ? { ...o } : null; },
    async upsert(i) {
      let o = orderRows.find((x) => x.woocommerce_order_id === i.wooOrderId);
      if (o) Object.assign(o, { status: i.status, total: i.total, currency: i.currency, items: i.items });
      else {
        o = { id: ++oid, woocommerce_order_id: i.wooOrderId, customer_id: i.customerId, order_date: i.orderDate, status: i.status, total: i.total, currency: i.currency, items: i.items };
        orderRows.push(o);
      }
      return { ...o };
    },
    async addStatusHistory(orderId, from, to) { history.push({ orderId, from, to }); },
    async listByCustomer(id) { return orderRows.filter((o) => o.customer_id === id).map((o) => ({ ...o })); },
    async list() { return orderRows.map((o) => ({ ...o })); },
    async listDelayed() { return []; },
    async getWithDetails() { return null; },
    async summary() { return { orders: orderRows.length, revenue: 0, currency: "INR" }; },
  };

  const communications = {
    rows: commRows,
    async create(i) { const m = { id: ++mid, ...i }; commRows.push(m); return m; },
    async listByCustomer(id) { return commRows.filter((m) => m.customerId === id || m.customer_id === id); },
  };

  return { customers, orders, communications };
}

module.exports = { createMemoryRepos };
