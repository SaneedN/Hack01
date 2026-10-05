/** Repository pattern: all customer SQL lives here. Rows are returned in snake_case. */
const WITH_STATS = `
  SELECT c.*, COUNT(o.id) AS order_count,
         COALESCE(SUM(o.total), 0) AS total_spent,
         MAX(o.order_date) AS last_order_date
  FROM customers c LEFT JOIN orders o ON o.customer_id = c.id`;

const withNumbers = (r) => ({ ...r, order_count: Number(r.order_count), total_spent: Number(r.total_spent) });

function createCustomerRepository(pool) {
  return {
    async upsertByEmail({ email, firstName, lastName, phone, address, wooCustomerId }) {
      await pool.query(
        `INSERT INTO customers (email, first_name, last_name, phone, address, woocommerce_customer_id)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           first_name = IF(VALUES(first_name) <> '', VALUES(first_name), first_name),
           last_name  = IF(VALUES(last_name)  <> '', VALUES(last_name),  last_name),
           phone      = COALESCE(VALUES(phone), phone),
           address    = COALESCE(VALUES(address), address),
           woocommerce_customer_id = COALESCE(VALUES(woocommerce_customer_id), woocommerce_customer_id)`,
        [email, firstName, lastName, phone, address, wooCustomerId]
      );
      const [rows] = await pool.query("SELECT * FROM customers WHERE email = ?", [email]);
      return rows[0];
    },

    async findById(id) {
      const [rows] = await pool.query(`${WITH_STATS} WHERE c.id = ? GROUP BY c.id`, [id]);
      return rows[0] ? withNumbers(rows[0]) : null;
    },

    async list(search, limit = 200) {
      const q = `%${search || ""}%`;
      const where = search
        ? `WHERE c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?
             OR CONCAT(c.first_name,' ',c.last_name) LIKE ?`
        : "";
      const params = search ? [q, q, q, q, Number(limit)] : [Number(limit)];
      const [rows] = await pool.query(
        `${WITH_STATS} ${where} GROUP BY c.id ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
        params
      );
      return rows.map(withNumbers);
    },

    async count() {
      const [rows] = await pool.query("SELECT COUNT(*) AS n FROM customers");
      return Number(rows[0].n);
    },

    async setTags(id, tags) {
      await pool.query("UPDATE customers SET tags = ? WHERE id = ?", [tags, id]);
    },

    async addNote(customerId, note) {
      await pool.query("INSERT INTO notes (customer_id, note) VALUES (?,?)", [customerId, note]);
    },

    async listNotes(customerId) {
      const [rows] = await pool.query(
        "SELECT * FROM notes WHERE customer_id = ? ORDER BY created_at DESC, id DESC",
        [customerId]
      );
      return rows;
    },
  };
}

module.exports = { createCustomerRepository };
