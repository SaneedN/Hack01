function createTaskRepository(pool) {
  return {
    async create({ customerId = null, orderId = null, title, source = "manual" }) {
      const [r] = await pool.query("INSERT INTO tasks (customer_id, order_id, title, source) VALUES (?,?,?,?)", [customerId, orderId, title, source]);
      const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [r.insertId]);
      return rows[0];
    },
    async list({ status = "open" } = {}) {
      const [rows] = await pool.query(
        `SELECT t.*, c.first_name, c.last_name, c.email FROM tasks t
         LEFT JOIN customers c ON c.id = t.customer_id WHERE t.status = ? ORDER BY t.created_at DESC, t.id DESC LIMIT 200`,
        [status]
      );
      return rows;
    },
    async complete(id) {
      const [r] = await pool.query("UPDATE tasks SET status = 'done' WHERE id = ?", [id]);
      return r.affectedRows > 0;
    },
  };
}
module.exports = { createTaskRepository };
