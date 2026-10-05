/**
 * AI features: customer summary + next best action, and reply drafting.
 * Uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise (or on any
 * failure) falls back to deterministic rules so the demo never breaks.
 * Humans stay in the loop: drafts are shown to staff and only sent on approval.
 */
const fullName = (c) => `${c.first_name} ${c.last_name}`.trim() || c.email;

function buildContext(customer, orders, communications, notes) {
  const lines = [
    `Customer: ${fullName(customer)} (${customer.email})`,
    `Tags: ${customer.tags || "none"}`,
    `Orders: ${orders.length}, total spent: ${customer.total_spent ?? 0}`,
    "Recent orders:",
    ...orders.slice(0, 5).map((o) => `- #${o.woocommerce_order_id} ${o.status} ${o.currency} ${o.total} on ${new Date(o.order_date).toISOString().slice(0, 10)}`),
    "Recent communications:",
    ...communications.slice(0, 5).map((m) => `- [${m.type}] ${m.subject || ""}: ${String(m.message).slice(0, 120)}`),
    "Staff notes:",
    ...notes.slice(0, 5).map((n) => `- ${n.note}`),
  ];
  return lines.join("\n");
}

async function askClaude({ system, prompt, env }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.AI_MODEL || "claude-sonnet-5-5",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function ruleBasedSummary(customer, orders) {
  const n = orders.length;
  const latest = orders[0];
  const summary =
    `${fullName(customer)} is a ${n > 1 ? "returning" : "new"} customer with ${n} order${n === 1 ? "" : "s"}` +
    ` totalling ${Number(customer.total_spent || 0).toFixed(2)}.` +
    (latest ? ` Latest order #${latest.woocommerce_order_id} is ${latest.status}.` : "");
  let nextBestAction = "No action needed right now.";
  if (latest) {
    const ageDays = (Date.now() - new Date(latest.order_date).getTime()) / 86400000;
    if (latest.status === "processing" && ageDays > 3) nextBestAction = "Order has been processing for several days: follow up on delivery status.";
    else if (latest.status === "completed") nextBestAction = "Ask for feedback and suggest related products.";
    else if (["refunded", "cancelled"].includes(latest.status)) nextBestAction = "Reach out to understand the issue and offer help.";
  }
  return { summary, nextBestAction };
}

function createAiService(env = process.env) {
  const enabled = Boolean(env.ANTHROPIC_API_KEY);

  return {
    async summarize({ customer, orders, communications, notes }) {
      if (enabled) {
        try {
          const text = await askClaude({
            env,
            system: "You are a CRM assistant. Reply ONLY with JSON: {\"summary\": string (2-3 sentences), \"nextBestAction\": string (one sentence)}. No markdown.",
            prompt: buildContext(customer, orders, communications, notes),
          });
          const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
          return { summary: parsed.summary, nextBestAction: parsed.nextBestAction, source: "claude" };
        } catch (err) {
          console.error("[ai] summary fallback:", err.message);
        }
      }
      return { ...ruleBasedSummary(customer, orders), source: "rules" };
    },

    async draftReply({ customer, orders, communications, notes, intent }) {
      const goal = intent || "follow up on their latest order";
      if (enabled) {
        try {
          const text = await askClaude({
            env,
            system: "You draft short, friendly, professional customer emails for a store. Output only the email body, no subject line.",
            prompt: `${buildContext(customer, orders, communications, notes)}\n\nWrite an email to this customer to: ${goal}.`,
          });
          return { draft: text.trim(), source: "claude" };
        } catch (err) {
          console.error("[ai] draft fallback:", err.message);
        }
      }
      const latest = orders[0];
      return {
        draft: `Hi ${customer.first_name || "there"},\n\nI'm following up to ${goal}${latest ? ` (order #${latest.woocommerce_order_id})` : ""}. Let us know if there's anything we can help with.\n\nBest regards,\nSupport Team`,
        source: "rules",
      };
    },
  };
}

module.exports = { createAiService, buildContext, ruleBasedSummary };
