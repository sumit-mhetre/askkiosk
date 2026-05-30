// ASK Kiosk - Windows Auto-Print Agent
// Runs on the Windows kiosk machine. Fully automatic, no taps.
//
// What it does, in a loop:
//   1. Polls the backend: "any job ready to print for this kiosk?"
//   2. When a job is ready, downloads the file.
//   3. Prints it SILENTLY to the default Windows printer.
//   4. Reports success/failure back so the backend finalizes the job
//      (and auto-refunds on failure).
//
// No printer IP needed. Windows handles the printer (USB, WiFi, or network).
// Just set the default printer in Windows, connect it, and run this agent.

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const http = require("http");
const { execFile } = require("child_process");

// ---- Config (set via env vars or edit defaults) ----
const BACKEND_URL = process.env.BACKEND_URL || "https://askkiosk.onrender.com";
const KIOSK_ID = process.env.KIOSK_ID || ""; // optional; backend uses active kiosk if blank
const POLL_MS = parseInt(process.env.POLL_MS || "3000", 10);
// Optional: force a specific printer by name (else uses Windows default).
const PRINTER_NAME = process.env.PRINTER_NAME || "";

const TMP_DIR = path.join(os.tmpdir(), "askkiosk-agent");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function api(pathPart) {
  return BACKEND_URL.replace(/\/+$/, "") + pathPart;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error("Bad JSON from " + url));
          }
        });
      })
      .on("error", reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body || "{}"));
          } catch (e) {
            resolve({});
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    lib
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error("Download failed HTTP " + res.statusCode));
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(destPath)));
      })
      .on("error", (e) => {
        file.close();
        reject(e);
      });
  });
}

// ---- Print stack ----
// We print via SumatraPDF (free, lightweight) because it supports
// -print-settings flags for color, duplex, copies. PowerShell's silent print
// could not honour those, so customers paying for color/duplex weren't getting
// what they paid for.
//
// SumatraPDF must be installed on this machine. Defaults search the standard
// install paths; override with SUMATRA_PATH env var if installed elsewhere.

const SUMATRA_CANDIDATES = [
  process.env.SUMATRA_PATH,
  "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
  "C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe",
  path.join(
    process.env.LOCALAPPDATA || "",
    "SumatraPDF",
    "SumatraPDF.exe"
  ),
].filter(Boolean);

function findSumatra() {
  for (const p of SUMATRA_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return null;
}

const SUMATRA = findSumatra();
if (!SUMATRA) {
  console.warn(
    "[agent] WARNING: SumatraPDF not found. Install it from sumatrapdfreader.org or set SUMATRA_PATH. Printing will not honour color or duplex settings until this is fixed."
  );
} else {
  console.log("[agent] Using SumatraPDF at:", SUMATRA);
}

// Convert any image file to a single-page PDF so we can apply the same
// print-settings flags (color, duplex) uniformly. Returns the PDF path.
async function imageToPdf(imagePath) {
  const { PDFDocument } = require("pdf-lib");
  const bytes = fs.readFileSync(imagePath);
  const lower = imagePath.toLowerCase();
  const pdfDoc = await PDFDocument.create();
  let img;
  if (lower.endsWith(".png")) {
    img = await pdfDoc.embedPng(bytes);
  } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    img = await pdfDoc.embedJpg(bytes);
  } else {
    // Try JPG first, fall back to PNG.
    try { img = await pdfDoc.embedJpg(bytes); }
    catch (e) { img = await pdfDoc.embedPng(bytes); }
  }
  // Fit the image into an A4 page with a small margin.
  const pageW = 595.28; // A4 width in points
  const pageH = 841.89; // A4 height in points
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawImage(img, {
    x: (pageW - drawW) / 2,
    y: (pageH - drawH) / 2,
    width: drawW,
    height: drawH,
  });
  const out = imagePath.replace(/\.[^.]+$/, "") + "_converted.pdf";
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(out, pdfBytes);
  return out;
}

// Print a PDF via SumatraPDF with explicit color + duplex + copies.
// opts: { copies, mode: "BW"|"COLOR", doubleSided: bool }
function printWithSumatra(pdfPath, opts) {
  return new Promise((resolve, reject) => {
    if (!SUMATRA) {
      return reject(
        new Error(
          "SumatraPDF is not installed. Install from sumatrapdfreader.org so color and duplex print correctly."
        )
      );
    }
    const settings = [];
    settings.push(opts.mode === "COLOR" ? "color" : "monochrome");
    // duplexlong = flip on long edge (normal portrait duplex)
    settings.push(opts.doubleSided ? "duplexlong" : "simplex");
    const n = Math.max(1, parseInt(opts.copies, 10) || 1);
    settings.push(n + "x"); // Sumatra accepts "Nx" for N copies

    const args = [];
    if (PRINTER_NAME) {
      args.push("-print-to", PRINTER_NAME);
    } else {
      args.push("-print-to-default");
    }
    args.push("-print-settings", settings.join(","));
    args.push("-silent");
    args.push(pdfPath);

    execFile(SUMATRA, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message || "Sumatra print failed"));
      }
      resolve(true);
    });
  });
}

// Unified print entry: routes images through imageToPdf, then prints via Sumatra
// with the requested color/duplex/copies. Cleans up any temp PDF.
async function printFile(filePath, opts) {
  const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(filePath);
  let toPrint = filePath;
  let tempPdf = null;
  if (isImage) {
    tempPdf = await imageToPdf(filePath);
    toPrint = tempPdf;
  }
  try {
    await printWithSumatra(toPrint, opts);
  } finally {
    if (tempPdf) {
      try { fs.unlinkSync(tempPdf); } catch (e) {}
    }
  }
}

let working = false;

async function tick() {
  if (working) return;
  working = true;
  try {
    const q = KIOSK_ID ? `?kioskId=${encodeURIComponent(KIOSK_ID)}` : "";
    const res = await getJson(api("/api/agent/next-job" + q));
    if (res && res.job) {
      const job = res.job;
      // Normalize file list. Older backends only return job.fileUrl; newer ones
      // return job.files. Either way, we iterate.
      const files =
        Array.isArray(job.files) && job.files.length
          ? job.files
          : [
              {
                id: job.id,
                position: 1,
                fileType: job.fileType,
                fileUrl: job.fileUrl,
                copies: job.copies,
                mode: job.mode,
                doubleSided: job.doubleSided,
              },
            ];
      console.log(
        "[agent] Job ready:",
        job.id,
        "- " + files.length + " file(s) to print"
      );

      // Phase 1: download all files first. If any fails, abort the whole job.
      const downloaded = [];
      let dlError = null;
      for (const f of files) {
        const ext = (f.fileType || "").includes("pdf")
          ? ".pdf"
          : (f.fileType || "").includes("png")
          ? ".png"
          : ".jpg";
        const dest = path.join(TMP_DIR, job.id + "_" + f.position + ext);
        try {
          await downloadFile(api(f.fileUrl), dest);
          downloaded.push({ ...f, dest });
        } catch (e) {
          dlError = e;
          break;
        }
      }
      if (dlError) {
        console.error(
          "[agent] Download failed:",
          dlError.message,
          "- reporting failure for job",
          job.id
        );
        try {
          await postJson(api(`/api/jobs/${job.id}/print-result`), {
            ok: false,
            error: "download failed: " + dlError.message,
          });
        } catch (e2) {
          console.error("[agent] Could not report failure:", e2.message);
        }
        // clean up any partial downloads
        for (const d of downloaded) fs.unlink(d.dest, () => {});
        return;
      }

      // Phase 2: print each file with its own settings (color, duplex, copies).
      // Any single failure marks the whole job failed so it gets refunded;
      // partial-print recovery is not in scope.
      let printError = null;
      for (const d of downloaded) {
        try {
          console.log(
            "[agent] Printing file " + d.position + ":",
            d.dest,
            "(copies=" + d.copies + ", mode=" + d.mode +
              ", duplex=" + (d.doubleSided ? "yes" : "no") + ")"
          );
          await printFile(d.dest, {
            copies: d.copies,
            mode: d.mode,
            doubleSided: d.doubleSided,
          });
        } catch (e) {
          printError = e;
          break;
        }
      }
      // Clean up files regardless of outcome.
      for (const d of downloaded) fs.unlink(d.dest, () => {});

      if (printError) {
        console.error("[agent] Print failed:", printError.message);
        try {
          await postJson(api(`/api/jobs/${job.id}/print-result`), {
            ok: false,
            error: printError.message,
          });
        } catch (e2) {
          console.error("[agent] Could not report print failure:", e2.message);
        }
      } else {
        await postJson(api(`/api/jobs/${job.id}/print-result`), { ok: true });
        console.log("[agent] Printed OK:", job.id);
      }
    }
  } catch (e) {
    // Network/backend errors: log and keep going.
    console.error("[agent] poll error:", e.message);
  } finally {
    working = false;
  }
}

console.log("");
console.log("==============================================================");
console.log(" ASK Kiosk Windows Print Agent");
console.log(" Backend: " + BACKEND_URL);
console.log(" Kiosk:   " + (KIOSK_ID || "(active kiosk)"));
console.log(" Printer: " + (PRINTER_NAME || "(Windows default printer)"));
console.log(" Polling every " + POLL_MS + " ms. Leave this window open.");
console.log("==============================================================");
console.log("");

setInterval(tick, POLL_MS);
