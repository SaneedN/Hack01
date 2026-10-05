const { createEventBus } = require("../src/events/bus");
const { OrderIngestService } = require("../src/services/orderIngestService");
const { wooOrderSchema } = require("../src/services/wooOrderSchema");
const { createMemoryRepos } = require("./helpers/memoryRepos");
const { wooOrder } = require("./helpers/fixtures");

const setup = () => {
  const repos = createMemoryRepos();
  const events = createEventBus();
  return { ...repos, events, svc: new OrderIngestService(repos.customers, repos.orders, events) };
};
const parse = (over) => wooOrderSchema.parse(wooOrder(over));

describe("OrderIngestService", () => {
  test("creates customer + order and emits order.created", async () => {
    const { svc, customers, orders, events } = setup();
    const handler = jest.fn();
    events.on("order.created", handler);

    await svc.ingest(parse());

    expect(customers.rows).toHaveLength(1);
    expect(customers.rows[0].email).toBe("asha@example.com");
    expect(orders.rows).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("is idempotent when the same webhook is replayed", async () => {
    const { svc, customers, orders, events } = setup();
    const handler = jest.fn();
    events.on("order.created", handler);

    await svc.ingest(parse());
    await svc.ingest(parse());

    expect(customers.rows).toHaveLength(1);
    expect(orders.rows).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("links a returning customer (case-insensitive email) to a new order", async () => {
    const { svc, customers, orders } = setup();
    await svc.ingest(parse());
    await svc.ingest(parse({ id: 102, billing: { first_name: "Asha", last_name: "Naik", email: "ASHA@example.com" } }));

    expect(customers.rows).toHaveLength(1);
    expect(orders.rows).toHaveLength(2);
  });

  test("records history and emits order.status_changed on status change", async () => {
    const { svc, orders, events } = setup();
    const handler = jest.fn();
    events.on("order.status_changed", handler);

    await svc.ingest(parse());
    await svc.ingest(parse({ status: "completed" }));

    expect(orders.history.map((h) => h.to)).toEqual(["processing", "completed"]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].from).toBe("processing");
  });
});
