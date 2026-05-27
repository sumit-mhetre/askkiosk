// Settings service. Resolves effective settings as:
// defaults  <-  global rows  <-  per-kiosk rows (highest priority)

const { PrismaClient } = require("@prisma/client");
const { DEFAULT_SETTINGS } = require("../lib/defaultSettings");

const prisma = new PrismaClient();

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return raw;
  }
}

// Returns a plain object of effective settings for a kiosk (or global if null).
async function getSettings(kioskId = null) {
  const effective = { ...DEFAULT_SETTINGS };

  // Global rows first
  const globals = await prisma.setting.findMany({ where: { kioskId: null } });
  for (const row of globals) {
    effective[row.key] = parseValue(row.value);
  }

  // Per-kiosk overrides
  if (kioskId) {
    const perKiosk = await prisma.setting.findMany({ where: { kioskId } });
    for (const row of perKiosk) {
      effective[row.key] = parseValue(row.value);
    }
  }

  return effective;
}

// Get one setting value with fallback to default.
async function getSetting(key, kioskId = null) {
  const all = await getSettings(kioskId);
  return all[key];
}

// Upsert a setting (global if kioskId null).
async function setSetting(key, value, kioskId = null) {
  const stored = JSON.stringify(value);
  return prisma.setting.upsert({
    where: { key_kioskId: { key, kioskId } },
    update: { value: stored },
    create: { key, value: stored, kioskId },
  });
}

module.exports = { getSettings, getSetting, setSetting, prisma };
