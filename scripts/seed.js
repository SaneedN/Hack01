// Demo data: `npm run seed`. Uses the real ingest path but sends no emails.
require("dotenv").config();
const pool = require("../src/config/db");
const { createEventBus } = require("../src/events/bus");
const { createCustomerRepository } = require("../src/repositories/customerRepository");
const { createOrderRepository } = require("../src/repositories/orderRepository");
const { OrderIngestService } = require("../src/services/orderIngestService");
const { wooOrderSchema } = require("../src/services/wooOrderSchema");

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 19);
const people = [
  ["Rahul", "Shah", "rahul.shah@example.com", "9876500001"],
  ["Priya", "Naik", "priya.naik@example.com", "9876500002"],
  ["Amit", "Kumar", "amit.kumar@example.com", "9876500003"],
  ["John", "Doe", "john.doe@example.com", "9876500004"],
];
const products = [["Laptop Stand", 1499], ["Mechanical Keyboard", 2999], ["Wireless Mouse", 799], ["USB-C Hub", 1899]];
const statuses = ["completed", "completed", "processing", "processing", "shipped-pending", "cancelled", "completed", "processing"];

(async () => {
  const svc = new OrderIngestService(createCustomerRepository(pool), createOrderRepository(pool), createEventBus());
  let id = 9000;
  for (let i = 0; i < 8; i++) {
    const [first, last, email, phone] = people[i % people.length];
    const [name, price] = products[i % products.length];
    const status = statuses[i] === "shipped-pending" ? "on-hold" : statuses[i];
    await svc.ingest(
      wooOrderSchema.parse({
        id: id++, status, total: String(price), currency: "INR", customer_id: 0,
        date_created_gmt: daysAgo(10 - i),
        billing: { first_name: first, last_name: last, email, phone, city: "Mapusa", state: "Goa", country: "IN" },
        line_items: [{ name, quantity: 1, price }],
      })
    );
  }
  console.log("Seeded demo customers and orders.");
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
