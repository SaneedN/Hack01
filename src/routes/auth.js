const express = require("express");
const { z } = require("zod");
const wrap = require("../utils/asyncHandler");
const { hashPassword, verifyPassword, ROLES } = require("../services/authService");
const { requireAuth, requireRole } = require("../middleware/auth");

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60000;

function authRouter({ users, authService, allowRegistration = true }) {
  const router = express.Router();
  const attempts = new Map(); // ip -> [timestamps]: simple brute-force throttle

  const throttled = (ip) => {
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    attempts.set(ip, recent);
    return recent.length > MAX_ATTEMPTS;
  };

  router.post("/login", wrap(async (req, res) => {
    if (throttled(req.ip)) return res.status(429).json({ error: "Too many attempts, try again in a minute" });
    const { email, password } = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
    const user = await users.findByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: "Invalid email or password" });
    res.json({ token: authService.issueToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }));

  // Self-registration. The very first account becomes admin; everyone after is plain staff.
  // Set ALLOW_REGISTRATION=false once your team has signed up.
  router.post("/register", wrap(async (req, res) => {
    const first = (await users.count()) === 0;
    if (!allowRegistration && !first) return res.status(403).json({ error: "Registration is closed. Ask an admin to create your account." });
    if (throttled(req.ip)) return res.status(429).json({ error: "Too many attempts, try again in a minute" });
    const body = z.object({
      name: z.string().trim().min(1, "Name is required"),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }).parse(req.body);
    if (await users.findByEmail(body.email)) return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    const user = await users.create({ name: body.name, email: body.email, passwordHash: hashPassword(body.password), role: first ? "admin" : "staff" });
    res.status(201).json({ token: authService.issueToken(user), user });
  }));

  router.get("/me", requireAuth(authService), (req, res) => res.json({ id: req.user.sub, name: req.user.name, email: req.user.email, role: req.user.role }));

  router.get("/users", requireAuth(authService), requireRole(), wrap(async (req, res) => res.json(await users.list())));

  router.post("/users", requireAuth(authService), requireRole(), wrap(async (req, res) => {
    const body = z.object({
      name: z.string().trim().min(1),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8, "Password must be at least 8 characters"),
      role: z.enum(ROLES).default("staff"),
    }).parse(req.body);
    if (await users.findByEmail(body.email)) return res.status(409).json({ error: "A user with this email already exists" });
    res.status(201).json(await users.create({ name: body.name, email: body.email, passwordHash: hashPassword(body.password), role: body.role }));
  }));

  return router;
}

module.exports = { authRouter };
