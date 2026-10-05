const { wooOrderSchema } = require("./wooOrderSchema");

/**
 * Imports existing WooCommerce orders (and their customers) into the CRM.
 * Uses an ingest service wired to a silent event bus so historical orders never trigger emails.
 * Idempotent: running it twice updates rather than duplicates.
 */
function createWooSyncService({ client, ingest }) {
  return {
    async sync() {
      if (!client.configured) throw Object.assign(new Error("WooCommerce API is not configured (WOO_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET)"), { status: 400 });
      const stats = { fetched: 0, imported: 0, skipped: 0 };
      for await (const page of client.orderPages()) {
        for (const raw of page) {
          stats.fetched++;
          if (!raw?.billing?.email) { stats.skipped++; continue; }
          const parsed = wooOrderSchema.safeParse(raw);
          if (!parsed.success) { stats.skipped++; continue; }
          await ingest.ingest(parsed.data);
          stats.imported++;
        }
      }
      return stats;
    },
  };
}
module.exports = { createWooSyncService };
