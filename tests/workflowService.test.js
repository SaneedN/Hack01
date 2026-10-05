const { createEventBus } = require("../src/events/bus");
const { registerWorkflows } = require("../src/services/workflowService");
const { createMemoryRepos } = require("./helpers/memoryRepos");

const flush = () => new Promise((r) => setImmediate(r));
const customer = { id: 1, email: "asha@example.com", first_name: "Asha" };
const order = { id: 5, woocommerce_order_id: 101, total: "100", currency: "INR", status: "processing", items: [] };

function setup() {
  const { communications } = createMemoryRepos();
  const email = { send: jest.fn().mockResolvedValue({ status: "simulated" }) };
  const events = createEventBus();
  registerWorkflows({ events, email, communications });
  return { events, email, communications };
}

describe("workflows", () => {
  test("order.created sends a confirmation email and logs it", async () => {
    const { events, email, communications } = setup();
    events.emit("order.created", { customer, order });
    await flush();

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "asha@example.com" }));
    expect(communications.rows[0].type).toBe("order_confirmation");
  });

  test("completed status sends the shipped email", async () => {
    const { events, communications } = setup();
    events.emit("order.status_changed", { customer, order: { ...order, status: "completed" }, from: "processing" });
    await flush();

    expect(communications.rows[0].type).toBe("order_shipped");
  });

  test("statuses without a template send nothing", async () => {
    const { events, email } = setup();
    events.emit("order.status_changed", { customer, order: { ...order, status: "on-hold" }, from: "processing" });
    await flush();

    expect(email.send).not.toHaveBeenCalled();
  });

  test("a failing email never throws", async () => {
    const { events, email, communications } = setup();
    email.send.mockRejectedValue(new Error("smtp down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    events.emit("order.created", { customer, order });
    await flush();

    expect(communications.rows).toHaveLength(0);
  });
});
