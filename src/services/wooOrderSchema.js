const { z } = require("zod");

/** Only the fields we use from a WooCommerce order webhook payload. */
const wooOrderSchema = z.object({
  id: z.number(),
  status: z.string(),
  total: z.coerce.number(),
  currency: z.string(),
  customer_id: z.number().optional().default(0),
  date_created_gmt: z.string().optional(),
  billing: z.object({
    first_name: z.string().default(""),
    last_name: z.string().default(""),
    email: z.string().email(),
    phone: z.string().default(""),
    address_1: z.string().default(""),
    city: z.string().default(""),
    state: z.string().default(""),
    postcode: z.string().default(""),
    country: z.string().default(""),
  }),
  line_items: z
    .array(z.object({ name: z.string(), quantity: z.number(), price: z.coerce.number().default(0) }))
    .default([]),
});

module.exports = { wooOrderSchema };
