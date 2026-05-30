// Loads the Razorpay checkout script and opens the payment modal.
// In mock mode (backend returns mock:true) we skip the real checkout and
// resolve immediately so the flow can be demoed without Razorpay.

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// order: { orderId, amount, currency, keyId, mock }
// Returns { paymentId, signature } on success, or { mock:true }.
export async function openCheckout(order) {
  if (order.mock) {
    // Mock mode: simulate a successful payment instantly.
    return { mock: true, paymentId: "pay_mock", signature: "sig_mock" };
  }
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    throw new Error(
      "Could not load Razorpay. Check your internet connection and try again."
    );
  }
  return new Promise((resolve, reject) => {
    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "ASK Kiosk",
      description: "Document printing",
      order_id: order.orderId,
      handler: (resp) =>
        resolve({
          paymentId: resp.razorpay_payment_id,
          signature: resp.razorpay_signature,
        }),
      modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
      theme: { color: "#1E73E8" },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}
