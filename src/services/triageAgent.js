/**
 * Agentic triage: reads a customer message, uses tools to look up real order data,
 * then returns a classification + draft reply + suggested follow-up task.
 *
 * - With ANTHROPIC_API_KEY: a Claude tool-use loop (max MAX_STEPS rounds).
 * - Without it (or on any failure): a deterministic rules agent that performs the same lookups.
 * The agent never sends anything: output is queued for staff approval.
 */
const MAX_STEPS = 5;
const CATEGORIES = ["refund", "delay", "cancellation", "question", "complaint", "other"];

const TOOLS = [
  {
    name: "get_customer_orders",
    description: "List the customer's orders (WooCommerce order id, status, total, date). Use first to see what the customer bought.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_order_details",
    description: "Get one order's items and status timeline by WooCommerce order id.",
    input_schema: { type: "object", properties: { woo_order_id: { type: "number" } }, required: ["woo_order_id"] },
  },
  {
    name: "submit_triage",
    description: "Final step. Submit the classification and a draft reply for staff approval.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORIES },
        urgency: { type: "string", enum: ["low", "normal", "high"] },
        summary: { type: "string", description: "One sentence for staff" },
        draft_reply: { type: "string", description: "Short friendly email body, no subject" },
        suggested_task: { type: "string", description: "Optional internal follow-up task" },
        order_woo_id: { type: "number", description: "Order this relates to, if any" },
      },
      required: ["category", "urgency", "summary", "draft_reply"],
    },
  },
];

const RULES = [
  ["refund", /refund|money back|charged twice|overcharg/i, "high"],
  ["cancellation", /cancel/i, "normal"],
  ["delay", /late|delay|where is|not (yet )?(arrived|received|delivered)|still waiting|tracking|shipping/i, "high"],
  ["complaint", /broken|damaged|defect|terrible|worst|angry|unhappy|disappointed|wrong item/i, "high"],
  ["question", /\?|how|what|when|do you|can i|could you/i, "normal"],
];

function classify(message) {
  for (const [category, re, urgency] of RULES) if (re.test(message)) return { category, urgency };
  return { category: "other", urgency: "normal" };
}

function ruleReply({ category, customer, order }) {
  const hi = `Hi ${customer?.first_name || "there"},\n\n`;
  const ref = order ? ` (order #${order.woocommerce_order_id})` : "";
  const bodies = {
    refund: `I'm sorry about the trouble${ref}. We're reviewing your refund request and will confirm the outcome within 2 business days.`,
    delay: `Thanks for your patience${ref}. We're checking the delivery status and will update you shortly.`,
    cancellation: `We've received your cancellation request${ref} and are checking whether it can still be stopped. We'll confirm shortly.`,
    complaint: `I'm very sorry about this${ref}. We'd like to put it right: could you share a photo or more detail so we can arrange a fix?`,
    question: `Thanks for reaching out${ref}. Here's what we can tell you so far, and we'll follow up if we need anything else.`,
    other: `Thanks for getting in touch${ref}. A member of our team will look into this and reply soon.`,
  };
  return `${hi}${bodies[category]}\n\nBest regards,\nSupport Team`;
}

function createTriageAgent({ customers, orders, env = process.env, fetchImpl = globalThis.fetch }) {
  const enabled = Boolean(env.ANTHROPIC_API_KEY);

  async function resolveCustomer({ customerId, email }) {
    if (customerId) return customers.findById(customerId);
    if (email) return customers.findByEmail(email);
    return null;
  }

  /** Tool implementations: read-only lookups scoped to the resolved customer. */
  function makeToolRunner(customer) {
    return async (name, input) => {
      if (!customer) return { error: "Customer not identified" };
      if (name === "get_customer_orders") {
        const list = await orders.listByCustomer(customer.id);
        return list.slice(0, 10).map((o) => ({ woo_order_id: o.woocommerce_order_id, status: o.status, total: o.total, currency: o.currency, date: o.order_date }));
      }
      if (name === "get_order_details") {
        const o = await orders.findByWooId(Number(input.woo_order_id));
        if (!o || o.customer_id !== customer.id) return { error: "Order not found for this customer" };
        const full = (await orders.getWithDetails?.(o.id)) || o;
        return { woo_order_id: o.woocommerce_order_id, status: o.status, total: o.total, items: full.items || [], history: full.history || [] };
      }
      return { error: `Unknown tool ${name}` };
    };
  }

  async function callClaude(messages, system) {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env.AI_MODEL || "claude-sonnet-5-5", max_tokens: 1000, system, tools: TOOLS, messages }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    return res.json();
  }

  async function runClaude(message, customer, runTool, steps) {
    const system =
      "You are a support triage agent for an online store. Look up the customer's orders with the tools before answering, " +
      "then call submit_triage exactly once. Never promise refunds or dates you cannot verify from the tools. Replies are drafts reviewed by staff.";
    const messages = [{ role: "user", content: `Customer: ${customer ? `${customer.first_name} ${customer.last_name} <${customer.email}>` : "unknown"}\nMessage:\n${message}` }];

    for (let i = 0; i < MAX_STEPS; i++) {
      const data = await callClaude(messages, system);
      const uses = data.content.filter((b) => b.type === "tool_use");
      const submit = uses.find((b) => b.name === "submit_triage");
      if (submit) return submit.input;
      if (!uses.length) break;
      messages.push({ role: "assistant", content: data.content });
      const results = [];
      for (const u of uses) {
        const out = await runTool(u.name, u.input || {});
        steps.push({ tool: u.name, input: u.input || {}, ok: !out.error });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
    }
    throw new Error("Agent did not submit a triage result");
  }

  async function runRules(message, customer, runTool, steps) {
    const { category, urgency } = classify(message);
    let order = null;
    if (customer) {
      const list = await runTool("get_customer_orders", {});
      steps.push({ tool: "get_customer_orders", input: {}, ok: true });
      const mentioned = String(message).match(/#?(\d{3,})/);
      const pick = (mentioned && list.find((o) => String(o.woo_order_id) === mentioned[1])) || list[0];
      if (pick) {
        await runTool("get_order_details", { woo_order_id: pick.woo_order_id });
        steps.push({ tool: "get_order_details", input: { woo_order_id: pick.woo_order_id }, ok: true });
        order = { woocommerce_order_id: pick.woo_order_id, status: pick.status };
      }
    }
    const taskByCat = { refund: "Review refund request", delay: "Check delivery status with carrier", cancellation: "Confirm cancellation eligibility", complaint: "Call customer to resolve complaint" };
    return {
      category,
      urgency,
      summary: `Customer message looks like a ${category}${order ? ` about order #${order.woocommerce_order_id} (${order.status})` : ""}.`,
      draft_reply: ruleReply({ category, customer, order }),
      suggested_task: taskByCat[category] || null,
      order_woo_id: order?.woocommerce_order_id,
    };
  }

  return {
    /** @returns {Promise<object>} triage fields ready to persist (status pending, nothing sent) */
    async triage({ message, customerId, email }) {
      const customer = await resolveCustomer({ customerId, email });
      const runTool = makeToolRunner(customer);
      const steps = [];
      let result, source = "rules";

      if (enabled) {
        try {
          result = await runClaude(message, customer, runTool, steps);
          source = "claude";
        } catch (err) {
          console.error("[triage] claude fallback:", err.message);
          steps.length = 0;
        }
      }
      if (!result) result = await runRules(message, customer, runTool, steps);

      const category = CATEGORIES.includes(result.category) ? result.category : "other";
      const wooId = result.order_woo_id;
      const order = wooId ? await orders.findByWooId(Number(wooId)) : null;
      return {
        customerId: customer?.id ?? null,
        orderId: order && customer && order.customer_id === customer.id ? order.id : null,
        message,
        category,
        urgency: ["low", "normal", "high"].includes(result.urgency) ? result.urgency : "normal",
        summary: String(result.summary || "").slice(0, 500),
        draftReply: String(result.draft_reply || ""),
        suggestedTask: result.suggested_task ? String(result.suggested_task).slice(0, 250) : null,
        steps,
        source,
      };
    },
  };
}

module.exports = { createTriageAgent, classify, TOOLS };
