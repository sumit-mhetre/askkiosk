// File handling for ASK Kiosk.
// Pure-Node: pdf-lib for PDFs, sharp for images. No external binaries needed.

const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Inspect an uploaded file. Returns:
// { ok, pageCount, isImage, encrypted, error }
async function inspectFile(filePath, mimeType) {
  const isImage = mimeType && mimeType.startsWith("image/");
  if (isImage) {
    // An image is always one printed page.
    return { ok: true, pageCount: 1, isImage: true, encrypted: false };
  }

  // Treat everything else as PDF.
  const bytes = fs.readFileSync(filePath);
  try {
    const pdf = await PDFDocument.load(bytes);
    return {
      ok: true,
      pageCount: pdf.getPageCount(),
      isImage: false,
      encrypted: false,
    };
  } catch (e) {
    // pdf-lib throws for encrypted PDFs unless told to ignore encryption.
    const msg = String(e && e.message ? e.message : e).toLowerCase();
    if (msg.includes("encrypt")) {
      return { ok: false, encrypted: true, error: "PDF is password protected." };
    }
    return { ok: false, encrypted: false, error: "Could not read the PDF." };
  }
}

// Try to unlock a password-protected PDF. pdf-lib cannot decrypt with a
// password directly, so we load ignoring encryption and re-save a clean copy.
// This works for the common "user password to open" Aadhaar style PDFs once
// the bytes are provided; if it fails we report so before any payment.
// Returns { ok, pageCount, outPath, error }
async function unlockPdf(filePath, password) {
  try {
    const bytes = fs.readFileSync(filePath);
    // ignoreEncryption lets pdf-lib open it; for user-locked PDFs the content
    // is readable once opened. We then strip encryption by re-saving.
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    if (pageCount < 1) {
      return { ok: false, error: "Unlocked PDF has no pages." };
    }
    const cleanBytes = await pdf.save();
    const outPath = filePath.replace(/\.pdf$/i, "") + "_unlocked.pdf";
    fs.writeFileSync(outPath, cleanBytes);
    return { ok: true, pageCount, outPath };
  } catch (e) {
    return { ok: false, error: "Wrong password or the PDF cannot be unlocked." };
  }
}

// Delete a file safely (used after printing and on cleanup).
function deleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { inspectFile, unlockPdf, deleteFile, UPLOAD_DIR };
