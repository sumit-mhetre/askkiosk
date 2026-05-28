// Seeds the first super admin, and a default operator that adopts any
// pre-existing kiosks (so the multi-operator migration doesn't orphan them).
//
// Usage:
//   node prisma/seedAdmin.js
// Env (optional):
//   ADMIN_EMAIL, ADMIN_PASSWORD, OPERATOR_NAME, OPERATOR_EMAIL, OPERATOR_PASSWORD

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@askkiosk.local";
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";

  let admin = await prisma.superAdmin.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.superAdmin.create({
      data: {
        email: adminEmail,
        passwordHash: bcrypt.hashSync(adminPass, 10),
        name: "Super Admin",
      },
    });
    console.log("Created super admin:", adminEmail, "(password:", adminPass + ")");
    console.log("CHANGE THIS PASSWORD after first login.");
  } else {
    console.log("Super admin already exists:", adminEmail);
  }

  // Default operator to own any kiosks that have no operator yet.
  const opEmail = process.env.OPERATOR_EMAIL || "operator@askkiosk.local";
  const opPass = process.env.OPERATOR_PASSWORD || "operator123";
  let op = await prisma.operator.findUnique({ where: { email: opEmail } });
  if (!op) {
    op = await prisma.operator.create({
      data: {
        name: process.env.OPERATOR_NAME || "Default Operator",
        email: opEmail,
        passwordHash: bcrypt.hashSync(opPass, 10),
      },
    });
    console.log("Created default operator:", opEmail, "(password:", opPass + ")");
  } else {
    console.log("Default operator already exists:", opEmail);
  }

  // Adopt orphaned kiosks (operatorId null) into the default operator.
  const orphanKiosks = await prisma.kiosk.findMany({ where: { operatorId: null } });
  for (const k of orphanKiosks) {
    await prisma.kiosk.update({
      where: { id: k.id },
      data: { operatorId: op.id },
    });
  }
  if (orphanKiosks.length) {
    console.log("Assigned", orphanKiosks.length, "existing kiosk(s) to the default operator.");
  }

  // Backfill operatorId on existing jobs from their kiosk.
  const orphanJobs = await prisma.job.findMany({
    where: { operatorId: null },
    include: { kiosk: true },
    take: 1000,
  });
  for (const j of orphanJobs) {
    if (j.kiosk && j.kiosk.operatorId) {
      await prisma.job.update({
        where: { id: j.id },
        data: { operatorId: j.kiosk.operatorId },
      });
    }
  }
  if (orphanJobs.length) {
    console.log("Backfilled operator on", orphanJobs.length, "existing job(s).");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
