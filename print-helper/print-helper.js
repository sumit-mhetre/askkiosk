// ASK Kiosk - Local Print Helper
// Runs on the laptop (or any machine) that's on the same WiFi as the printer.
// The kiosk web page calls this helper on http://localhost:5050 to actually print.
//
// Why it exists: the backend (on Render) cannot reach a printer on a private
// office WiFi. This helper is the bridge: it sits on the local network with
// the printer, takes file bytes from the backend, and pushes them to the
// printer's IP on TCP port 9100.

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");

// ---- Config ----
// Edit these or set via env vars. PRINTER_IP is the only required value.
const PORT = parseInt(process.env.PORT || "5050", 10);
const PRINTER_IP = process.env.PRINTER_IP || ""; // e.g. "192.168.1.50"
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || "9100", 10);
const BACKEND_URL = process.env.BACKEND_URL || "https://askkiosk.onrender.com";
const HELPER_KEY = process.env.HELPER_KEY || ""; // optional shared key for the kiosk to identify itself

if (!PRINTER_IP) {
  console.log("");
  console.log("==============================================================");
  console.log(" ASK Kiosk Print Helper");
  console.log("==============================================================");
  console.log(" PRINTER_IP is not set.");
  console.log(" Set it before starting. Examples:");
  console.log("   Windows:  set PRINTER_IP=192.168.1.50 && node print-helper.js");
  console.log("   PowerShell: $env:PRINTER_IP='192.168.1.50'; node print-helper.js");
  console.log("   Linux/Mac:  PRINTER_IP=192.168.1.50 node print-helper.js");
  console.log("==============================================================");
  console.log("");
  process.exit(1);
}

// ---- Helpers ----

// Download a file (PDF/image bytes) from the backend.
function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error("Fetch failed, HTTP " + res.statusCode));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

// Push raw bytes to a network printer on port 9100.
function sendToPrinter(bytes, host, port = 9100, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(true);
    };
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => done(new Error("Printer connection timed out.")));
    socket.on("error", (e) => done(e));
    socket.connect(port, host, () => {
      socket.write(bytes, () => {
        // Give the printer a moment to accept, then close cleanly.
        setTimeout(() => done(null), 1000);
      });
    });
  });
}

// CORS headers for the kiosk page to call us cross-origin.
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Helper-Key");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

// ---- HTTP server ----
const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // GET /health  - is the helper alive
  if (req.method === "GET" && req.url === "/health") {
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        ok: true,
        printer: { ip: PRINTER_IP, port: PRINTER_PORT },
        backend: BACKEND_URL,
      })
    );
  }

  // POST /print  { jobId, fileUrl? }
  // fileUrl is optional; if not provided, we ask the backend for it.
  if (req.method === "POST" && req.url === "/print") {
    try {
      // Optional shared key check
      if (HELPER_KEY) {
        const got = req.headers["x-helper-key"] || "";
        if (got !== HELPER_KEY) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ ok: false, error: "Unauthorized." }));
        }
      }
      const body = await readJsonBody(req);
      const jobId = body.jobId;
      if (!jobId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, error: "jobId required." }));
      }

      // Where to fetch the file from. Backend exposes /api/jobs/:id/file
      // (added in the matching backend change). We try that endpoint.
      const fileUrl =
        body.fileUrl ||
        BACKEND_URL.replace(/\/+$/, "") + "/api/jobs/" + jobId + "/file";

      console.log("[helper] Fetching file for job", jobId, "from", fileUrl);
      const bytes = await fetchBytes(fileUrl);
      console.log("[helper] Got", bytes.length, "bytes. Sending to printer", PRINTER_IP);

      await sendToPrinter(bytes, PRINTER_IP, PRINTER_PORT);
      console.log("[helper] Print sent OK for job", jobId);

      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("[helper] Print failed:", e.message);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  res.statusCode = 404;
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("==============================================================");
  console.log(" ASK Kiosk Print Helper running on http://localhost:" + PORT);
  console.log(" Printer:  " + PRINTER_IP + ":" + PRINTER_PORT);
  console.log(" Backend:  " + BACKEND_URL);
  console.log(" Health:   http://localhost:" + PORT + "/health");
  console.log("==============================================================");
  console.log("");
});
