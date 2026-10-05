const { scryptSync, randomBytes, timingSafeEqual, createHmac } = require("crypto");

/**
 * Dependency-free auth helpers: scrypt password hashing + HS256 JWTs.
 * (Built on Node's crypto so there is nothing extra to install.)
 */
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const ROLES = ["admin", "staff"];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createAuthService({ secret, ttlSeconds = 8 * 3600 } = {}) {
  if (!secret) throw new Error("JWT_SECRET is required");
  const sign = (data) => createHmac("sha256", secret).update(data).digest("base64url");

  return {
    issueToken(user) {
      const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = b64u(
        JSON.stringify({ sub: user.id, name: user.name, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + ttlSeconds })
      );
      return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
    },
    /** Returns the payload, or null if the token is malformed, tampered with or expired. */
    verifyToken(token) {
      const parts = String(token || "").split(".");
      if (parts.length !== 3) return null;
      const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
      const actual = Buffer.from(parts[2]);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        return payload.exp > Date.now() / 1000 ? payload : null;
      } catch {
        return null;
      }
    },
  };
}

module.exports = { hashPassword, verifyPassword, createAuthService, ROLES };
