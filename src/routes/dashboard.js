const express = require("express");
const wrap = require("../utils/asyncHandler");

function dashboardRouter({ customers, orders, delayDays }) {
  const router = express.Router();

  router.get("/", wrap(async (req, res) => {
    const [customerCount, summary, recentOrders, recentCustomers, delayedOrders] = await Promise.all([
      customers.count(),
      orders.summary(),
      orders.list({ limit: 5 }),
      customers.list(undefined, 5),
      orders.listDelayed(delayDays),
    ]);
    res.json({
      customers: customerCount,
      orders: summary.orders,
      revenue: summary.revenue,
      currency: summary.currency,
      delayDays,
      recentOrders,
      recentCustomers,
      delayedOrders,
    });
  }));

  return router;
}

module.exports = { dashboardRouter };
