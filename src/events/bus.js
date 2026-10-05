const { EventEmitter } = require("events");

/**
 * Observer pattern: the ingest service emits events, workflows subscribe.
 * Events: "order.created" and "order.status_changed" ({ customer, order, from? }).
 */
function createEventBus() {
  return new EventEmitter();
}

module.exports = { createEventBus };
