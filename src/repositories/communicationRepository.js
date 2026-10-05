function createCommunicationRepository(pool) {
  return {
    async create({ customerId, orderId = null, type, subject = null, message, status = "sent" }) {
      const [result] = await pool.query(
        "INSERT INTO communications (customer_id, order_id, type, subject, message, status) VALUES (?,?,?,?,?,?)",
        [customerId, orderId, type, subject, message, status]
      );
      const [rows] = await pool.query("SELECT * FROM communications WHERE id = ?", [result.insertId]);
      return rows[0];
    },

    async listByCustomer(customerId) {
      const [rows] = await pool.query(
        "SELECT * FROM communications WHERE customer_id = ? ORDER BY created_at DESC, id DESC",
        [customerId]
      );
      return rows;
    },
  };
}

module.exports = { createCommunicationRepository };
