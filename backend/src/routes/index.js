// Routes for ASK Kiosk.
const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { UPLOAD_DIR } = require("../services/fileService");
const job = require("../controllers/jobController");
const settings = require("../controllers/settingsController");
const admin = require("../controllers/adminController");
const paper = require("../controllers/paperController");
const reports = require("../controllers/reportsController");
const { requireRole } = require("../services/authService");

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
router.post(
  "/jobs/upload-multi",
  upload.array("files", 20), // hard cap; settings.multi_file_max applies per kiosk
  job.uploadMultiple
);
router.post(
  "/jobs/:id/add-files",
  upload.array("files", 20),
  job.appendFiles
);
router.delete("/jobs/:id/file/:fileId", job.deleteJobFile);
router.post("/jobs/:id/file/:fileId/unlock", job.unlockJobFile);
router.post("/jobs/:id/configure-multi", job.configureMulti);
router.get("/jobs/:id/precheck-paper", job.precheckPaper);
router.post("/jobs/:id/unlock", job.unlockJob);
router.post("/jobs/:id/configure", job.configureJob);
router.post("/jobs/:id/pay", job.createPayment);
router.post("/jobs/:id/verify", job.verifyPayment);
router.get("/jobs/:id/status", job.jobStatus);

// Kiosk flow
router.post("/kiosk/claim", job.claimAndPrint);
router.post("/kiosk/claim-only", job.claimOnly);
router.get("/kiosk/info", settings.kioskInfo);

// Print helper / agent endpoints
router.get("/jobs/:id/file", job.fetchJobFile);
router.get("/jobs/:id/file/:fileId", job.fetchOneJobFile);
router.post("/jobs/:id/print-result", job.reportPrintResult);
router.get("/agent/next-job", job.agentNextJob);

// Admin settings
router.get("/settings", settings.listSettings);
router.put("/settings", settings.updateSetting);

// Super admin: login is open; the rest require an admin token.
router.post("/admin/login", admin.adminLogin);
router.post("/admin/operators", requireRole("admin"), admin.createOperator);
router.get("/admin/operators", requireRole("admin"), admin.listOperators);
router.post("/admin/kiosks", requireRole("admin"), admin.createKiosk);
router.get("/admin/kiosks", requireRole("admin"), admin.listKiosks);

// Paper tracking (admin)
router.get("/admin/kiosks/:kioskId/paper", requireRole("admin"), paper.getStatus);
router.post("/admin/kiosks/:kioskId/paper/add", requireRole("admin"), paper.add);
router.post("/admin/kiosks/:kioskId/paper/set", requireRole("admin"), paper.setExact);
router.put("/admin/kiosks/:kioskId/paper/config", requireRole("admin"), paper.updateConfig);
router.get("/admin/kiosks/:kioskId/paper/history", requireRole("admin"), paper.history);

// Reports (admin)
router.get("/admin/reports", requireRole("admin"), reports.allKiosks);
router.get("/admin/reports/:kioskId", requireRole("admin"), reports.oneKiosk);

// Public: customer's pre-payment paper precheck (no auth, but rate-limit-friendly)
router.get("/kiosk/:kioskId/paper-status", paper.getStatus);

module.exports = router;
