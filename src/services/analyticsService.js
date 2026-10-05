/** Pure functions for customer segments and dashboard analytics (no DB access). */
const DAY = 86400000;

/** vip: 3+ orders or high spend; at-risk: has bought before but not in 30+ days; new: single recent order; regular: the rest. */
function segmentOf(c, now = Date.now(), { vipSpend = 10000, vipOrders = 3, atRiskDays = 30 } = {}) {
  const orders = Number(c.order_count || 0);
  const spent = Number(c.total_spent || 0);
  const last = c.last_order_date ? new Date(c.last_order_date).getTime() : null;
  if (orders === 0) return "new";
  if (orders >= vipOrders || spent >= vipSpend) return last && now - last > atRiskDays * DAY ? "at-risk" : "vip";
  if (last && now - last > atRiskDays * DAY) return "at-risk";
  return orders === 1 ? "new" : "regular";
}

function revenueByDay(orders, days = 14, now = Date.now()) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) buckets.push({ date: new Date(now - i * DAY).toISOString().slice(0, 10), revenue: 0, orders: 0 });
  const index = Object.fromEntries(buckets.map((b, i) => [b.date, i]));
  for (const o of orders) {
    const key = new Date(o.order_date).toISOString().slice(0, 10);
    if (key in index) {
      buckets[index[key]].orders++;
      if (!["cancelled", "refunded", "failed"].includes(o.status)) buckets[index[key]].revenue += Number(o.total);
    }
  }
  return buckets;
}

function statusCounts(orders) {
  const out = {};
  for (const o of orders) out[o.status] = (out[o.status] || 0) + 1;
  return out;
}

function paginate(items, page = 1, pageSize = 10) {
  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
  const total = items.length;
  const pages = Math.max(Math.ceil(total / size), 1);
  const p = Math.min(Math.max(Number(page) || 1, 1), pages);
  return { items: items.slice((p - 1) * size, p * size), total, page: p, pageSize: size, pages };
}

module.exports = { segmentOf, revenueByDay, statusCounts, paginate };
