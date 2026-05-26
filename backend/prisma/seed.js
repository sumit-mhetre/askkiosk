// Seed: one kiosk plus global default settings.
const { PrismaClient } = require("@prisma/client");
const { DEFAULT_SETTINGS } = require("../src/lib/defaultSettings");

const prisma = new PrismaClient();

async function upsertSetting(key, value, kioskId) {
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

async function main() {
  let kiosk = await prisma.kiosk.findFirst();
  if (!kiosk) {
    kiosk = await prisma.kiosk.create({
      data: { name: "ASK Kiosk 01", location: "Pilot location", printerPort: 9100 },
    });
    console.log("Created kiosk:", kiosk.id);
  } else {
    console.log("Kiosk already exists:", kiosk.id);
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await upsertSetting(key, value, null);
  }
  console.log("Seeded", Object.keys(DEFAULT_SETTINGS).length, "global settings.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });