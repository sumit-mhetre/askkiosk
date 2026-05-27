// Print service for ASK Kiosk.
// Sends a print-ready file to a network printer over raw TCP port 9100
// (the most widely supported path for WiFi printers). If the kiosk has no
// printerIp configured, it runs in SIMULATION mode so the full flow can be
// demoed on a laptop without hardware.
//
// Note: raw 9100 expects printer-ready data. Most office printers accept PDF
// directly on 9100; some need PostScript/PCL. For the pilot we send the file
// bytes as-is. The real-hardware test will confirm the 589 accepts PDF on 9100;
// if not, we add a conversion step here without touching the rest of the app.

const fs = require("fs");
const net = require("net");

// Attempt a raw 9100 print. Resolves on success, rejects on failure.
function sendRaw9100(filePath, host, port = 9100, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(filePath);
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
      socket.write(data, () => {
        // Give the printer a moment to accept, then close.
        setTimeout(() => done(null), 800);
      });
    });
  });
}

// Print a job. opts: { filePath, printerIp, printerPort, simulate }
// Returns { ok, simulated, error }
async function printFile(opts) {
  const { filePath, printerIp, printerPort = 9100 } = opts;

  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: "Print file not found." };
  }

  // No printer configured -> simulate (demo mode).
  if (!printerIp) {
    console.log(`[PRINT SIMULATION] Would print ${filePath} (no printerIp set).`);
    await new Promise((r) => setTimeout(r, 1000));
    return { ok: true, simulated: true };
  }

  try {
    await sendRaw9100(filePath, printerIp, printerPort);
    return { ok: true, simulated: false };
  } catch (e) {
    return { ok: false, error: e.message || "Print failed." };
  }
}

module.exports = { printFile, sendRaw9100 };
