const { createMemoryRepos } = require("./helpers/memoryRepos");
const { createTriageAgent, classify } = require("../src/services/triageAgent");

async function setup() {
  const repos = createMemoryRepos();
  const customer = await repos.customers.upsertByEmail({ email: "asha@example.com", firstName: "Asha", lastName: "Naik" });
  const order = await repos.orders.upsert({ wooOrderId: 5001, customerId: customer.id, orderDate: "2026-09-01 10:00:00", status: "processing", total: 1499, currency: "INR", items: [] });
  return { ...repos, customer, order };
}

describe("classify", () => {
  test("maps messages to categories", () => {
    expect(classify("I want my money back").category).toBe("refund");
    expect(classify("Where is my package? still waiting").category).toBe("delay");
    expect(classify("please cancel it").category).toBe("cancellation");
    expect(classify("The item arrived damaged").category).toBe("complaint");
    expect(classify("hello").category).toBe("other");
  });
});

describe("triage agent (rules mode, no API key)", () => {
  test("looks up orders with tools and drafts a reply", async () => {
    const { customers, orders, customer } = await setup();
    const agent = createTriageAgent({ customers, orders, env: {} });
    const r = await agent.triage({ message: "Where is my order #5001? Still waiting", email: "asha@example.com" });
    expect(r.source).toBe("rules");
    expect(r.category).toBe("delay");
    expect(r.customerId).toBe(customer.id);
    expect(r.steps.map((s) => s.tool)).toEqual(["get_customer_orders", "get_order_details"]);
    expect(r.draftReply).toContain("Hi Asha");
    expect(r.draftReply).toContain("5001");
    expect(r.suggestedTask).toBeTruthy();
  });

  test("handles unknown customers without crashing", async () => {
    const { customers, orders } = await setup();
    const agent = createTriageAgent({ customers, orders, env: {} });
    const r = await agent.triage({ message: "I need a refund", email: "nobody@example.com" });
    expect(r.customerId).toBeNull();
    expect(r.steps).toHaveLength(0);
    expect(r.category).toBe("refund");
  });
});

describe("triage agent (Claude tool-use loop, mocked API)", () => {
  test("runs tools then submits the result", async () => {
    const { customers, orders, customer } = await setup();
    const replies = [
      { content: [{ type: "tool_use", id: "t1", name: "get_customer_orders", input: {} }] },
      { content: [{ type: "tool_use", id: "t2", name: "submit_triage", input: { category: "delay", urgency: "high", summary: "Late order", draft_reply: "Hi Asha, sorry!", order_woo_id: 5001 } }] },
    ];
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => replies.shift() };
    };
    const agent = createTriageAgent({ customers, orders, env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
    const r = await agent.triage({ message: "late!", customerId: customer.id });
    expect(r.source).toBe("claude");
    expect(r.category).toBe("delay");
    expect(r.orderId).not.toBeNull();
    expect(r.steps.map((s) => s.tool)).toEqual(["get_customer_orders"]);
    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toHaveLength(3); // user, assistant tool_use, user tool_result
  });

  test("falls back to rules when the API fails", async () => {
    const { customers, orders } = await setup();
    const fetchImpl = async () => ({ ok: false, status: 500 });
    const agent = createTriageAgent({ customers, orders, env: { ANTHROPIC_API_KEY: "k" }, fetchImpl });
    const r = await agent.triage({ message: "refund please", email: "asha@example.com" });
    expect(r.source).toBe("rules");
    expect(r.category).toBe("refund");
  });
});
