/** requireAuth: validates the Bearer token. requireRole: gate by role (admin always passes). */
function requireAuth(authService) {
  return (req, res, next) => {
    const header = req.header("authorization") || "";
    const user = authService.verifyToken(header.startsWith("Bearer ") ? header.slice(7) : "");
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.user = user;
    next();
  };
}

const requireRole = (...roles) => (req, res, next) =>
  req.user && (req.user.role === "admin" || roles.includes(req.user.role))
    ? next()
    : res.status(403).json({ error: "Forbidden" });

module.exports = { requireAuth, requireRole };
