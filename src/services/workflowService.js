const name = (c) => c.first_name || "there";
const money = (o) => `${o.currency} ${Number(o.total).toFixed(2)}`;
const itemsText = (o) =>
  o.items && o.items.length ? "\n" + o.items.map((i) => `  - ${i.name} x ${i.quantity}`).join("\n") + "\n" : "";

const templates = {
  order_confirmation: (c, o) => ({
    subject: `Order #${o.woocommerce_order_id} confirmed`,
    text: `Hi ${name(c)},\n\nThanks for your order #${o.woocommerce_order_id} (${money(o)}).${itemsText(o)}\nWe'll let you know when it ships.\n`,
  }),
  order_shipped: (c, o) => ({
    subject: `Order #${o.woocommerce_order_id} is on its way`,
    text: `Hi ${name(c)},\n\nGood news: your order #${o.woocommerce_order_id} has been completed and is on its way.\n`,
  }),
  order_cancelled: (c, o) => ({
    subject: `Order #${o.woocommerce_order_id} cancelled`,
    text: `Hi ${name(c)},\n\nYour order #${o.woocommerce_order_id} has been cancelled. Reply to this email if you need help.\n`,
  }),
  order_refunded: (c, o) => ({
    subject: `Refund issued for order #${o.woocommerce_order_id}`,
    text: `Hi ${name(c)},\n\nWe've refunded order #${o.woocommerce_order_id} (${money(o)}). It may take a few days to appear.\n`,
  }),
};

// Default WooCommerce has no "shipped" status, so "completed" is treated as shipped.
const STATUS_TO_TEMPLATE = {
  completed: "order_shipped",
  cancelled: "order_cancelled",
  refunded: "order_refunded",
};

/** Subscribes communication workflows to CRM events. Failures never break ingestion. */
function registerWorkflows({ events, email, communications }) {
  async function notify(customer, order, type) {
    try {
      const { subject, text } = templates[type](customer, order);
      const result = await email.send({ to: customer.email, subject, text });
      await communications.create({
        customerId: customer.id,
        orderId: order.id,
        type,
        subject,
        message: text,
        status: result.status,
      });
    } catch (err) {
      console.error(`[workflow] ${type} failed:`, err.message);
    }
  }

  events.on("order.created", ({ customer, order }) => notify(customer, order, "order_confirmation"));
  events.on("order.status_changed", ({ customer, order }) => {
    const type = STATUS_TO_TEMPLATE[order.status];
    if (type) return notify(customer, order, type);
  });
}

module.exports = { registerWorkflows, templates };
