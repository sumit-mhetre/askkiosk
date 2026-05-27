// Seed: one kiosk plus global default settings.
const { PrismaClient } = require("@prisma/client");
const { DEFAULT_SETTINGS } = require("../src/lib/defaultSettings");

const prisma = new PrismaClient();

async function main() {
  // Create a single demo kiosk if none exists.
  let kiosk = await prisma.kiosk.findFirst();
  if (!kiosk) {
    kiosk = await prisma.kiosk.create({
      data: {
        name: "ASK Kiosk 01",
        location: "Pilot location",
        printerIp: null,
        printerPort: 9100,
      },
    });
    console.log("Created kiosk:", kiosk.id);
  } else {
    console.log("Kiosk already exists:", kiosk.id);
  }

  // Write all defaults as global settings (kioskId null) if not present.
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key_kioskId: { key, kioskId: null } },
      update: {},
      create: { key, value: JSON.stringify(value), kioskId: null },
    });
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
