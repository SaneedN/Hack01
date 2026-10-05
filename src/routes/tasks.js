const express = require("express");
const { z } = require("zod");
const wrap = require("../utils/asyncHandler");

function taskRouter({ tasks }) {
  const router = express.Router();
  router.get("/", wrap(async (req, res) => res.json(await tasks.list({ status: req.query.status || "open" }))));
  router.post("/", wrap(async (req, res) => {
    const b = z.object({ title: z.string().trim().min(1).max(250), customerId: z.number().optional(), orderId: z.number().optional() }).parse(req.body);
    res.status(201).json(await tasks.create({ ...b, source: "manual" }));
  }));
  router.post("/:id/complete", wrap(async (req, res) => {
    const ok = await tasks.complete(req.params.id);
    if (!ok) return res.status(404).json({ error: "Task not found" });
    res.json({ ok: true });
  }));
  return router;
}
module.exports = { taskRouter };
