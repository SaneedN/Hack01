/**
 * Delayed-order automation: finds orders stuck in "processing" past the threshold,
 * emails the customer once (idempotent via the communications log) and opens a staff task.
 * Run on a schedule (startFollowUpScheduler) or on demand (admin endpoint).
 */
const TYPE = "delay_notice";

function createFollowUpService({ orders, customers, communications, tasks, email, delayDays = 3 }) {
  return {
    async run() {
      const delayed = await orders.listDelayed(delayDays);
      const result = { checked: delayed.length, notified: 0, skipped: 0 };
      for (const o of delayed) {
        if (await communications.existsForOrder(o.id, TYPE)) { result.skipped++; continue; }
        const customer = await customers.findById(o.customer_id);
        if (!customer) { result.skipped++; continue; }
        const subject = `Update on your order #${o.woocommerce_order_id}`;
        const text = `Hi ${customer.first_name || "there"},\n\nYour order #${o.woocommerce_order_id} is taking longer than expected to ship. We're on it and will update you as soon as it moves. Sorry for the wait!\n\nBest regards,\nSupport Team`;
        try {
          const sent = await email.send({ to: customer.email, subject, text });
          await communications.create({ customerId: customer.id, orderId: o.id, type: TYPE, subject, message: text, status: sent.status });
          await tasks.create({ customerId: customer.id, orderId: o.id, title: `Follow up on delayed order #${o.woocommerce_order_id}`, source: "automation" });
          result.notified++;
        } catch (err) {
          console.error("[followup] failed for order", o.id, err.message);
          result.skipped++;
        }
      }
      return result;
    },
  };
}

function startFollowUpScheduler(service, minutes) {
  if (!minutes || minutes <= 0) return null;
  const tick = () => service.run().then((r) => r.notified && console.log("[followup]", r)).catch((e) => console.error("[followup]", e.message));
  const timer = setInterval(tick, minutes * 60000);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
  return timer;
}

module.exports = { createFollowUpService, startFollowUpScheduler, TYPE };
