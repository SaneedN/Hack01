const express = require("express");
const wrap = require("../utils/asyncHandler");
const { segmentOf, revenueByDay, statusCounts } = require("../services/analyticsService");

function dashboardRouter({ customers, orders, tasks, triage, delayDays }) {
  const router = express.Router();

  router.get("/", wrap(async (req, res) => {
    const [customerCount, summary, recentOrders, allCustomers, delayedOrders, allOrders, openTasks, pendingTriage] = await Promise.all([
      customers.count(),
      orders.summary(),
      orders.list({ limit: 5 }),
      customers.list(undefined, 1000),
      orders.listDelayed(delayDays),
      orders.list({ limit: 1000 }),
      tasks ? tasks.list({ status: "open" }) : [],
      triage ? triage.list({ status: "pending" }) : [],
    ]);
    const segments = { vip: 0, "at-risk": 0, new: 0, regular: 0 };
    allCustomers.forEach((c) => { segments[segmentOf(c)]++; });

    res.json({
      customers: customerCount,
      orders: summary.orders,
      revenue: summary.revenue,
      currency: summary.currency,
      delayDays,
      recentOrders,
      recentCustomers: allCustomers.slice(0, 5),
      delayedOrders,
      segments,
      revenueByDay: revenueByDay(allOrders, 14),
      statusCounts: statusCounts(allOrders),
      openTasks: openTasks.length,
      pendingTriage: pendingTriage.length,
    });
  }));

  return router;
}

module.exports = { dashboardRouter };
