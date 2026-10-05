const express = require("express");
const cors = require("cors");
const path = require("path");
const { OrderIngestService } = require("./services/orderIngestService");
const { webhookRouter } = require("./routes/webhooks");
const { customerRouter } = require("./routes/customers");
const { orderRouter } = require("./routes/orders");
const { dashboardRouter } = require("./routes/dashboard");

/** Composition root: pure function of its dependencies, so tests can inject fakes. */
function createApp(deps) {
  const { customers, orders, events, webhookSecret, healthCheck, delayDays = 3 } = deps;
  const app = express();
  app.use(cors());

  const ingest = new OrderIngestService(customers, orders, events);

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.get("/health/db", async (req, res) => {
    if (!healthCheck) return res.json({ db: "not configured" });
    try {
      res.json({ db: "connected", ...(await healthCheck()) });
    } catch (err) {
      res.status(500).json({ db: "error", message: err.message });
    }
  });

  // Webhook mounted BEFORE express.json(): it needs the raw body for signature checks
  app.use("/webhooks", webhookRouter(ingest, webhookSecret));

  app.use(express.json());
  app.use("/api/dashboard", dashboardRouter({ customers, orders, delayDays }));
  app.use("/api/customers", customerRouter(deps));
  app.use("/api/orders", orderRouter(deps));

  app.use(express.static(path.join(__dirname, "..", "public")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.flatten() });
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  });

  return app;
}

module.exports = { createApp };
