const express = require("express");
const wrap = require("../utils/asyncHandler");
const { paginate } = require("../services/analyticsService");

function orderRouter({ orders }) {
  const router = express.Router();

  router.get("/", wrap(async (req, res) => {
    const { status, search, page, pageSize } = req.query;
    let rows = await orders.list({ status, limit: 1000 });
    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter((o) => `${o.woocommerce_order_id} ${o.first_name || ""} ${o.last_name || ""} ${o.email || ""}`.toLowerCase().includes(q));
    }
    res.json(paginate(rows, page, pageSize));
  }));

  // must come before "/:id"
  router.get("/delayed", wrap(async (req, res) => {
    res.json(await orders.listDelayed(Number(req.query.days) || 3));
  }));

  router.get("/:id", wrap(async (req, res) => {
    const order = await orders.getWithDetails(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  }));

  return router;
}

module.exports = { orderRouter };
