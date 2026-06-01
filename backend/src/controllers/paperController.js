const paperSvc = require("../services/paperService");

async function getStatus(req, res) {
  try {
    const status = await paperSvc.getStatus(req.params.kioskId);
    if (!status) return res.status(404).json({ error: "Kiosk not found." });
    return res.json(status);
  } catch (e) {
    console.error("paper.getStatus:", e);
    return res.status(500).json({ error: e.message || "Failed." });
  }
}

async function add(req, res) {
  try {
    const { sheets, note } = req.body || {};
    const status = await paperSvc.add(
      req.params.kioskId,
      Number(sheets),
      note
    );
    return res.json(status);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function setExact(req, res) {
  try {
    const { sheets, note } = req.body || {};
    const status = await paperSvc.set(
      req.params.kioskId,
      Number(sheets),
      note
    );
    return res.json(status);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function updateConfig(req, res) {
  try {
    const { enabled, max, lowThreshold } = req.body || {};
    const payload = {};
    if (typeof enabled === "boolean") payload.enabled = enabled;
    if (max !== undefined) payload.max = Number(max);
    if (lowThreshold !== undefined) payload.lowThreshold = Number(lowThreshold);
    const status = await paperSvc.updateConfig(req.params.kioskId, payload);
    return res.json(status);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

async function history(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const logs = await paperSvc.recentLogs(req.params.kioskId, limit);
    return res.json({ logs });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed." });
  }
}

module.exports = { getStatus, add, setExact, updateConfig, history };
