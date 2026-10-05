const express = require("express");
const wrap = require("../utils/asyncHandler");

function orderRouter({ orders }) {
  const router = express.Router();

  router.get("/", wrap(async (req, res) => {
    res.json(await orders.list({ status: req.query.status }));
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
