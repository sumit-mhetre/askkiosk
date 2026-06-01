// Reports service. Pure read-only aggregations over the Job table for the
// admin Reports tab.
//
// Honest scope: these are simple counts and sums. They reflect the state of
// the database at the moment of the query. Refunded jobs are counted as
// "failed", not "revenue". Queue/printing-state jobs aren't counted until
// they finish (PRINTED_OK or FAILED_REFUNDED).

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Parse a date range parameter into Date objects. Accepts "today",
// "week", "month", or a {from, to} object with ISO strings.
function parseRange(range) {
  const now = new Date();
  if (!range || range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now };
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: start, to: now };
  }
  if (range === "month") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { from: start, to: now };
  }
  if (range === "all") {
    return { from: new Date(0), to: now };
  }
  if (typeof range === "object" && range.from && range.to) {
    return { from: new Date(range.from), to: new Date(range.to) };
  }
  // fallback
  return { from: new Date(0), to: now };
}

// Aggregate stats for one kiosk over a range.
async function statsForKiosk(kioskId, range) {
  const { from, to } = parseRange(range);
  const baseWhere = {
    kioskId,
    createdAt: { gte: from, lte: to },
  };

  // Successful prints: counted for revenue + pages.
  const printed = await prisma.job.findMany({
    where: { ...baseWhere, state: "PRINTED_OK" },
    select: {
      id: true,
      amount: true,
      pageCount: true,
      copies: true,
      mode: true,
      doubleSided: true,
      multiMode: true,
      files: {
        select: { pageCount: true, copies: true, mode: true, doubleSided: true },
      },
    },
  });

  let totalRevenue = 0;
  let totalPages = 0;
  let totalSheets = 0;
  let bwJobs = 0;
  let colorJobs = 0;
  let duplexJobs = 0;
  let simplexJobs = 0;

  for (const job of printed) {
    totalRevenue += job.amount || 0;
    // For multi-file jobs aggregate from JobFile rows.
    const items = job.multiMode === "single" || !job.files.length
      ? [{
          pageCount: job.pageCount,
          copies: job.copies,
          mode: job.mode,
          doubleSided: job.doubleSided,
        }]
      : job.files;
    for (const f of items) {
      const pages = (f.pageCount || 0) * (f.copies || 1);
      totalPages += pages;
      totalSheets += f.doubleSided ? Math.ceil(pages / 2) : pages;
      if (f.mode === "COLOR") colorJobs++;
      else bwJobs++;
      if (f.doubleSided) duplexJobs++;
      else simplexJobs++;
    }
  }

  // Failure counts (separate, no revenue).
  const failedCount = await prisma.job.count({
    where: { ...baseWhere, state: "FAILED_REFUNDED" },
  });
  const expiredCount = await prisma.job.count({
    where: { ...baseWhere, state: "EXPIRED" },
  });
  // In-flight jobs (created but didn't finish in range).
  const inFlightCount = await prisma.job.count({
    where: {
      ...baseWhere,
      state: { in: ["CREATED", "PAID", "CODE_ISSUED", "QUEUED", "PRINTING"] },
    },
  });

  return {
    range: { from, to },
    printedJobs: printed.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalPages,
    totalSheets,
    colorJobs,
    bwJobs,
    duplexJobs,
    simplexJobs,
    failedCount,
    expiredCount,
    inFlightCount,
  };
}

// Aggregate stats across all kiosks (each as a row).
async function statsAllKiosks(range, operatorId = null) {
  const kiosks = await prisma.kiosk.findMany({
    where: operatorId ? { operatorId } : {},
    orderBy: { createdAt: "asc" },
  });
  const rows = [];
  for (const k of kiosks) {
    const stats = await statsForKiosk(k.id, range);
    rows.push({
      kioskId: k.id,
      kioskName: k.name,
      location: k.location,
      ...stats,
    });
  }
  // Totals across all kiosks.
  const total = rows.reduce(
    (acc, r) => {
      acc.printedJobs += r.printedJobs;
      acc.totalRevenue += r.totalRevenue;
      acc.totalPages += r.totalPages;
      acc.totalSheets += r.totalSheets;
      acc.colorJobs += r.colorJobs;
      acc.bwJobs += r.bwJobs;
      acc.duplexJobs += r.duplexJobs;
      acc.simplexJobs += r.simplexJobs;
      acc.failedCount += r.failedCount;
      acc.expiredCount += r.expiredCount;
      return acc;
    },
    {
      printedJobs: 0,
      totalRevenue: 0,
      totalPages: 0,
      totalSheets: 0,
      colorJobs: 0,
      bwJobs: 0,
      duplexJobs: 0,
      simplexJobs: 0,
      failedCount: 0,
      expiredCount: 0,
    }
  );
  total.totalRevenue = Math.round(total.totalRevenue * 100) / 100;
  return { rows, total };
}

module.exports = {
  parseRange,
  statsForKiosk,
  statsAllKiosks,
};
