const { createMemoryRepos } = require("./helpers/memoryRepos");
const { OrderIngestService } = require("../src/services/orderIngestService");
const { createWooSyncService } = require("../src/services/wooSyncService");
const { createWooClient } = require("../src/services/wooClient");
const { wooOrder } = require("./helpers/fixtures");

describe("WooCommerce sync", () => {
  test("imports orders silently, skipping ones without email, and is idempotent", async () => {
    const { customers, orders } = createMemoryRepos();
    const emitted = [];
    const ingest = new OrderIngestService(customers, orders, { emit: (e) => emitted.push(e) });
    const pages = [[wooOrder({ id: 1 }), wooOrder({ id: 2, billing: { email: "" } })], [wooOrder({ id: 3 })]];
    const client = { configured: true, orderPages: async function* () { for (const p of pages) yield p; } };
    const svc = createWooSyncService({ client, ingest });

    expect(await svc.sync()).toEqual({ fetched: 3, imported: 2, skipped: 1 });
    expect(orders.rows).toHaveLength(2);
    expect(customers.rows).toHaveLength(1);
    await svc.sync();
    expect(orders.rows).toHaveLength(2);
  });

  test("fails clearly when not configured", async () => {
    const svc = createWooSyncService({ client: createWooClient({}), ingest: {} });
    await expect(svc.sync()).rejects.toThrow(/not configured/);
  });

  test("client paginates until a short page", async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return { ok: true, json: async () => (seen.length === 1 ? [{}, {}] : [{}]) };
    };
    const client = createWooClient({ WOO_URL: "https://shop.test/", WOO_CONSUMER_KEY: "ck", WOO_CONSUMER_SECRET: "cs" }, fetchImpl);
    const got = [];
    for await (const page of client.orderPages({ perPage: 2 })) got.push(page.length);
    expect(got).toEqual([2, 1]);
    expect(seen[0]).toContain("https://shop.test/wp-json/wc/v3/orders?per_page=2&page=1");
  });
});
