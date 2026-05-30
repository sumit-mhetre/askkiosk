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

// GET /api/kiosk/info?kioskId=...  -> kiosk basic info + multi-file flags
async function kioskInfo(req, res) {
  const kioskId = req.query.kioskId;
  const kiosk = kioskId
    ? await prisma.kiosk.findUnique({ where: { id: kioskId } })
    : await prisma.kiosk.findFirst({ where: { isActive: true } });
  if (!kiosk) return res.status(404).json({ error: "No active kiosk." });
  const { getSettings } = require("../services/settingsService");
  const s = await getSettings(kiosk.id);
  res.json({
    id: kiosk.id,
    name: kiosk.name,
    location: kiosk.location,
    hasPrinter: !!kiosk.printerIp,
    multi: {
      enabled: !!s.multi_file_enabled,
      max: Number(s.multi_file_max) || 10,
      mode: s.multi_file_mode === "per_file" ? "per_file" : "shared",
    },
    limits: {
      maxCopies: Number(s.max_copies) || 20,
      maxFileSizeMb: Number(s.max_file_size_mb) || 25,
    },
  });
}

module.exports = { listSettings, updateSetting, kioskInfo };
