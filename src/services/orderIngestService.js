const toMysqlDate = (d) => d.toISOString().slice(0, 19).replace("T", " ");

/**
 * Turns a validated WooCommerce order payload into CRM customer + order records.
 * Idempotent: replaying the same webhook never duplicates anything.
 * Customer identity = lower-cased billing email.
 */
class OrderIngestService {
  constructor(customers, orders, events) {
    this.customers = customers;
    this.orders = orders;
    this.events = events;
  }

  async ingest(p) {
    const b = p.billing;
    const address = [b.address_1, b.city, b.state, b.postcode, b.country].filter(Boolean).join(", ");

    const customer = await this.customers.upsertByEmail({
      email: b.email.trim().toLowerCase(),
      firstName: b.first_name,
      lastName: b.last_name,
      phone: b.phone || null,
      address: address || null,
      wooCustomerId: p.customer_id > 0 ? p.customer_id : null,
    });

    const previous = await this.orders.findByWooId(p.id);

    const order = await this.orders.upsert({
      wooOrderId: p.id,
      customerId: customer.id,
      orderDate: toMysqlDate(p.date_created_gmt ? new Date(p.date_created_gmt + "Z") : new Date()),
      status: p.status,
      total: p.total,
      currency: p.currency,
      items: p.line_items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
    });

    if (!previous) {
      await this.orders.addStatusHistory(order.id, null, order.status);
      this.events.emit("order.created", { customer, order });
    } else if (previous.status !== order.status) {
      await this.orders.addStatusHistory(order.id, previous.status, order.status);
      this.events.emit("order.status_changed", { customer, order, from: previous.status });
    }

    return { customer, order };
  }
}

module.exports = { OrderIngestService };
