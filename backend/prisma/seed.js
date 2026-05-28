// Seed: global default settings only. No default kiosk is created;
// kiosks are added from the admin page.
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
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await upsertSetting(key, value, null);
  }
  console.log("Seeded", Object.keys(DEFAULT_SETTINGS).length, "global settings (no default kiosk).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
