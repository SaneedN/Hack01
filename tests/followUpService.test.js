const { createMemoryRepos } = require("./helpers/memoryRepos");
const { createFollowUpService } = require("../src/services/followUpService");

describe("delayed-order follow-ups", () => {
  async function setup() {
    const repos = createMemoryRepos();
    const c = await repos.customers.upsertByEmail({ email: "a@x.com", firstName: "Asha", lastName: "N" });
    const old = new Date(Date.now() - 6 * 86400000).toISOString();
    await repos.orders.upsert({ wooOrderId: 1, customerId: c.id, orderDate: old, status: "processing", total: 10, currency: "INR", items: [] });
    await repos.orders.upsert({ wooOrderId: 2, customerId: c.id, orderDate: new Date().toISOString(), status: "processing", total: 10, currency: "INR", items: [] });
    const sent = [];
    const email = { send: async (m) => { sent.push(m); return { status: "simulated" }; } };
    return { ...repos, sent, svc: createFollowUpService({ ...repos, email, delayDays: 3 }) };
  }

  test("emails delayed orders once and opens a task", async () => {
    const { svc, sent, tasks } = await setup();
    const first = await svc.run();
    expect(first).toEqual({ checked: 1, notified: 1, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(tasks.rows).toHaveLength(1);
    const second = await svc.run();
    expect(second.notified).toBe(0);
    expect(second.skipped).toBe(1);
    expect(sent).toHaveLength(1);
  });
});
