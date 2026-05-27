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

// Resolve the active kiosk (single-kiosk pilot: first one).
async function getActiveKiosk() {
  return prisma.kiosk.findFirst({ where: { isActive: true } });
}

// POST /api/jobs/upload  (multipart: file)
// Inspects the file, returns pageCount or an encrypted flag.
async function uploadFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const kiosk = await getActiveKiosk();
    if (!kiosk) return res.status(500).json({ error: "No active kiosk." });

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
    const job = await prisma.job.create({
      data: {
        kioskId: kiosk.id,
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

 // Only set gatewayPaymentId if it is not already taken (avoids unique clash
  // from double-fire of verify + webhook, and from repeated mock ids).
  const paymentData = { status: "SUCCESS" };
  if (method) paymentData.method = method;
  if (paymentId) {
    const clash = await prisma.payment.findUnique({
      where: { gatewayPaymentId: paymentId },
    });
    if (!clash) paymentData.gatewayPaymentId = paymentId;
  }
  await prisma.payment.update({
    where: { jobId: job.id },
    data: paymentData,
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
    const kiosk = await getActiveKiosk();
    if (!kiosk) return res.status(500).json({ error: "No active kiosk." });

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required." });

    const settings = await getSettings(kiosk.id);
    const codeHash = codeSvc.hashCode(String(code).trim());

    const job = await prisma.job.findFirst({
      where: { kioskId: kiosk.id, codeHash, state: "CODE_ISSUED" },
    });

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

module.exports = {
  uploadFile,
  unlockJob,
  configureJob,
  createPayment,
  verifyPayment,
  razorpayWebhook,
  claimAndPrint,
  jobStatus,
};
