// Paper-tracking service. Honest scope reminders:
// - The count is an ESTIMATE based on operator-entered refills + auto
//   decrement on successful prints. It is NOT a sensor reading.
// - Disabled by default (paperTrackingEnabled = false). Operators opt in.
// - Decrement happens only on PRINTED_OK. Failed / refunded jobs do not
//   consume sheets in the estimate.
// - Paper jams desync the count; operators correct with a "set" action.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// How many sheets does this job consume? Halved (rounded up) when duplex.
function sheetsForJob(pageCount, copies, doubleSided) {
  const pages = Math.max(0, pageCount || 0);
  const n = Math.max(1, copies || 1);
  const pagesTotal = pages * n;
  if (doubleSided) return Math.ceil(pagesTotal / 2);
  return pagesTotal;
}

// Sum sheets for a multi-file job by walking the JobFile rows. Falls back
// to the parent Job columns for legacy single-file jobs.
async function sheetsForJobId(jobId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { files: true },
  });
  if (!job) return 0;
  if (job.multiMode === "single" || !job.files.length) {
    return sheetsForJob(job.pageCount, job.copies, job.doubleSided);
  }
  let total = 0;
  for (const f of job.files) {
    total += sheetsForJob(f.pageCount, f.copies, f.doubleSided);
  }
  return total;
}

// Sum sheets across all in-flight jobs on this kiosk (CODE_ISSUED, QUEUED,
// PRINTING). These are sheets that ARE going to be consumed before any new
// job. Failed/refunded/expired jobs are excluded since they release their
// reservation.
async function reservedSheets(kioskId) {
  const inFlight = await prisma.job.findMany({
    where: {
      kioskId,
      state: { in: ["CODE_ISSUED", "QUEUED", "PRINTING"] },
    },
    include: { files: true },
  });
  let total = 0;
  for (const j of inFlight) {
    if (j.multiMode === "single" || !j.files.length) {
      total += sheetsForJob(j.pageCount, j.copies, j.doubleSided);
    } else {
      for (const f of j.files) {
        total += sheetsForJob(f.pageCount, f.copies, f.doubleSided);
      }
    }
  }
  return total;
}

// Read the current state for a kiosk. Always safe to call.
// `count` = raw paper sheets physically estimated to be in the tray.
// `reserved` = sheets already committed to in-flight jobs.
// `available` = count - reserved (clamped at 0). This is what we tell new
//   customers, since previous jobs in the queue will consume their sheets first.
async function getStatus(kioskId) {
  const kiosk = await prisma.kiosk.findUnique({ where: { id: kioskId } });
  if (!kiosk) return null;
  if (!kiosk.paperTrackingEnabled) {
    return {
      enabled: false,
      count: kiosk.paperCount,
      reserved: 0,
      available: kiosk.paperCount,
      max: kiosk.paperMax,
      lowThreshold: kiosk.paperLowThreshold,
      isLow: false,
      isEmpty: false,
    };
  }
  const reserved = await reservedSheets(kiosk.id);
  const available = Math.max(0, kiosk.paperCount - reserved);
  return {
    enabled: true,
    count: kiosk.paperCount,
    reserved,
    available,
    max: kiosk.paperMax,
    lowThreshold: kiosk.paperLowThreshold,
    isLow: available <= kiosk.paperLowThreshold,
    isEmpty: available <= 0,
  };
}

// Decrement after a successful print. Safe no-op if tracking is disabled.
// Never goes below zero (count clamps to 0 on overdraft, which is logged).
async function consume(kioskId, jobId) {
  const kiosk = await prisma.kiosk.findUnique({ where: { id: kioskId } });
  if (!kiosk || !kiosk.paperTrackingEnabled) return;

  const sheets = await sheetsForJobId(jobId);
  if (sheets <= 0) return;

  const newCount = Math.max(0, kiosk.paperCount - sheets);
  await prisma.kiosk.update({
    where: { id: kioskId },
    data: { paperCount: newCount },
  });
  await prisma.paperLog.create({
    data: {
      kioskId,
      kind: "consume",
      delta: -(kiosk.paperCount - newCount),
      newCount,
      jobId,
    },
  });
}

// Operator: add sheets (after a refill).
async function add(kioskId, sheets, note) {
  if (!Number.isFinite(sheets) || sheets <= 0) {
    throw new Error("Sheets to add must be a positive number.");
  }
  const kiosk = await prisma.kiosk.findUnique({ where: { id: kioskId } });
  if (!kiosk) throw new Error("Kiosk not found.");
  const newCount = Math.min(kiosk.paperMax, kiosk.paperCount + Math.floor(sheets));
  await prisma.kiosk.update({
    where: { id: kioskId },
    data: { paperCount: newCount },
  });
  await prisma.paperLog.create({
    data: {
      kioskId,
      kind: "add",
      delta: newCount - kiosk.paperCount,
      newCount,
      note: note ? String(note).slice(0, 200) : null,
    },
  });
  return getStatus(kioskId);
}

// Operator: override the count exactly (e.g. recovery after a jam).
async function set(kioskId, sheets, note) {
  if (!Number.isFinite(sheets) || sheets < 0) {
    throw new Error("Sheets must be zero or positive.");
  }
  const kiosk = await prisma.kiosk.findUnique({ where: { id: kioskId } });
  if (!kiosk) throw new Error("Kiosk not found.");
  const clamped = Math.min(kiosk.paperMax, Math.floor(sheets));
  await prisma.kiosk.update({
    where: { id: kioskId },
    data: { paperCount: clamped },
  });
  await prisma.paperLog.create({
    data: {
      kioskId,
      kind: "set",
      delta: clamped - kiosk.paperCount,
      newCount: clamped,
      note: note ? String(note).slice(0, 200) : null,
    },
  });
  return getStatus(kioskId);
}

// Operator: toggle on/off, change max capacity, change low threshold.
async function updateConfig(kioskId, { enabled, max, lowThreshold }) {
  const data = {};
  if (typeof enabled === "boolean") data.paperTrackingEnabled = enabled;
  if (Number.isFinite(max) && max > 0) data.paperMax = Math.floor(max);
  if (Number.isFinite(lowThreshold) && lowThreshold >= 0) {
    data.paperLowThreshold = Math.floor(lowThreshold);
  }
  if (Object.keys(data).length === 0) return getStatus(kioskId);
  await prisma.kiosk.update({ where: { id: kioskId }, data });
  return getStatus(kioskId);
}

// Recent history rows for the admin panel.
async function recentLogs(kioskId, limit = 20) {
  return prisma.paperLog.findMany({
    where: { kioskId },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
  });
}

// Check before payment: can this kiosk fit this job? Returns
// { ok: true } if tracking is off OR enough sheets remain AFTER currently
// in-flight jobs (CODE_ISSUED/QUEUED/PRINTING) finish.
// Returns { ok: false, reason, sheetsNeeded, sheetsAvailable } otherwise.
async function precheck(kioskId, jobId) {
  const status = await getStatus(kioskId);
  if (!status || !status.enabled) return { ok: true };
  const sheetsNeeded = await sheetsForJobId(jobId);
  // We compare against `available` (count - reserved), not raw count, because
  // queued jobs ahead of this customer will consume their sheets first.
  if (sheetsNeeded <= status.available) return { ok: true };
  return {
    ok: false,
    reason: status.available === 0 ? "out_of_paper" : "not_enough_paper",
    sheetsNeeded,
    sheetsAvailable: status.available,
    rawCount: status.count,
    reserved: status.reserved,
  };
}

module.exports = {
  sheetsForJob,
  sheetsForJobId,
  reservedSheets,
  getStatus,
  consume,
  add,
  set,
  updateConfig,
  recentLogs,
  precheck,
};
