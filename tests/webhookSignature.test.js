const { verifyWooSignature } = require("../src/services/webhookSignature");
const { SECRET, sign } = require("./helpers/fixtures");

describe("verifyWooSignature", () => {
  const body = JSON.stringify({ a: 1 });

  test("accepts a valid signature", () => {
    expect(verifyWooSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });
  test("rejects a tampered body", () => {
    expect(verifyWooSignature(Buffer.from(body + " "), sign(body), SECRET)).toBe(false);
  });
  test("rejects a missing signature", () => {
    expect(verifyWooSignature(Buffer.from(body), undefined, SECRET)).toBe(false);
  });
  test("rejects when no secret is configured", () => {
    expect(verifyWooSignature(Buffer.from(body), sign(body), "")).toBe(false);
  });
});
