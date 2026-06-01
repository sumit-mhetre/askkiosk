const reportsSvc = require("../services/reportsService");

async function allKiosks(req, res) {
  try {
    const range = req.query.range || "today";
    const customRange =
      req.query.from && req.query.to
        ? { from: req.query.from, to: req.query.to }
        : range;
    const operatorId = req.query.operatorId || null;
    const data = await reportsSvc.statsAllKiosks(customRange, operatorId);
    return res.json(data);
  } catch (e) {
    console.error("reports.allKiosks:", e);
    return res.status(500).json({ error: e.message || "Failed." });
  }
}

async function oneKiosk(req, res) {
  try {
    const range = req.query.range || "today";
    const customRange =
      req.query.from && req.query.to
        ? { from: req.query.from, to: req.query.to }
        : range;
    const stats = await reportsSvc.statsForKiosk(req.params.kioskId, customRange);
    return res.json(stats);
  } catch (e) {
    console.error("reports.oneKiosk:", e);
    return res.status(500).json({ error: e.message || "Failed." });
  }
}

module.exports = { allKiosks, oneKiosk };
