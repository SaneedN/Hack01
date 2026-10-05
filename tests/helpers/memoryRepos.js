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
    async findByEmail(email) {
      const c = customerRows.find((x) => x.email === String(email).trim().toLowerCase());
      return c ? this.findById(c.id) : null;
    },
    async list(search) {
      const q = String(search || "").toLowerCase();
      return Promise.all(
        customerRows
          .filter((c) => !q || `${c.email} ${c.first_name} ${c.last_name}`.toLowerCase().includes(q))
          .map((c) => this.findById(c.id))
      );
    },
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
    async findById(id) { const o = orderRows.find((x) => x.id === Number(id)); return o ? { ...o } : null; },
    async listByCustomer(id) { return orderRows.filter((o) => o.customer_id === id).map((o) => ({ ...o })); },
    async list({ status } = {}) { return orderRows.filter((o) => !status || o.status === status).map((o) => ({ ...o })); },
    async listDelayed(days = 3) {
      const cutoff = Date.now() - days * 86400000;
      return orderRows.filter((o) => o.status === "processing" && new Date(o.order_date).getTime() < cutoff).map((o) => ({ ...o }));
    },
    async getWithDetails() { return null; },
    async summary() { return { orders: orderRows.length, revenue: 0, currency: "INR" }; },
  };

  const communications = {
    rows: commRows,
    async create(i) { const m = { id: ++mid, ...i }; commRows.push(m); return m; },
    async existsForOrder(orderId, type) { return commRows.some((m) => (m.orderId ?? m.order_id) === orderId && m.type === type); },
    async listByCustomer(id) { return commRows.filter((m) => m.customerId === id || m.customer_id === id); },
  };

  let uid = 0, tid = 0, xid = 0;
  const userRows = [], taskRows = [], triageRows = [];
  const users = {
    rows: userRows,
    async findByEmail(e) { return userRows.find((u) => u.email === e) || null; },
    async create(i) { const u = { id: ++uid, name: i.name, email: i.email, password_hash: i.passwordHash, role: i.role || "staff" }; userRows.push(u); return { id: u.id, name: u.name, email: u.email, role: u.role }; },
    async list() { return userRows.map(({ password_hash, ...u }) => u); },
    async count() { return userRows.length; },
  };
  const tasks = {
    rows: taskRows,
    async create(i) { const t = { id: ++tid, customer_id: i.customerId ?? null, order_id: i.orderId ?? null, title: i.title, source: i.source || "manual", status: "open" }; taskRows.push(t); return { ...t }; },
    async list({ status = "open" } = {}) { return taskRows.filter((t) => t.status === status).map((t) => ({ ...t })); },
    async complete(id) { const t = taskRows.find((x) => x.id === Number(id)); if (t) t.status = "done"; return Boolean(t); },
  };
  const triage = {
    rows: triageRows,
    async create(i) {
      const t = { id: ++xid, customer_id: i.customerId ?? null, order_id: i.orderId ?? null, message: i.message, category: i.category, urgency: i.urgency, summary: i.summary, draft_reply: i.draftReply, suggested_task: i.suggestedTask ?? null, steps: i.steps || [], source: i.source, status: "pending" };
      triageRows.push(t); return { ...t };
    },
    async findById(id) { const t = triageRows.find((x) => x.id === Number(id)); return t ? { ...t } : null; },
    async list({ status = "pending" } = {}) { return triageRows.filter((t) => t.status === status).map((t) => ({ ...t })); },
    async resolve(id, status) { const t = triageRows.find((x) => x.id === Number(id)); if (t) t.status = status; },
  };

  return { customers, orders, communications, users, tasks, triage };
}

module.exports = { createMemoryRepos };
