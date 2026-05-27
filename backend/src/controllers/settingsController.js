// Settings controller. Powers the admin settings screen.
const { getSettings, setSetting, prisma } = require("../services/settingsService");

// GET /api/settings  (optionally ?kioskId=)
async function listSettings(req, res) {
  const kioskId = req.query.kioskId || null;
  const settings = await getSettings(kioskId);
  res.json(settings);
}

// PUT /api/settings  { key, value, kioskId? }
async function updateSetting(req, res) {
  const { key, value, kioskId } = req.body;
  if (!key) return res.status(400).json({ error: "key required." });
  await setSetting(key, value, kioskId || null);
  const settings = await getSettings(kioskId || null);
  res.json(settings);
}

// GET /api/kiosk/info  -> current kiosk basic info for the screen
async function kioskInfo(req, res) {
  const kiosk = await prisma.kiosk.findFirst({ where: { isActive: true } });
  if (!kiosk) return res.status(404).json({ error: "No active kiosk." });
  res.json({
    id: kiosk.id,
    name: kiosk.name,
    location: kiosk.location,
    hasPrinter: !!kiosk.printerIp,
  });
}

module.exports = { listSettings, updateSetting, kioskInfo };
