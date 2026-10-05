const request = require("supertest");
const { createApp } = require("../src/app");
const { createEventBus } = require("../src/events/bus");
const { createMemoryRepos } = require("./helpers/memoryRepos");
const { hashPassword, createAuthService } = require("../src/services/authService");
const { createTriageAgent } = require("../src/services/triageAgent");

async function build() {
  const repos = createMemoryRepos();
  await repos.users.create({ name: "Admin", email: "admin@x.com", passwordHash: hashPassword("password123"), role: "admin" });
  await repos.users.create({ name: "Sam", email: "sam@x.com", passwordHash: hashPassword("password123"), role: "staff" });
  const sent = [];
  const email = { send: async (m) => { sent.push(m); return { status: "simulated" }; } };
  const triageAgent = createTriageAgent({ customers: repos.customers, orders: repos.orders, env: {} });
  const app = createApp({ ...repos, events: createEventBus(), webhookSecret: "s", email, ai: {}, triageAgent, authService: createAuthService({ secret: "t" }) });
  return { app, repos, sent };
}
const login = async (app, email) => (await request(app).post("/api/auth/login").send({ email, password: "password123" })).body.token;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

describe("auth & roles", () => {
  test("API requires a token; login works; bad password is rejected", async () => {
    const { app } = await build();
    expect((await request(app).get("/api/customers")).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "admin@x.com", password: "nope" })).status).toBe(401);
    const token = await login(app, "admin@x.com");
    expect((await request(app).get("/api/customers").set(bearer(token))).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set(bearer(token))).body.role).toBe("admin");
  });

  test("staff cannot manage users or run admin actions; admin can", async () => {
    const { app } = await build();
    const staff = await login(app, "sam@x.com");
    const admin = await login(app, "admin@x.com");
    expect((await request(app).get("/api/auth/users").set(bearer(staff))).status).toBe(403);
    expect((await request(app).post("/api/admin/automation/followups").set(bearer(staff))).status).toBe(403);
    const created = await request(app).post("/api/auth/users").set(bearer(admin)).send({ name: "New", email: "new@x.com", password: "longenough1", role: "staff" });
    expect(created.status).toBe(201);
    expect((await request(app).post("/api/auth/users").set(bearer(admin)).send({ name: "N", email: "new@x.com", password: "longenough1" })).status).toBe(409);
    expect((await request(app).post("/api/auth/users").set(bearer(admin)).send({ name: "N", email: "b@x.com", password: "short" })).status).toBe(400);
  });

  test("webhook stays public (signature-protected) while API is locked", async () => {
    const { app } = await build();
    expect((await request(app).post("/webhooks/woocommerce").send("{}")).status).toBe(401);
  });
});

describe("self-registration", () => {
  const reg = (app, over = {}) => request(app).post("/api/auth/register").send({ name: "Pat", email: "pat@x.com", password: "password123", ...over });

  test("first account becomes admin, later ones staff, and the new token works", async () => {
    const repos = createMemoryRepos();
    const app = createApp({ ...repos, events: createEventBus(), webhookSecret: "s", email: {}, ai: {}, authService: createAuthService({ secret: "t" }) });
    const first = await reg(app);
    expect(first.status).toBe(201);
    expect(first.body.user.role).toBe("admin");
    const second = await reg(app, { email: "lee@x.com" });
    expect(second.body.user.role).toBe("staff");
    expect((await request(app).get("/api/customers").set(bearer(second.body.token))).status).toBe(200);
    expect((await reg(app)).status).toBe(409);
    expect((await reg(app, { email: "z@x.com", password: "short" })).status).toBe(400);
  });

  test("can be closed with allowRegistration=false (except for the very first account)", async () => {
    const { app } = await build();
    expect((await reg(app)).status).toBe(201); // default open
    const repos = createMemoryRepos();
    const closed = createApp({ ...repos, events: createEventBus(), webhookSecret: "s", email: {}, ai: {}, allowRegistration: false, authService: createAuthService({ secret: "t" }) });
    expect((await reg(closed)).status).toBe(201);
    expect((await reg(closed, { email: "b@x.com" })).status).toBe(403);
  });
});

describe("AI triage approval flow", () => {
  test("nothing is emailed until a human approves", async () => {
    const { app, repos, sent } = await build();
    const token = await login(app, "sam@x.com");
    const c = await repos.customers.upsertByEmail({ email: "asha@example.com", firstName: "Asha", lastName: "N" });
    await repos.orders.upsert({ wooOrderId: 77, customerId: c.id, orderDate: "2026-09-01 10:00:00", status: "processing", total: 5, currency: "INR", items: [] });

    const created = await request(app).post("/api/triage").set(bearer(token)).send({ message: "Where is my order? Still waiting", customerId: c.id });
    expect(created.status).toBe(201);
    expect(created.body.category).toBe("delay");
    expect(sent).toHaveLength(0);

    const approved = await request(app).post(`/api/triage/${created.body.id}/approve`).set(bearer(token)).send({ body: "Edited by staff" });
    expect(approved.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("Edited by staff");
    expect(repos.tasks.rows).toHaveLength(1);
    expect((await request(app).post(`/api/triage/${created.body.id}/approve`).set(bearer(token)).send({})).status).toBe(409);
  });

  test("reject sends nothing", async () => {
    const { app, sent } = await build();
    const token = await login(app, "sam@x.com");
    const t = await request(app).post("/api/triage").set(bearer(token)).send({ message: "I want a refund please" });
    expect((await request(app).post(`/api/triage/${t.body.id}/reject`).set(bearer(token)).send({})).status).toBe(200);
    expect(sent).toHaveLength(0);
  });
});

describe("paginated lists", () => {
  test("customers support search, segment and pagination", async () => {
    const { app, repos } = await build();
    const token = await login(app, "sam@x.com");
    for (let i = 0; i < 12; i++) await repos.customers.upsertByEmail({ email: `u${i}@x.com`, firstName: `U${i}`, lastName: "T" });
    const page2 = await request(app).get("/api/customers?page=2&pageSize=10").set(bearer(token));
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.total).toBe(12);
    expect((await request(app).get("/api/customers?search=u3@").set(bearer(token))).body.total).toBe(1);
    expect((await request(app).get("/api/customers?segment=vip").set(bearer(token))).body.total).toBe(0);
  });
});
