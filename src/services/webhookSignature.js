const { createHmac, timingSafeEqual } = require("crypto");

/** WooCommerce signs the raw request body: base64(HMAC-SHA256(secret, body)). */
function verifyWooSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(signature, "base64");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

module.exports = { verifyWooSignature };
