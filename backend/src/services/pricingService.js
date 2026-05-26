// Pricing and sheet computation for ASK Kiosk.
// Single-sided: charged per page. Double-sided: charged per sheet (2 pages/sheet),
// which is cheaper per page and saves paper.

// Compute the number of physical sheets for one copy of the document.
function sheetsForOneCopy(pageCount, doubleSided) {
  if (pageCount <= 0) return 0;
  if (!doubleSided) return pageCount; // one page per sheet
  return Math.ceil(pageCount / 2); // two pages per sheet
}

// Compute total sheets across all copies (used for the max-sheets limit).
function totalSheets(pageCount, copies, doubleSided) {
  return sheetsForOneCopy(pageCount, doubleSided) * copies;
}

// Compute the price in rupees for the job, using effective settings.
// mode: "BW" | "COLOR"
function computeAmount({ pageCount, copies, mode, doubleSided }, settings) {
  const isColor = mode === "COLOR";

  let perCopy;
  if (!doubleSided) {
    const rate = isColor ? settings.rate_color_single : settings.rate_bw_single;
    perCopy = pageCount * rate;
  } else {
    const sheets = sheetsForOneCopy(pageCount, true);
    const rate = isColor
      ? settings.rate_color_double_sheet
      : settings.rate_bw_double_sheet;
    perCopy = sheets * rate;
  }

  const amount = perCopy * copies;
  // round to 2 decimals
  return Math.round(amount * 100) / 100;
}

// Validate job config against limits. Returns { ok, error }.
function validateLimits({ pageCount, copies, doubleSided }, settings) {
  if (pageCount <= 0) return { ok: false, error: "Document has no pages." };
  if (copies < 1) return { ok: false, error: "Copies must be at least 1." };
  if (copies > settings.max_copies)
    return { ok: false, error: `Maximum ${settings.max_copies} copies allowed.` };

  const sheets = totalSheets(pageCount, copies, doubleSided);
  if (sheets > settings.max_sheets_per_job) {
    return {
      ok: false,
      error: `This job is ${sheets} sheets. The maximum per job is ${settings.max_sheets_per_job}. Reduce copies or split the job.`,
    };
  }
  return { ok: true, sheets };
}

module.exports = {
  sheetsForOneCopy,
  totalSheets,
  computeAmount,
  validateLimits,
};
