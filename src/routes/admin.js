const express = require("express");
const wrap = require("../utils/asyncHandler");

/** Admin-only operations: WooCommerce import and manual run of the delayed-order automation. */
function adminRouter({ wooSync, followUps }) {
  const router = express.Router();
  router.post("/sync/woocommerce", wrap(async (req, res) => {
    if (!wooSync) return res.status(501).json({ error: "Sync not available" });
    res.json(await wooSync.sync());
  }));
  router.post("/automation/followups", wrap(async (req, res) => {
    if (!followUps) return res.status(501).json({ error: "Automation not available" });
    res.json(await followUps.run());
  }));
  return router;
}
module.exports = { adminRouter };
