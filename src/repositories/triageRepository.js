const parse = (r) => ({ ...r, steps: typeof r.steps === "string" ? JSON.parse(r.steps || "[]") : r.steps || [] });

function createTriageRepository(pool) {
  return {
    async create(i) {
      const [r] = await pool.query(
        `INSERT INTO triage_items (customer_id, order_id, message, category, urgency, summary, draft_reply, suggested_task, steps, source)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [i.customerId ?? null, i.orderId ?? null, i.message, i.category, i.urgency, i.summary, i.draftReply, i.suggestedTask ?? null, JSON.stringify(i.steps || []), i.source]
      );
      return this.findById(r.insertId);
    },
    async findById(id) {
      const [rows] = await pool.query(
        `SELECT t.*, c.first_name, c.last_name, c.email FROM triage_items t
         LEFT JOIN customers c ON c.id = t.customer_id WHERE t.id = ?`,
        [id]
      );
      return rows[0] ? parse(rows[0]) : null;
    },
    async list({ status = "pending" } = {}) {
      const [rows] = await pool.query(
        `SELECT t.*, c.first_name, c.last_name, c.email FROM triage_items t
         LEFT JOIN customers c ON c.id = t.customer_id WHERE t.status = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 100`,
        [status]
      );
      return rows.map(parse);
    },
    async resolve(id, status) {
      await pool.query("UPDATE triage_items SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?", [status, id]);
    },
  };
}
module.exports = { createTriageRepository };
