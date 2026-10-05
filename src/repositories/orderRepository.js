function createOrderRepository(pool) {
  const repo = {
    async findByWooId(wooOrderId) {
      const [rows] = await pool.query("SELECT * FROM orders WHERE woocommerce_order_id = ?", [wooOrderId]);
      return rows[0] || null;
    },

    async upsert({ wooOrderId, customerId, orderDate, status, total, currency, items }) {
      await pool.query(
        `INSERT INTO orders (woocommerce_order_id, customer_id, order_date, status, total, currency)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id), status = VALUES(status),
                                 total = VALUES(total), currency = VALUES(currency)`,
        [wooOrderId, customerId, orderDate, status, total, currency]
      );
      const order = await repo.findByWooId(wooOrderId);
      await pool.query("DELETE FROM order_items WHERE order_id = ?", [order.id]);
      if (items.length) {
        await pool.query("INSERT INTO order_items (order_id, product_name, quantity, price) VALUES ?", [
          items.map((i) => [order.id, i.name, i.quantity, i.price]),
        ]);
      }
      return { ...order, items };
    },

    async addStatusHistory(orderId, from, to) {
      await pool.query(
        "INSERT INTO order_status_history (order_id, from_status, to_status) VALUES (?,?,?)",
        [orderId, from, to]
      );
    },

    async list({ status, limit = 100 } = {}) {
      const where = status ? "WHERE o.status = ?" : "";
      const params = status ? [status, Number(limit)] : [Number(limit)];
      const [rows] = await pool.query(
        `SELECT o.*, c.first_name, c.last_name, c.email
         FROM orders o JOIN customers c ON c.id = o.customer_id
         ${where} ORDER BY o.order_date DESC, o.id DESC LIMIT ?`,
        params
      );
      return rows;
    },

    async findById(id) {
      const [rows] = await pool.query("SELECT * FROM orders WHERE id = ?", [id]);
      return rows[0] || null;
    },

    async listByCustomer(customerId) {
      const [rows] = await pool.query(
        "SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC, id DESC",
        [customerId]
      );
      return rows;
    },

    async listDelayed(days) {
      const [rows] = await pool.query(
        `SELECT o.*, c.first_name, c.last_name, c.email
         FROM orders o JOIN customers c ON c.id = o.customer_id
         WHERE o.status = 'processing' AND o.order_date < (UTC_TIMESTAMP() - INTERVAL ? DAY)
         ORDER BY o.order_date ASC`,
        [Number(days)]
      );
      return rows;
    },

    async getWithDetails(id) {
      const [rows] = await pool.query(
        `SELECT o.*, c.first_name, c.last_name, c.email
         FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
        [id]
      );
      if (!rows[0]) return null;
      const [items] = await pool.query("SELECT * FROM order_items WHERE order_id = ?", [id]);
      const [history] = await pool.query(
        "SELECT * FROM order_status_history WHERE order_id = ? ORDER BY changed_at ASC, id ASC",
        [id]
      );
      return { ...rows[0], items, history };
    },

    async summary() {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS orders,
                COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded','failed') THEN total END), 0) AS revenue,
                (SELECT currency FROM orders ORDER BY order_date DESC LIMIT 1) AS currency
         FROM orders`
      );
      return { orders: Number(rows[0].orders), revenue: Number(rows[0].revenue), currency: rows[0].currency || "INR" };
    },
  };
  return repo;
}

module.exports = { createOrderRepository };
