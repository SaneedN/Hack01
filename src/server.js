require("dotenv").config();
const pool = require("./config/db");
const { createApp } = require("./app");
const { createEventBus } = require("./events/bus");
const { createCustomerRepository } = require("./repositories/customerRepository");
const { createOrderRepository } = require("./repositories/orderRepository");
const { createCommunicationRepository } = require("./repositories/communicationRepository");
const { createEmailService } = require("./services/emailService");
const { createAiService } = require("./services/aiService");
const { registerWorkflows } = require("./services/workflowService");

const customers = createCustomerRepository(pool);
const orders = createOrderRepository(pool);
const communications = createCommunicationRepository(pool);
const email = createEmailService();
const ai = createAiService();
const events = createEventBus();

registerWorkflows({ events, email, communications });

const app = createApp({
  customers,
  orders,
  communications,
  events,
  email,
  ai,
  webhookSecret: process.env.WOO_WEBHOOK_SECRET,
  delayDays: Number(process.env.DELAY_DAYS || 3),
  healthCheck: async () => ({ customers: await customers.count() }),
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`CRM running on http://localhost:${port}`));
