/** Thin WooCommerce REST API client (read-only, Basic auth with consumer key/secret). */
function createWooClient(env = process.env, fetchImpl = globalThis.fetch) {
  const base = (env.WOO_URL || "").replace(/\/+$/, "");
  const configured = Boolean(base && env.WOO_CONSUMER_KEY && env.WOO_CONSUMER_SECRET);
  const auth = "Basic " + Buffer.from(`${env.WOO_CONSUMER_KEY}:${env.WOO_CONSUMER_SECRET}`).toString("base64");

  return {
    configured,
    /** Async generator yielding pages of raw order objects. */
    async *orderPages({ perPage = 50, maxPages = 40 } = {}) {
      for (let page = 1; page <= maxPages; page++) {
        const res = await fetchImpl(`${base}/wp-json/wc/v3/orders?per_page=${perPage}&page=${page}&orderby=date&order=asc`, { headers: { Authorization: auth } });
        if (!res.ok) throw new Error(`WooCommerce API ${res.status}`);
        const rows = await res.json();
        if (!rows.length) return;
        yield rows;
        if (rows.length < perPage) return;
      }
    },
  };
}
module.exports = { createWooClient };
