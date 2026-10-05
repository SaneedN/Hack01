require("dotenv").config();
const pool = require("./config/db");
const { createApp } = require("./app");
const { createEventBus } = require("./events/bus");
const { createCustomerRepository } = require("./repositories/customerRepository");
const { createOrderRepository } = require("./repositories/orderRepository");
const { createCommunicationRepository } = require("./repositories/communicationRepository");
const { createUserRepository } = require("./repositories/userRepository");
const { createTaskRepository } = require("./repositories/taskRepository");
const { createTriageRepository } = require("./repositories/triageRepository");
const { createEmailService } = require("./services/emailService");
const { createAiService } = require("./services/aiService");
const { createTriageAgent } = require("./services/triageAgent");
const { registerWorkflows } = require("./services/workflowService");
const { createAuthService, hashPassword } = require("./services/authService");
const { createFollowUpService, startFollowUpScheduler } = require("./services/followUpService");
const { createWooClient } = require("./services/wooClient");
const { createWooSyncService } = require("./services/wooSyncService");
const { OrderIngestService } = require("./services/orderIngestService");

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Add a long random string to your .env (see .env.example).");
  process.exit(1);
}

const customers = createCustomerRepository(pool);
const orders = createOrderRepository(pool);
const communications = createCommunicationRepository(pool);
const users = createUserRepository(pool);
const tasks = createTaskRepository(pool);
const triage = createTriageRepository(pool);
const email = createEmailService();
const ai = createAiService();
const events = createEventBus();
const delayDays = Number(process.env.DELAY_DAYS || 3);

registerWorkflows({ events, email, communications });

const triageAgent = createTriageAgent({ customers, orders });
const followUps = createFollowUpService({ orders, customers, communications, tasks, email, delayDays });
// Silent bus: importing historical orders must never send customer emails.
const wooSync = createWooSyncService({
  client: createWooClient(),
  ingest: new OrderIngestService(customers, orders, { emit() {} }),
});

const app = createApp({
  customers, orders, communications, users, tasks, triage,
  events, email, ai, triageAgent, followUps, wooSync,
  authService: createAuthService({ secret: process.env.JWT_SECRET }),
  allowRegistration: process.env.ALLOW_REGISTRATION !== "false",
  webhookSecret: process.env.WOO_WEBHOOK_SECRET,
  delayDays,
  healthCheck: async () => ({ customers: await customers.count() }),
});

async function bootstrapAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if ((await users.count()) > 0) return;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn("No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart to create the first admin.");
    return;
  }
  await users.create({ name: "Admin", email: ADMIN_EMAIL.trim().toLowerCase(), passwordHash: hashPassword(ADMIN_PASSWORD), role: "admin" });
  console.log(`Created first admin user: ${ADMIN_EMAIL}`);
}

const port = process.env.PORT || 3000;
bootstrapAdmin()
  .catch((e) => console.error("[bootstrap]", e.message))
  .finally(() => {
    app.listen(port, () => console.log(`CRM running on http://localhost:${port}`));
    startFollowUpScheduler(followUps, Number(process.env.FOLLOWUP_INTERVAL_MINUTES ?? 60));
  });
