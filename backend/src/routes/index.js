// Routes for ASK Kiosk.
const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { UPLOAD_DIR } = require("../services/fileService");
const job = require("../controllers/jobController");
const settings = require("../controllers/settingsController");

const router = express.Router();

// Multer disk storage with a random safe filename.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const name = crypto.randomBytes(10).toString("hex") + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // hard cap; finer limit enforced in controller
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/");
    cb(ok ? null : new Error("Only PDF or image files are allowed."), ok);
  },
});

// Customer (phone) flow
router.post("/jobs/upload", upload.single("file"), job.uploadFile);
router.post("/jobs/:id/unlock", job.unlockJob);
router.post("/jobs/:id/configure", job.configureJob);
router.post("/jobs/:id/pay", job.createPayment);
router.post("/jobs/:id/verify", job.verifyPayment);
router.get("/jobs/:id/status", job.jobStatus);

// Kiosk flow
router.post("/kiosk/claim", job.claimAndPrint);
router.get("/kiosk/info", settings.kioskInfo);

// Admin settings
router.get("/settings", settings.listSettings);
router.put("/settings", settings.updateSetting);

module.exports = router;
