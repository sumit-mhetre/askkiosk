// Settings service. Resolves effective settings as:
// defaults  <-  global rows (kioskId null)  <-  per-kiosk rows

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

async function getSettings(kioskId = null) {
  const effective = { ...DEFAULT_SETTINGS };

  const globals = await prisma.setting.findMany({ where: { kioskId: null } });
  for (const row of globals) {
    effective[row.key] = parseValue(row.value);
  }

  if (kioskId) {
    const perKiosk = await prisma.setting.findMany({ where: { kioskId } });
    for (const row of perKiosk) {
      effective[row.key] = parseValue(row.value);
    }
  }

  return effective;
}

async function getSetting(key, kioskId = null) {
  const all = await getSettings(kioskId);
  return all[key];
}

async function setSetting(key, value, kioskId = null) {
  const existing = await prisma.setting.findFirst({ where: { key, kioskId } });
  if (existing) {
    return prisma.setting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(value) },
    });
  }
  return prisma.setting.create({
    data: { key, value: JSON.stringify(value), kioskId },
  });
}

module.exports = { getSettings, getSetting, setSetting, prisma };