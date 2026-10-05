const express = require("express");
const { z } = require("zod");
const wrap = require("../utils/asyncHandler");
const { segmentOf, paginate } = require("../services/analyticsService");

function customerRouter({ customers, orders, communications, email, ai }) {
  const router = express.Router();

  async function loadContext(id) {
    const customer = await customers.findById(id);
    if (!customer) return null;
    const [custOrders, comms, notes] = await Promise.all([
      orders.listByCustomer(customer.id),
      communications.listByCustomer(customer.id),
      customers.listNotes(customer.id),
    ]);
    return { customer, orders: custOrders, communications: comms, notes };
  }

  // Paginated: ?search=&segment=vip|at-risk|new|regular&sort=spent|orders|recent&page=&pageSize=
  router.get("/", wrap(async (req, res) => {
    const { search, segment, sort = "recent", page, pageSize } = req.query;
    let rows = (await customers.list(search, 1000)).map((c) => ({ ...c, segment: segmentOf(c) }));
    if (segment) rows = rows.filter((c) => c.segment === segment);
    if (sort === "spent") rows.sort((a, b) => b.total_spent - a.total_spent);
    else if (sort === "orders") rows.sort((a, b) => b.order_count - a.order_count);
    res.json(paginate(rows, page, pageSize));
  }));

  router.get("/:id", wrap(async (req, res) => {
    const ctx = await loadContext(req.params.id);
    if (!ctx) return res.status(404).json({ error: "Customer not found" });
    res.json({ ...ctx.customer, segment: segmentOf(ctx.customer), orders: ctx.orders, communications: ctx.communications, notes: ctx.notes });
  }));

  router.patch("/:id/tags", wrap(async (req, res) => {
    const { tags } = z.object({ tags: z.array(z.string().trim().min(1)).max(10) }).parse(req.body);
    const customer = await customers.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    await customers.setTags(customer.id, tags.join(","));
    res.json({ ok: true, tags: tags.join(",") });
  }));

  router.post("/:id/notes", wrap(async (req, res) => {
    const { note } = z.object({ note: z.string().trim().min(1) }).parse(req.body);
    const customer = await customers.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    await customers.addNote(customer.id, note);
    res.status(201).json({ ok: true });
  }));

  router.post("/:id/messages", wrap(async (req, res) => {
    const body = z
      .object({ subject: z.string().trim().min(1), message: z.string().trim().min(1), orderId: z.number().optional() })
      .parse(req.body);
    const customer = await customers.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const result = await email.send({ to: customer.email, subject: body.subject, text: body.message });
    const saved = await communications.create({
      customerId: customer.id,
      orderId: body.orderId ?? null,
      type: "manual_email",
      subject: body.subject,
      message: body.message,
      status: result.status,
    });
    res.status(201).json(saved);
  }));

  router.post("/:id/ai-summary", wrap(async (req, res) => {
    const ctx = await loadContext(req.params.id);
    if (!ctx) return res.status(404).json({ error: "Customer not found" });
    res.json(await ai.summarize(ctx));
  }));

  router.post("/:id/draft-reply", wrap(async (req, res) => {
    const ctx = await loadContext(req.params.id);
    if (!ctx) return res.status(404).json({ error: "Customer not found" });
    const { intent } = z.object({ intent: z.string().optional() }).parse(req.body || {});
    res.json(await ai.draftReply({ ...ctx, intent }));
  }));

  return router;
}

module.exports = { customerRouter };
