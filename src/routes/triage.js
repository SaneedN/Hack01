const express = require("express");
const { z } = require("zod");
const wrap = require("../utils/asyncHandler");

function triageRouter({ triage, triageAgent, customers, email, communications, tasks }) {
  const router = express.Router();

  router.get("/", wrap(async (req, res) => res.json(await triage.list({ status: req.query.status || "pending" }))));

  router.post("/", wrap(async (req, res) => {
    const body = z.object({
      message: z.string().trim().min(3).max(4000),
      customerId: z.number().optional(),
      email: z.string().trim().email().optional(),
    }).parse(req.body);
    const result = await triageAgent.triage(body);
    res.status(201).json(await triage.create(result));
  }));

  // Human-in-the-loop: nothing is emailed until staff approve (optionally editing the draft).
  router.post("/:id/approve", wrap(async (req, res) => {
    const item = await triage.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Triage item not found" });
    if (item.status !== "pending") return res.status(409).json({ error: `Already ${item.status}` });
    const { subject, body } = z.object({ subject: z.string().trim().min(1).optional(), body: z.string().trim().min(1).optional() }).parse(req.body || {});

    let sendStatus = "no customer";
    if (item.customer_id) {
      const customer = await customers.findById(item.customer_id);
      const text = body || item.draft_reply;
      const subj = subject || `Re: your message (${item.category})`;
      const sent = await email.send({ to: customer.email, subject: subj, text });
      await communications.create({ customerId: customer.id, orderId: item.order_id, type: "ai_triage_reply", subject: subj, message: text, status: sent.status });
      sendStatus = sent.status;
    }
    if (item.suggested_task) {
      await tasks.create({ customerId: item.customer_id, orderId: item.order_id, title: item.suggested_task, source: "triage" });
    }
    await triage.resolve(item.id, "approved");
    res.json({ ok: true, email: sendStatus });
  }));

  router.post("/:id/reject", wrap(async (req, res) => {
    const item = await triage.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Triage item not found" });
    if (item.status !== "pending") return res.status(409).json({ error: `Already ${item.status}` });
    await triage.resolve(item.id, "rejected");
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { triageRouter };
