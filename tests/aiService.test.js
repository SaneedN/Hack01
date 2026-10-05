const { createAiService } = require("../src/services/aiService");

const customer = { first_name: "John", last_name: "Doe", email: "j@x.com", total_spent: 1499, tags: "" };
const orders = [{ woocommerce_order_id: 1, status: "completed", currency: "INR", total: "1499", order_date: new Date() }];

describe("aiService (no API key => rule-based fallback)", () => {
  const ai = createAiService({});

  test("summarize returns a summary and next action", async () => {
    const r = await ai.summarize({ customer, orders, communications: [], notes: [] });
    expect(r.source).toBe("rules");
    expect(r.summary).toContain("John Doe");
    expect(r.nextBestAction).toMatch(/feedback/i);
  });

  test("draftReply returns an editable draft", async () => {
    const r = await ai.draftReply({ customer, orders, communications: [], notes: [] });
    expect(r.draft).toContain("Hi John");
  });
});
