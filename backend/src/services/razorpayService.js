// Razorpay integration for ASK Kiosk.
// Uses test keys in sandbox. If keys are not set, runs in MOCK mode so the
// flow can be demoed without a Razorpay account.

const crypto = require("crypto");

let razorpay = null;
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const MOCK = !keyId || !keySecret || keyId.includes("xxxx");

if (!MOCK) {
  const Razorpay = require("razorpay");
  razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// Create a payment order for the given amount (rupees).
// Returns { orderId, amount, currency, keyId, mock }
async function createOrder(amountRupees, receipt) {
  const amountPaise = Math.round(amountRupees * 100);
  if (MOCK) {
    return {
      orderId: "order_mock_" + crypto.randomBytes(6).toString("hex"),
      amount: amountPaise,
      currency: "INR",
      keyId: "rzp_test_mock",
      mock: true,
    };
  }
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt,
  });
  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,
    mock: false,
  };
}

// Verify the checkout signature returned by Razorpay on the client.
function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (MOCK) return true; // mock mode accepts
  const body = orderId + "|" + paymentId;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");
  return expected === signature;
}

// Verify a webhook signature (X-Razorpay-Signature) against the raw body.
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (MOCK || !secret) return true;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}

// Issue a refund for a payment.
async function refundPayment(paymentId, amountRupees) {
  if (MOCK) {
    return { id: "rfnd_mock_" + crypto.randomBytes(6).toString("hex"), mock: true };
  }
  return razorpay.payments.refund(paymentId, {
    amount: Math.round(amountRupees * 100),
  });
}

module.exports = {
  createOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  refundPayment,
  MOCK,
};
