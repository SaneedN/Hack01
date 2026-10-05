function createUserRepository(pool) {
  return {
    async findByEmail(email) {
      const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
      return rows[0] || null;
    },
    async create({ name, email, passwordHash, role = "staff" }) {
      const [r] = await pool.query("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)", [name, email, passwordHash, role]);
      return { id: r.insertId, name, email, role };
    },
    async list() {
      const [rows] = await pool.query("SELECT id, name, email, role, created_at FROM users ORDER BY id");
      return rows;
    },
    async count() {
      const [rows] = await pool.query("SELECT COUNT(*) AS n FROM users");
      return Number(rows[0].n);
    },
  };
}
module.exports = { createUserRepository };
