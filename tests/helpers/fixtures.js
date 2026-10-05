const { createHmac } = require("crypto");

const SECRET = "test-secret";
const sign = (body) => createHmac("sha256", SECRET).update(body).digest("base64");

const wooOrder = (over = {}) => ({
  id: 101,
  status: "processing",
  total: "2998.00",
  currency: "INR",
  customer_id: 7,
  date_created_gmt: "2026-10-05T09:00:00",
  billing: { first_name: "Asha", last_name: "Naik", email: "Asha@Example.com", phone: "999", city: "Mapusa", country: "IN" },
  line_items: [{ name: "Laptop Stand", quantity: 2, price: 1499 }],
  ...over,
});

module.exports = { SECRET, sign, wooOrder };
