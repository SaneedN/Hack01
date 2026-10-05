const express = require("express");
const { verifyWooSignature } = require("../services/webhookSignature");
const { wooOrderSchema } = require("../services/wooOrderSchema");

function webhookRouter(ingest, secret) {
  const router = express.Router();

  // Raw body is required: the signature is computed over the exact bytes received.
  router.post("/woocommerce", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
    if (!secret) return res.status(500).json({ error: "WOO_WEBHOOK_SECRET is not configured" });

    const raw = req.body;
    if (!verifyWooSignature(raw, req.header("x-wc-webhook-signature"), secret)) {
      return res.status(401).json({ error: "invalid signature" });
    }

    let json;
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      // WooCommerce sends a form-encoded "ping" when a webhook is created
      return res.status(200).json({ ok: true, ignored: "non-json ping" });
    }

    // Draft/abandoned orders can arrive without an email: skip, don't fail
    if (json && json.billing && !json.billing.email) {
      return res.status(200).json({ ok: true, ignored: "order has no billing email" });
    }

    const parsed = wooOrderSchema.safeParse(json);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid order payload", details: parsed.error.flatten() });
    }

    try {
      const { customer, order } = await ingest.ingest(parsed.data);
      return res.status(200).json({ ok: true, customerId: customer.id, orderId: order.id });
    } catch (err) {
      console.error("[webhook] ingest failed:", err);
      return res.status(500).json({ error: "ingest failed" });
    }
  });

  return router;
}

module.exports = { webhookRouter };
