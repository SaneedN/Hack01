const express = require("express");
const cors = require("cors");
const path = require("path");
const { OrderIngestService } = require("./services/orderIngestService");
const { webhookRouter } = require("./routes/webhooks");
const { customerRouter } = require("./routes/customers");
const { orderRouter } = require("./routes/orders");
const { dashboardRouter } = require("./routes/dashboard");
const { authRouter } = require("./routes/auth");
const { triageRouter } = require("./routes/triage");
const { taskRouter } = require("./routes/tasks");
const { adminRouter } = require("./routes/admin");
const { requireAuth, requireRole } = require("./middleware/auth");

/** Composition root: pure function of its dependencies, so tests can inject fakes. */
function createApp(deps) {
  const { customers, orders, events, webhookSecret, healthCheck, delayDays = 3, authService, users, tasks, triage } = deps;
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

  // Auth: when an authService is provided every /api route except login requires a valid JWT.
  // (Omitting it leaves the API open: only used by unit/e2e tests that don't care about auth.)
  if (authService) {
    app.use("/api/auth", authRouter({ users, authService, allowRegistration: deps.allowRegistration !== false }));
    app.use("/api", requireAuth(authService));
  }
  const adminOnly = authService ? [requireRole()] : [];

  app.use("/api/dashboard", dashboardRouter({ customers, orders, tasks, triage, delayDays }));
  app.use("/api/customers", customerRouter(deps));
  app.use("/api/orders", orderRouter(deps));
  if (tasks) app.use("/api/tasks", taskRouter(deps));
  if (triage && deps.triageAgent) app.use("/api/triage", triageRouter(deps));
  app.use("/api/admin", ...adminOnly, adminRouter(deps));

  app.use(express.static(path.join(__dirname, "..", "public")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.flatten() });
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  });

  return app;
}

module.exports = { createApp };
