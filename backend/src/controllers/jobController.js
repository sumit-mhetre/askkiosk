// Job controller: the heart of ASK Kiosk. Implements the job state machine.
// States: CREATED -> PAID -> CODE_ISSUED -> CLAIMED -> PRINTING -> PRINTED_OK
//         (or FAILED_REFUNDED / EXPIRED)

const path = require("path");
const { prisma, getSettings } = require("../services/settingsService");
const pricing = require("../services/pricingService");
const fileSvc = require("../services/fileService");
const codeSvc = require("../services/codeService");
const rzp = require("../services/razorpayService");
const printSvc = require("../services/printService");

// Resolve the active kiosk (single-kiosk fallback: first active one).
async function getActiveKiosk() {
  return prisma.kiosk.findFirst({ where: { isActive: true } });
}

// Resolve the kiosk for a request. Prefers an explicit kioskId (from the QR),
// falls back to the first active kiosk so older single-kiosk setups still work.
async function resolveKiosk(kioskId) {
  if (kioskId) {
    const k = await prisma.kiosk.findUnique({ where: { id: kioskId } });
    if (k) return k;
  }
  return getActiveKiosk();
}

// POST /api/jobs/upload-multi  (multipart: files[], body: kioskId)
// Accepts one or more files in a single batch. Creates a Job with multiMode
// of "shared" or "per_file" based on the kiosk setting, plus a JobFile row
// per uploaded file. Returns the file list with per-file page counts and any
// encrypted flag (encrypted files must be unlocked individually before pay).
async function uploadMultiple(req, res) {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "No files uploaded." });
    }

    const kiosk = await resolveKiosk(req.body.kioskId);
    if (!kiosk) {
      // Clean up the uploaded files since we can't proceed.
      for (const f of files) fileSvc.deleteFile(f.path);
      return res.status(400).json({
        error: "Please scan a kiosk QR code to start. No kiosk selected.",
      });
    }

    const settings = await getSettings(kiosk.id);

    if (!settings.multi_file_enabled) {
      for (const f of files) fileSvc.deleteFile(f.path);
      return res
        .status(400)
        .json({ error: "Multiple file uploads are not enabled for this kiosk." });
    }
    const maxFiles = Number(settings.multi_file_max) || 10;
    if (files.length > maxFiles) {
      for (const f of files) fileSvc.deleteFile(f.path);
      return res
        .status(400)
        .json({ error: `Too many files. Max ${maxFiles} per batch.` });
    }

    // Validate sizes up-front; reject the whole batch if any single file is over.
    for (const f of files) {
      const sizeMb = f.size / (1024 * 1024);
      if (sizeMb > settings.max_file_size_mb) {
        for (const ff of files) fileSvc.deleteFile(ff.path);
        return res.status(400).json({
          error: `"${f.originalname}" is too large. Max ${settings.max_file_size_mb} MB per file.`,
        });
      }
    }

    const multiMode =
      settings.multi_file_mode === "per_file" ? "per_file" : "shared";

    // Create the parent Job. Top-level columns mirror the FIRST file for
    // backward-compatible callers; the canonical per-file data is in JobFile.
    const first = files[0];
    const job = await prisma.job.create({
      data: {
        kioskId: kiosk.id,
        operatorId: kiosk.operatorId || null,
        multiMode,
        originalName: first.originalname,
        fileType: first.mimetype,
        filePath: first.path,
      },
    });

    // Inspect each file, create JobFile rows. Collect encrypted info.
    const fileEntries = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const info = await fileSvc.inspectFile(f.path, f.mimetype);
      const jobFile = await prisma.jobFile.create({
        data: {
          jobId: job.id,
          position: i + 1,
          originalName: f.originalname,
          fileType: f.mimetype,
          filePath: f.path,
          pageCount: info.ok ? info.pageCount : 0,
        },
      });
      fileEntries.push({
        id: jobFile.id,
        position: jobFile.position,
        name: f.originalname,
        fileType: f.mimetype,
        pageCount: info.ok ? info.pageCount : 0,
        encrypted: !info.ok && !!info.encrypted,
        ok: !!info.ok,
        error: info.ok ? null : info.error || null,
      });
    }

    // Update the Job's pageCount to the sum across files (used by pricing snapshots).
    const totalPages = fileEntries.reduce((s, e) => s + (e.pageCount || 0), 0);
    await prisma.job.update({
      where: { id: job.id },
      data: { pageCount: totalPages },
    });

    return res.json({
      jobId: job.id,
      multiMode,
      files: fileEntries,
      needsUnlock: fileEntries.some((f) => f.encrypted),
    });
  } catch (e) {
    console.error("uploadMultiple error:", e);
    return res.status(500).json({ error: "Upload failed." });
  }
}

// POST /api/jobs/:id/file/:fileId/unlock  { password }
// Unlocks one encrypted PDF in a multi-file batch.
async function unlockJobFile(req, res) {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required." });
    const jobFile = await prisma.jobFile.findUnique({
      where: { id: req.params.fileId },
    });
    if (!jobFile || jobFile.jobId !== req.params.id || !jobFile.filePath) {
      return res.status(404).json({ error: "File not found." });
    }
    const result = await fileSvc.unlockPdf(jobFile.filePath, password);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || "Wrong password." });
    }
    fileSvc.deleteFile(jobFile.filePath);
    await prisma.jobFile.update({
      where: { id: jobFile.id },
      data: { filePath: result.outPath, pageCount: result.pageCount },
    });
    // Recompute parent total pages.
    const all = await prisma.jobFile.findMany({
      where: { jobId: req.params.id },
    });
    const totalPages = all.reduce((s, f) => s + (f.pageCount || 0), 0);
    await prisma.job.update({
      where: { id: req.params.id },
      data: { pageCount: totalPages },
    });
    return res.json({ ok: true, pageCount: result.pageCount });
  } catch (e) {
    console.error("unlockJobFile error:", e);
    return res.status(500).json({ error: "Unlock failed." });
  }
}

// POST /api/jobs/:id/configure-multi
// Body for SHARED mode: { copies, mode, doubleSided, pageRange? }
// Body for PER_FILE mode: { files: [{ id, copies, mode, doubleSided, pageRange? }, ...] }
// Validates against limits using the SUM of sheets across files, then writes
// settings to each JobFile and stores the total amount on the parent Job.
async function configureMulti(req, res) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { files: { orderBy: { position: "asc" } } },
    });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.state !== "CREATED")
      return res.status(400).json({ error: "Job is not in a configurable state." });
    if (!job.files.length)
      return res.status(400).json({ error: "This job has no files." });

    const settings = await getSettings(job.kioskId);

    // Build per-file plans first (so we can validate the combined totals).
    let plans;
    if (job.multiMode === "per_file") {
      const incoming = Array.isArray(req.body.files) ? req.body.files : [];
      const byId = new Map(incoming.map((x) => [x.id, x]));
      plans = job.files.map((f) => {
        const inp = byId.get(f.id) || {};
        const copies = Math.max(1, parseInt(inp.copies, 10) || 1);
        const mode = inp.mode === "COLOR" ? "COLOR" : "BW";
        const doubleSided = !!inp.doubleSided;
        return {
          file: f,
          copies,
          mode,
          doubleSided,
          pageRange: inp.pageRange || null,
        };
      });
    } else {
      // shared mode: one config applied to all files
      const copies = Math.max(1, parseInt(req.body.copies, 10) || 1);
      const mode = req.body.mode === "COLOR" ? "COLOR" : "BW";
      const doubleSided = !!req.body.doubleSided;
      plans = job.files.map((f) => ({
        file: f,
        copies,
        mode,
        doubleSided,
        pageRange: req.body.pageRange || null,
      }));
    }

    // Per-file validation (pageCount must exist, copies cap), then aggregate sheet cap.
    let totalSheets = 0;
    let totalAmount = 0;
    const fileUpdates = [];
    for (const p of plans) {
      if (!p.file.pageCount || p.file.pageCount <= 0) {
        return res.status(400).json({
          error: `"${p.file.originalName}" has no readable pages.`,
        });
      }
      if (p.copies > settings.max_copies) {
        return res.status(400).json({
          error: `Maximum ${settings.max_copies} copies allowed per file.`,
        });
      }
      const sheets =
        pricing.sheetsForOneCopy(p.file.pageCount, p.doubleSided) * p.copies;
      totalSheets += sheets;
      const amount = pricing.computeAmount(
        {
          pageCount: p.file.pageCount,
          copies: p.copies,
          mode: p.mode,
          doubleSided: p.doubleSided,
        },
        settings
      );
      totalAmount += amount;
      fileUpdates.push({
        id: p.file.id,
        data: {
          copies: p.copies,
          mode: p.mode,
          doubleSided: p.doubleSided,
          pageRange: p.pageRange,
          sheetCount: sheets,
          amount,
        },
      });
    }

    if (totalSheets > settings.max_sheets_per_job) {
      return res.status(400).json({
        error: `This batch is ${totalSheets} sheets. The maximum per job is ${settings.max_sheets_per_job}. Reduce copies or remove a file.`,
      });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;

    // Persist per-file settings and parent totals.
    for (const u of fileUpdates) {
      await prisma.jobFile.update({ where: { id: u.id }, data: u.data });
    }
    await prisma.job.update({
      where: { id: job.id },
      data: {
        // Mirror the first file's top-level config so legacy code paths still work.
        copies: fileUpdates[0].data.copies,
        mode: fileUpdates[0].data.mode,
        doubleSided: fileUpdates[0].data.doubleSided,
        pageRange: fileUpdates[0].data.pageRange,
        sheetCount: totalSheets,
        amount: totalAmount,
      },
    });

    return res.json({
      ok: true,
      jobId: job.id,
      multiMode: job.multiMode,
      totalSheets,
      totalAmount,
      currency: settings.currency || "INR",
      files: fileUpdates.map((u) => ({ id: u.id, ...u.data })),
    });
  } catch (e) {
    console.error("configureMulti error:", e);
    return res.status(500).json({ error: "Configure failed." });
  }
}

// POST /api/jobs/:id/add-files  (multipart: files[])
// Append more files to an existing CREATED-state multi-file job. Enforces
// the per-kiosk max_files setting (total files across the batch).
async function appendFiles(req, res) {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "No files uploaded." });
    }

    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { files: true },
    });
    if (!job) {
      for (const f of files) fileSvc.deleteFile(f.path);
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.state !== "CREATED") {
      for (const f of files) fileSvc.deleteFile(f.path);
      return res
        .status(400)
        .json({ error: "Files can only be added before payment." });
    }
    if (job.multiMode === "single") {
      for (const f of files) fileSvc.deleteFile(f.path);
      return res
        .status(400)
        .json({ error: "This job does not support multiple files." });
    }

    const settings = await getSettings(job.kioskId);
    const maxFiles = Number(settings.multi_file_max) || 10;
    const existingCount = job.files.length;
    if (existingCount + files.length > maxFiles) {
      for (const f of files) fileSvc.deleteFile(f.path);
      return res
        .status(400)
        .json({ error: `Max ${maxFiles} files per batch. You already have ${existingCount}.` });
    }

    // Validate sizes.
    for (const f of files) {
      const sizeMb = f.size / (1024 * 1024);
      if (sizeMb > settings.max_file_size_mb) {
        for (const ff of files) fileSvc.deleteFile(ff.path);
        return res.status(400).json({
          error: `"${f.originalname}" is too large. Max ${settings.max_file_size_mb} MB per file.`,
        });
      }
    }

    // Inspect and append each file as a new JobFile row.
    const nextPosition = (existingCount > 0
      ? Math.max(...job.files.map((f) => f.position || 1))
      : 0) + 1;
    const added = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const info = await fileSvc.inspectFile(f.path, f.mimetype);
      const jobFile = await prisma.jobFile.create({
        data: {
          jobId: job.id,
          position: nextPosition + i,
          originalName: f.originalname,
          fileType: f.mimetype,
          filePath: f.path,
          pageCount: info.ok ? info.pageCount : 0,
        },
      });
      added.push({
        id: jobFile.id,
        position: jobFile.position,
        name: f.originalname,
        fileType: f.mimetype,
        pageCount: info.ok ? info.pageCount : 0,
        encrypted: !info.ok && !!info.encrypted,
        ok: !!info.ok,
        error: info.ok ? null : info.error || null,
      });
    }

    // Recompute parent total pages.
    const all = await prisma.jobFile.findMany({ where: { jobId: job.id } });
    const totalPages = all.reduce((s, f) => s + (f.pageCount || 0), 0);
    await prisma.job.update({
      where: { id: job.id },
      data: { pageCount: totalPages },
    });

    return res.json({
      jobId: job.id,
      added,
      needsUnlock: added.some((f) => f.encrypted),
    });
  } catch (e) {
    console.error("appendFiles error:", e);
    return res.status(500).json({ error: "Adding files failed." });
  }
}

// DELETE /api/jobs/:id/file/:fileId
// Remove one file from a multi-file job before payment.
async function deleteJobFile(req, res) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { files: true },
    });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.state !== "CREATED")
      return res
        .status(400)
        .json({ error: "Files can only be removed before payment." });

    const target = job.files.find((f) => f.id === req.params.fileId);
    if (!target) return res.status(404).json({ error: "File not found." });

    // Delete the file on disk and the JobFile row.
    if (target.filePath) fileSvc.deleteFile(target.filePath);
    await prisma.jobFile.delete({ where: { id: target.id } });

    const remaining = await prisma.jobFile.findMany({
      where: { jobId: job.id },
      orderBy: { position: "asc" },
    });

    // Recompute parent page count.
    const totalPages = remaining.reduce((s, f) => s + (f.pageCount || 0), 0);
    await prisma.job.update({
      where: { id: job.id },
      data: { pageCount: totalPages },
    });

    return res.json({
      ok: true,
      remaining: remaining.length,
      pageCount: totalPages,
    });
  } catch (e) {
    console.error("deleteJobFile error:", e);
    return res.status(500).json({ error: "Could not remove file." });
  }
}

// POST /api/jobs/upload  (multipart: file, body: kioskId)
// Inspects the file, returns pageCount or an encrypted flag.
async function uploadFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const kiosk = await resolveKiosk(req.body.kioskId);
    if (!kiosk)
      return res.status(400).json({
        error: "Please scan a kiosk QR code to start. No kiosk selected.",
      });

    const settings = await getSettings(kiosk.id);
    const sizeMb = req.file.size / (1024 * 1024);
    if (sizeMb > settings.max_file_size_mb) {
      fileSvc.deleteFile(req.file.path);
      return res
        .status(400)
        .json({ error: `File too large. Max ${settings.max_file_size_mb} MB.` });
    }

    const info = await fileSvc.inspectFile(req.file.path, req.file.mimetype);

    // Create the job in CREATED state now so we have an id to attach to.
    // Tag it with the kiosk's operator so the code is operator-scoped.
    const job = await prisma.job.create({
      data: {
        kioskId: kiosk.id,
        operatorId: kiosk.operatorId || null,
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        filePath: req.file.path,
        pageCount: info.ok ? info.pageCount : 0,
      },
    });

    if (!info.ok && info.encrypted) {
      return res.json({
        jobId: job.id,
        encrypted: true,
        message: "This PDF is password protected. Enter the password to continue.",
      });
    }
    if (!info.ok) {
      fileSvc.deleteFile(req.file.path);
      return res.status(400).json({ error: info.error || "Could not read file." });
    }

    return res.json({
      jobId: job.id,
      encrypted: false,
      pageCount: info.pageCount,
      isImage: info.isImage,
    });
  } catch (e) {
    console.error("uploadFile error:", e);
    return res.status(500).json({ error: "Upload failed." });
  }
}

// POST /api/jobs/:id/unlock  { password }
// Unlocks an encrypted PDF (validated BEFORE payment).
async function unlockJob(req, res) {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job || !job.filePath)
      return res.status(404).json({ error: "Job not found." });

    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required." });

    const result = await fileSvc.unlockPdf(job.filePath, password);
    if (!result.ok) return res.status(400).json({ error: result.error });

    // Replace the stored file with the unlocked, clean copy. Password not stored.
    fileSvc.deleteFile(job.filePath);
    await prisma.job.update({
      where: { id: job.id },
      data: { filePath: result.outPath, pageCount: result.pageCount },
    });

    return res.json({ jobId: job.id, pageCount: result.pageCount });
  } catch (e) {
    console.error("unlockJob error:", e);
    return res.status(500).json({ error: "Unlock failed." });
  }
}

// POST /api/jobs/:id/configure  { copies, mode, doubleSided, pageRange }
// Validates limits and returns the live price.
async function configureJob(req, res) {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.state !== "CREATED")
      return res.status(400).json({ error: "Job already paid or in progress." });

    const settings = await getSettings(job.kioskId);
    const copies = parseInt(req.body.copies, 10) || 1;
    const mode = req.body.mode === "COLOR" ? "COLOR" : "BW";
    const doubleSided = !!req.body.doubleSided;
    const pageRange = req.body.pageRange || "all";

    const cfg = { pageCount: job.pageCount, copies, mode, doubleSided };
    const limit = pricing.validateLimits(cfg, settings);
    if (!limit.ok) return res.status(400).json({ error: limit.error });

    const amount = pricing.computeAmount(cfg, settings);
    const sheets = pricing.totalSheets(job.pageCount, copies, doubleSided);

    await prisma.job.update({
      where: { id: job.id },
      data: { copies, mode, doubleSided, pageRange, amount, sheetCount: sheets },
    });

    return res.json({
      jobId: job.id,
      pageCount: job.pageCount,
      copies,
      mode,
      doubleSided,
      sheets,
      amount,
      currency: settings.currency,
    });
  } catch (e) {
    console.error("configureJob error:", e);
    return res.status(500).json({ error: "Configure failed." });
  }
}

// POST /api/jobs/:id/pay  -> creates a Razorpay order
async function createPayment(req, res) {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.amount <= 0)
      return res.status(400).json({ error: "Configure the job before paying." });

    const order = await rzp.createOrder(job.amount, job.id);

    await prisma.payment.upsert({
      where: { jobId: job.id },
      update: {
        gatewayOrderId: order.orderId,
        amount: job.amount,
        status: "INITIATED",
      },
      create: {
        jobId: job.id,
        gateway: "razorpay",
        gatewayOrderId: order.orderId,
        amount: job.amount,
        status: "INITIATED",
      },
    });

    return res.json({
      jobId: job.id,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      keyId: order.keyId,
      mock: order.mock,
    });
  } catch (e) {
    console.error("createPayment error:", e);
    return res.status(500).json({ error: "Could not start payment." });
  }
}

// Internal: mark a job paid and issue a code. Used by verify and webhook.
async function markPaidAndIssueCode(jobId, paymentId, method) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.state === "CODE_ISSUED" || job.state === "PAID") {
    // already handled; return existing (idempotent)
    return job;
  }

  const settings = await getSettings(job.kioskId);
  const rawCode = codeSvc.generateCode(settings.code_digits);
  const codeHash = codeSvc.hashCode(rawCode);
  const expiresAt = new Date(Date.now() + settings.code_expiry_minutes * 60000);
  const purgeAfter = new Date(
    Date.now() + settings.metadata_retention_days * 86400000
  );

  await prisma.payment.update({
    where: { jobId: job.id },
    data: {
      status: "SUCCESS",
      gatewayPaymentId: paymentId || undefined,
      method: method || undefined,
    },
  });

  await prisma.job.update({
    where: { id: job.id },
    data: {
      state: "CODE_ISSUED",
      paidAt: new Date(),
      codeHash,
      codeExpiresAt: expiresAt,
      purgeAfter,
    },
  });

  // Return the raw code only here so the immediate caller can show it once.
  return { job, rawCode, expiresAt };
}

// POST /api/jobs/:id/verify  { paymentId, signature }
// Client-side confirmation path (sandbox/checkout). Webhook is the source of
// truth in production, but this gives instant code display.
async function verifyPayment(req, res) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });
    if (!job || !job.payment)
      return res.status(404).json({ error: "Job/payment not found." });

    const { paymentId, signature } = req.body;
    const ok = rzp.verifyCheckoutSignature({
      orderId: job.payment.gatewayOrderId,
      paymentId,
      signature,
    });
    if (!ok) return res.status(400).json({ error: "Payment verification failed." });

    const result = await markPaidAndIssueCode(job.id, paymentId, req.body.method);
    if (!result) return res.status(500).json({ error: "Could not issue code." });

    // result may be the existing job (idempotent) without rawCode.
    if (result.rawCode) {
      return res.json({
        jobId: job.id,
        code: result.rawCode,
        expiresAt: result.expiresAt,
      });
    }
    return res.json({ jobId: job.id, code: null, alreadyIssued: true });
  } catch (e) {
    console.error("verifyPayment error:", e);
    return res.status(500).json({ error: "Verify failed." });
  }
}

// POST /api/webhook/razorpay  (raw body)
// Source of truth for payment in production.
async function razorpayWebhook(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const raw = req.rawBody || JSON.stringify(req.body);
    if (!rzp.verifyWebhookSignature(raw, signature)) {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    const event = req.body.event;
    if (event === "payment.captured" || event === "order.paid") {
      const entity =
        (req.body.payload &&
          (req.body.payload.payment
            ? req.body.payload.payment.entity
            : req.body.payload.order && req.body.payload.order.entity)) ||
        {};
      const orderId = entity.order_id || entity.id;
      const paymentId = entity.id;
      const method = entity.method;

      const payment = await prisma.payment.findFirst({
        where: { gatewayOrderId: orderId },
      });
      if (payment) {
        await markPaidAndIssueCode(payment.jobId, paymentId, method);
      }
    }
    // Always 200 so Razorpay does not retry endlessly.
    return res.json({ received: true });
  } catch (e) {
    console.error("webhook error:", e);
    return res.status(200).json({ received: true });
  }
}

// POST /api/kiosk/claim  { code }
// Kiosk enters the code, then prints. This is where the print actually happens.
async function claimAndPrint(req, res) {
  try {
    const kiosk = await resolveKiosk(req.body.kioskId);
    if (!kiosk) return res.status(500).json({ error: "No active kiosk." });

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required." });

    const settings = await getSettings(kiosk.id);
    const codeHash = codeSvc.hashCode(String(code).trim());

    const where = kiosk.operatorId
      ? { operatorId: kiosk.operatorId, codeHash, state: "CODE_ISSUED" }
      : { kioskId: kiosk.id, codeHash, state: "CODE_ISSUED" };

    const job = await prisma.job.findFirst({ where });

    if (!job) {
      return res.status(404).json({ error: "Invalid or already used code." });
    }
    if (codeSvc.isExpired(job.codeExpiresAt)) {
      await prisma.job.update({
        where: { id: job.id },
        data: { state: "EXPIRED" },
      });
      return res.status(400).json({ error: "This code has expired." });
    }

    // Move to CLAIMED then PRINTING (single job at a time).
    const busy = await prisma.job.findFirst({
      where: { kioskId: kiosk.id, state: "PRINTING" },
    });
    if (busy) return res.status(409).json({ error: settings.busy_message });

    await prisma.job.update({
      where: { id: job.id },
      data: { state: "PRINTING" },
    });

    // Attempt print with retries, then auto-refund on failure.
    const maxRetries = settings.print_max_retries || 3;
    let lastError = null;
    let printed = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await printSvc.printFile({
        filePath: job.filePath,
        printerIp: kiosk.printerIp,
        printerPort: kiosk.printerPort,
      });
      await prisma.job.update({
        where: { id: job.id },
        data: { printRetries: attempt },
      });
      if (result.ok) {
        printed = true;
        break;
      }
      lastError = result.error;
      await new Promise((r) =>
        setTimeout(r, settings.print_retry_delay_ms || 3000)
      );
    }

    if (printed) {
      fileSvc.deleteFile(job.filePath);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          state: "PRINTED_OK",
          filePath: null,
          fileDeleted: true,
          printedAt: new Date(),
        },
      });
      return res.json({ ok: true, message: "Printing. Please collect your document." });
    }

    // Print failed after retries -> auto refund.
    const payment = await prisma.payment.findUnique({
      where: { jobId: job.id },
    });
    let refunded = false;
    if (payment && payment.gatewayPaymentId) {
      try {
        const r = await rzp.refundPayment(payment.gatewayPaymentId, job.amount);
        await prisma.payment.update({
          where: { jobId: job.id },
          data: { status: "REFUNDED", refundId: r.id, refundedAt: new Date() },
        });
        refunded = true;
      } catch (e) {
        console.error("refund failed:", e);
      }
    }
    fileSvc.deleteFile(job.filePath);
    await prisma.job.update({
      where: { id: job.id },
      data: { state: "FAILED_REFUNDED", filePath: null, fileDeleted: true },
    });

    return res.status(500).json({
      ok: false,
      refunded,
      error:
        "Printing failed after retries. " +
        (refunded
          ? "Your payment has been refunded."
          : "A refund will be processed.") +
        (lastError ? " (" + lastError + ")" : ""),
    });
  } catch (e) {
    console.error("claimAndPrint error:", e);
    return res.status(500).json({ error: "Print request failed." });
  }
}

// GET /api/jobs/:id/status
async function jobStatus(req, res) {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: { payment: true },
  });
  if (!job) return res.status(404).json({ error: "Job not found." });
  return res.json({
    jobId: job.id,
    state: job.state,
    amount: job.amount,
    paymentStatus: job.payment ? job.payment.status : null,
  });
}

// POST /api/kiosk/claim-only  { code }
// Like claimAndPrint, but does NOT try to print server-side. Used when a
// local print helper (laptop or Android) does the actual printing.
// Returns { jobId, fileUrl } so the helper can fetch the file.
async function claimOnly(req, res) {
  try {
    // The kiosk identifies itself via kioskId (from its saved config). Falls
    // back to the active kiosk for older single-kiosk setups.
    const kiosk = await resolveKiosk(req.body.kioskId);
    if (!kiosk) return res.status(500).json({ error: "No active kiosk." });

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required." });

    const settings = await getSettings(kiosk.id);
    const codeHash = codeSvc.hashCode(String(code).trim());

    // Operator-scoped match: a code is valid if the job belongs to the same
    // operator as this kiosk. If the kiosk has no operator (legacy), fall back
    // to matching by kiosk id.
    const where = kiosk.operatorId
      ? { operatorId: kiosk.operatorId, codeHash, state: "CODE_ISSUED" }
      : { kioskId: kiosk.id, codeHash, state: "CODE_ISSUED" };

    const job = await prisma.job.findFirst({ where });
    if (!job) return res.status(404).json({ error: "Invalid or already used code." });
    if (codeSvc.isExpired(job.codeExpiresAt)) {
      await prisma.job.update({ where: { id: job.id }, data: { state: "EXPIRED" } });
      return res.status(400).json({ error: "This code has expired." });
    }

    // Busy check is per physical kiosk (this machine).
    const busy = await prisma.job.findFirst({
      where: { kioskId: kiosk.id, state: "PRINTING" },
    });
    if (busy) return res.status(409).json({ error: settings.busy_message });

    // Route the job to THIS kiosk for printing (the machine where the code
    // was entered), even if it was uploaded at another of the operator's kiosks.
    await prisma.job.update({
      where: { id: job.id },
      data: { state: "PRINTING", kioskId: kiosk.id },
    });

    return res.json({
      ok: true,
      jobId: job.id,
      fileUrl: `/api/jobs/${job.id}/file`,
    });
  } catch (e) {
    console.error("claimOnly error:", e);
    return res.status(500).json({ error: "Claim failed." });
  }
}

// GET /api/jobs/:id/file
// Streams the print-ready file. Only allowed while job is PRINTING (i.e.
// the code has just been claimed). The helper consumes this once.
async function fetchJobFile(req, res) {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.state !== "PRINTING") {
      return res.status(403).json({ error: "Job not ready for printing." });
    }
    if (!job.filePath) {
      return res.status(410).json({ error: "File no longer available." });
    }
    const fs = require("fs");
    if (!fs.existsSync(job.filePath)) {
      return res.status(410).json({ error: "File missing on server." });
    }
    res.setHeader(
      "Content-Type",
      job.fileType || "application/octet-stream"
    );
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(job.filePath).pipe(res);
  } catch (e) {
    console.error("fetchJobFile error:", e);
    return res.status(500).json({ error: "Could not fetch file." });
  }
}

// POST /api/jobs/:id/print-result  { ok, error? }
// The print helper calls this after attempting to print, so the backend can
// finalize the state machine (PRINTED_OK or auto-refund + FAILED_REFUNDED).
async function reportPrintResult(req, res) {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found." });
    if (job.state !== "PRINTING") {
      return res.status(400).json({ error: "Job not in PRINTING state." });
    }

    const ok = !!req.body.ok;
    if (ok) {
      fileSvc.deleteFile(job.filePath);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          state: "PRINTED_OK",
          filePath: null,
          fileDeleted: true,
          printedAt: new Date(),
        },
      });
      return res.json({ ok: true });
    }

    // Helper reports failure -> auto-refund and clean up.
    const payment = await prisma.payment.findUnique({ where: { jobId: job.id } });
    let refunded = false;
    if (payment && payment.gatewayPaymentId) {
      try {
        const r = await rzp.refundPayment(payment.gatewayPaymentId, job.amount);
        await prisma.payment.update({
          where: { jobId: job.id },
          data: { status: "REFUNDED", refundId: r.id, refundedAt: new Date() },
        });
        refunded = true;
      } catch (e) {
        console.error("refund failed:", e);
      }
    }
    fileSvc.deleteFile(job.filePath);
    await prisma.job.update({
      where: { id: job.id },
      data: { state: "FAILED_REFUNDED", filePath: null, fileDeleted: true },
    });
    return res.json({ ok: false, refunded, error: req.body.error || null });
  } catch (e) {
    console.error("reportPrintResult error:", e);
    return res.status(500).json({ error: "Report failed." });
  }
}

// GET /api/agent/next-job?kioskId=...
// The local print agent (Windows/Android) polls this. Returns the next job
// in PRINTING state for this kiosk, with a file URL to download. Returns
// { job: null } when nothing is waiting.
async function agentNextJob(req, res) {
  try {
    let kioskId = req.query.kioskId;
    if (!kioskId) {
      const kiosk = await getActiveKiosk();
      kioskId = kiosk ? kiosk.id : null;
    }
    if (!kioskId) return res.json({ job: null });

    const job = await prisma.job.findFirst({
      where: { kioskId, state: "PRINTING", fileDeleted: false },
      orderBy: { updatedAt: "asc" },
      include: { files: { orderBy: { position: "asc" } } },
    });
    if (!job) return res.json({ job: null });

    // Build a normalized file list the agent loops over. For "single" mode the
    // file lives on the Job columns; for "shared"/"per_file" it's in JobFile.
    let files;
    if (job.multiMode === "single" || !job.files.length) {
      files = [
        {
          id: job.id, // legacy: same as job for single
          position: 1,
          fileType: job.fileType,
          fileUrl: `/api/jobs/${job.id}/file`,
          copies: job.copies,
          mode: job.mode,
          doubleSided: job.doubleSided,
        },
      ];
    } else {
      files = job.files.map((f) => ({
        id: f.id,
        position: f.position,
        fileType: f.fileType,
        fileUrl: `/api/jobs/${job.id}/file/${f.id}`,
        copies: f.copies,
        mode: f.mode,
        doubleSided: f.doubleSided,
      }));
    }

    return res.json({
      job: {
        id: job.id,
        multiMode: job.multiMode,
        // legacy top-level fields (still useful for old agents)
        copies: job.copies,
        mode: job.mode,
        doubleSided: job.doubleSided,
        fileType: job.fileType,
        fileUrl: `/api/jobs/${job.id}/file`, // legacy single-file URL
        files,
      },
    });
  } catch (e) {
    console.error("agentNextJob error:", e);
    return res.status(500).json({ error: "Agent poll failed." });
  }
}

// GET /api/jobs/:id/file/:fileId  -> stream one specific file in a multi-file job
async function fetchOneJobFile(req, res) {
  try {
    const file = await prisma.jobFile.findUnique({
      where: { id: req.params.fileId },
    });
    if (!file || file.jobId !== req.params.id)
      return res.status(404).json({ error: "File not found." });
    if (!file.filePath)
      return res.status(410).json({ error: "File no longer available." });
    const fs = require("fs");
    if (!fs.existsSync(file.filePath))
      return res.status(410).json({ error: "File missing on server." });
    res.setHeader("Content-Type", file.fileType || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(file.filePath).pipe(res);
  } catch (e) {
    console.error("fetchOneJobFile error:", e);
    return res.status(500).json({ error: "File fetch failed." });
  }
}

module.exports = {
  uploadFile,
  unlockJob,
  configureJob,
  createPayment,
  verifyPayment,
  razorpayWebhook,
  claimAndPrint,
  claimOnly,
  fetchJobFile,
  fetchOneJobFile,
  reportPrintResult,
  agentNextJob,
  jobStatus,
  uploadMultiple,
  unlockJobFile,
  configureMulti,
  appendFiles,
  deleteJobFile,
};
