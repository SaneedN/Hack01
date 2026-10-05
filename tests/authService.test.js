const { hashPassword, verifyPassword, createAuthService } = require("../src/services/authService");

describe("password hashing", () => {
  test("verifies the right password and rejects wrong ones", () => {
    const h = hashPassword("s3cret-pass");
    expect(verifyPassword("s3cret-pass", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
  test("salts: same password hashes differently", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("JWT tokens", () => {
  const user = { id: 1, name: "Ann", email: "a@x.com", role: "admin" };
  const auth = createAuthService({ secret: "test" });

  test("round-trips a token", () => {
    const p = auth.verifyToken(auth.issueToken(user));
    expect(p.role).toBe("admin");
    expect(p.sub).toBe(1);
  });
  test("rejects tampered, foreign-secret and expired tokens", () => {
    const t = auth.issueToken(user);
    const [h, , s] = t.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 1, role: "admin", exp: 9999999999 })).toString("base64url")}.${s}`;
    expect(auth.verifyToken(forged)).toBeNull();
    expect(createAuthService({ secret: "other" }).verifyToken(t)).toBeNull();
    expect(createAuthService({ secret: "test", ttlSeconds: -10 }).verifyToken(createAuthService({ secret: "test", ttlSeconds: -10 }).issueToken(user))).toBeNull();
    expect(auth.verifyToken("not.a.token")).toBeNull();
  });
  test("requires a secret", () => {
    expect(() => createAuthService({})).toThrow();
  });
});
