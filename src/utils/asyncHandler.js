// Forwards rejected promises to Express error middleware (works on Express 4 and 5)
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
