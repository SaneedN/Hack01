const nodemailer = require("nodemailer");

/**
 * Strategy-style sender: real SMTP when SMTP_HOST is set, otherwise "simulated"
 * (nothing leaves your machine, but the CRM still logs the message).
 */
function createEmailService(env = process.env) {
  const live = Boolean(env.SMTP_HOST);
  const transport = live
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_SECURE === "true",
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  const from = env.MAIL_FROM || "CRM <no-reply@crm.local>";

  return {
    async send({ to, subject, text }) {
      try {
        await transport.sendMail({ from, to, subject, text });
        return { status: live ? "sent" : "simulated" };
      } catch (err) {
        console.error("[email] failed:", err.message);
        return { status: "failed", error: err.message };
      }
    },
  };
}

module.exports = { createEmailService };
