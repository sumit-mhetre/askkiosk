// Auto-expiry service for ASK Kiosk.
// Finds jobs whose code was issued but never used, and whose expiry window
// has passed. For each: auto-refund the payment (if any) and expire the code
// so it can no longer be used. Also purges old metadata past retention.
//
// This runs as a lazy check (called periodically and on backend activity),
// which works on hosting that sleeps when idle (e.g. Render free tier).

const { prisma } = require("./settingsService");
const fileSvc = require("./fileService");
const rzp = require("./razorpayService");

let lastRun = 0;
const MIN_INTERVAL_MS = 30 * 1000; // don't run more than once per 30s

// Expire + refund a single job that was paid but never claimed in time.
async function expireJob(job) {
  // Refund if there is a real captured payment.
  const payment = await prisma.payment.findUnique({ where: { jobId: job.id } });
  let refunded = false;
  if (payment && payment.status === "SUCCESS" && payment.gatewayPaymentId) {
    try {
      const r = await rzp.refundPayment(payment.gatewayPaymentId, job.amount);
      await prisma.payment.update({
        where: { jobId: job.id },
        data: { status: "REFUNDED", refundId: r.id, refundedAt: new Date() },
      });
      refunded = true;
    } catch (e) {
      console.error("[expiry] refund failed for job", job.id, e.message);
    }
  }

  // Remove the file and clear the code so it can never be used.
  if (job.filePath) fileSvc.deleteFile(job.filePath);
  await prisma.job.update({
    where: { id: job.id },
    data: {
      state: "EXPIRED",
      codeHash: null, // code removed from server
      filePath: null,
      fileDeleted: true,
    },
  });
  console.log(
    "[expiry] Expired unused job",
    job.id,
    refunded ? "(refunded)" : "(no refund needed)"
  );
}

// Main sweep. Safe to call often; throttled internally.
async function runExpirySweep(force = false) {
  const now = Date.now();
  if (!force && now - lastRun < MIN_INTERVAL_MS) return;
  lastRun = now;

  try {
    // 1) Paid-but-unused codes past their expiry -> refund + expire.
    const expiredUnused = await prisma.job.findMany({
      where: {
        state: "CODE_ISSUED",
        codeExpiresAt: { lt: new Date() },
      },
      take: 50,
    });
    for (const job of expiredUnused) {
      await expireJob(job);
    }

    // 2) Purge old metadata past retention (files already gone).
    const purgeable = await prisma.job.findMany({
      where: {
        purgeAfter: { lt: new Date() },
      },
      take: 100,
    });
    for (const job of purgeable) {
      // Delete payment first (FK), then the job row.
      await prisma.payment.deleteMany({ where: { jobId: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
    }
    if (purgeable.length) {
      console.log("[expiry] Purged", purgeable.length, "old job records.");
    }
  } catch (e) {
    console.error("[expiry] sweep error:", e.message);
  }
}

// Start a background interval (works while the process is awake).
function startExpiryLoop(intervalMs = 60000) {
  setInterval(() => {
    runExpirySweep().catch(() => {});
  }, intervalMs);
  // Run once shortly after startup too.
  setTimeout(() => runExpirySweep(true).catch(() => {}), 5000);
}

module.exports = { runExpirySweep, startExpiryLoop, expireJob };
