// ASK Kiosk backend entry point.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const routes = require("./routes");
const { startExpiryLoop, runExpirySweep } = require("./services/expiryService");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());

// Capture raw body for the webhook route (needed for signature verification),
// while still parsing JSON for everything.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

// Lazy expiry check: on any API activity, trigger a throttled sweep so that
// unused-code refunds still happen on hosting that sleeps when idle.
app.use((req, res, next) => {
  runExpirySweep().catch(() => {});
  next();
});

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true, service: "ask-kiosk" }));

// Webhook (mounted before generic routes is fine; it lives under /api too)
const job = require("./controllers/jobController");
app.post("/api/webhook/razorpay", job.razorpayWebhook);

// All other API routes
app.use("/api", routes);

// Multer / generic error handler
app.use((err, req, res, next) => {
  if (err) {
    console.error("Error:", err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`ASK Kiosk backend running on http://localhost:${PORT}`);
  // Background expiry loop (fires while the process is awake).
  startExpiryLoop(60000);
});
