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

// Print a file silently on Windows using PowerShell + the default print verb.
// For PDFs this uses the system default PDF handler's print verb; for images
// it uses the Windows photo print verb. This prints without a dialog.
function printWindows(filePath, copies) {
  return new Promise((resolve, reject) => {
    // Build a PowerShell command that prints the file silently.
    // Start-Process -Verb Print sends the file to the default printer.
    const printerArg = PRINTER_NAME
      ? `-PrinterName '${PRINTER_NAME.replace(/'/g, "''")}'`
      : "";
    // We loop for copies since the Print verb prints one copy.
    const n = Math.max(1, copies || 1);
    const ps = [
      `$ErrorActionPreference='Stop';`,
      `for ($i=0; $i -lt ${n}; $i++) {`,
      `  Start-Process -FilePath '${filePath.replace(/'/g, "''")}' -Verb Print ${printerArg} -PassThru | Out-Null;`,
      `  Start-Sleep -Milliseconds 1500;`,
      `}`,
    ].join(" ");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(true);
      }
    );
  });
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
      console.log("[agent] Job ready:", job.id, "- downloading...");
      const ext = (job.fileType || "").includes("pdf")
        ? ".pdf"
        : (job.fileType || "").includes("png")
        ? ".png"
        : ".jpg";
      const dest = path.join(TMP_DIR, job.id + ext);
      await downloadFile(api(job.fileUrl), dest);
      console.log("[agent] Printing", dest);
      try {
        await printWindows(dest, job.copies);
        await postJson(api(`/api/jobs/${job.id}/print-result`), { ok: true });
        console.log("[agent] Printed OK:", job.id);
      } catch (printErr) {
        console.error("[agent] Print failed:", printErr.message);
        await postJson(api(`/api/jobs/${job.id}/print-result`), {
          ok: false,
          error: printErr.message,
        });
      } finally {
        fs.unlink(dest, () => {});
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
