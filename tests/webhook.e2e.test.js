const request = require("supertest");
const { createApp } = require("../src/app");
const { createEventBus } = require("../src/events/bus");
const { createMemoryRepos } = require("./helpers/memoryRepos");
const { SECRET, sign, wooOrder } = require("./helpers/fixtures");

const build = () => createApp({ ...createMemoryRepos(), events: createEventBus(), webhookSecret: SECRET, email: {}, ai: {} });
const post = (app, body, headers = {}) =>
  request(app).post("/webhooks/woocommerce").set("content-type", "application/json").set(headers).send(body);

describe("POST /webhooks/woocommerce (e2e)", () => {
  test("rejects bad signatures", async () => {
    const res = await post(build(), JSON.stringify(wooOrder()), { "x-wc-webhook-signature": "nope" });
    expect(res.status).toBe(401);
  });

  test("ingests an order and exposes it through the customers API", async () => {
    const app = build();
    const body = JSON.stringify(wooOrder());

    const hook = await post(app, body, { "x-wc-webhook-signature": sign(body) });
    expect(hook.status).toBe(200);

    const detail = await request(app).get(`/api/customers/${hook.body.customerId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.email).toBe("asha@example.com");
    expect(detail.body.orders).toHaveLength(1);
    expect(detail.body.orders[0].status).toBe("processing");
  });

  test("rejects invalid payloads with 400", async () => {
    const body = JSON.stringify({ id: 1 });
    const res = await post(build(), body, { "x-wc-webhook-signature": sign(body) });
    expect(res.status).toBe(400);
  });

  test("skips orders without a billing email", async () => {
    const body = JSON.stringify(wooOrder({ billing: { email: "" } }));
    const res = await post(build(), body, { "x-wc-webhook-signature": sign(body) });
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBeDefined();
  });

  test("acks non-JSON pings from WooCommerce", async () => {
    const body = "webhook_id=1";
    const res = await request(build())
      .post("/webhooks/woocommerce")
      .set("content-type", "application/x-www-form-urlencoded")
      .set("x-wc-webhook-signature", sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  test("returns 404 for an unknown customer", async () => {
    const res = await request(build()).get("/api/customers/999");
    expect(res.status).toBe(404);
  });
});
