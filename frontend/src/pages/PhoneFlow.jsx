import React, { useState, useEffect } from "react";
import { Logo, StepHeader, ErrorNote } from "../components/UI.jsx";
import {
  uploadFile,
  unlockJob,
  configureJob,
  createPayment,
  verifyPayment,
  getStatus,
} from "../lib/api.js";
import { loadRazorpayScript, openCheckout } from "../lib/razorpay.js";

const STEP = {
  UPLOAD: "upload",
  UNLOCK: "unlock",
  CONFIG: "config",
  PAYING: "paying",
  CODE: "code",
  PRINTED: "printed",
  REFUNDED: "refunded",
};

export default function PhoneFlow() {
  const [step, setStep] = useState(STEP.UPLOAD);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");

  // The kiosk this customer is using, read from the QR URL (?kiosk=ID).
  // This ties the job (and thus the code) to the right operator.
  const kioskId = new URLSearchParams(window.location.search).get("kiosk") || "";

  const [jobId, setJobId] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [password, setPassword] = useState("");

  const [copies, setCopies] = useState(1);
  const [mode, setMode] = useState("BW");
  const [doubleSided, setDoubleSided] = useState(false);
  const [priceInfo, setPriceInfo] = useState(null);

  const [code, setCode] = useState("");

  // Poll job status while on the CODE screen so the phone knows when the
  // kiosk has actually printed (or refunded), and updates the view itself.
  useEffect(() => {
    if (step !== STEP.CODE || !jobId) return;
    let stopped = false;
    const startedAt = Date.now();
    const MAX_MS = 10 * 60 * 1000; // stop polling after 10 minutes
    const tick = async () => {
      if (stopped) return;
      try {
        const s = await getStatus(jobId);
        if (s.state === "PRINTED_OK") {
          setStep(STEP.PRINTED);
          return;
        }
        if (s.state === "FAILED_REFUNDED") {
          setStep(STEP.REFUNDED);
          return;
        }
      } catch (e) {
        // ignore transient errors; keep polling
      }
      if (Date.now() - startedAt < MAX_MS) {
        setTimeout(tick, 3000);
      }
    };
    const t = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [step, jobId]);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError("");
    setUploadPct(0);
    setBusy(true);
    try {
      setFileName(file.name);
      const res = await uploadFile(file, kioskId, (pct) => setUploadPct(pct));
      setJobId(res.jobId);
      if (res.encrypted) {
        setStep(STEP.UNLOCK);
      } else {
        setPageCount(res.pageCount);
        // For a single-page file, duplex makes no sense; force single sided.
        const effDouble = res.pageCount > 1 ? doubleSided : false;
        if (effDouble !== doubleSided) setDoubleSided(false);
        setStep(STEP.CONFIG);
        await recalc(res.jobId, copies, mode, effDouble);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError("");
    setBusy(true);
    try {
      const res = await unlockJob(jobId, password);
      setPageCount(res.pageCount);
      setPassword("");
      const effDouble = res.pageCount > 1 ? doubleSided : false;
      if (effDouble !== doubleSided) setDoubleSided(false);
      setStep(STEP.CONFIG);
      await recalc(jobId, copies, mode, effDouble);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function recalc(id, c, m, d) {
    try {
      const res = await configureJob(id, {
        copies: c,
        mode: m,
        doubleSided: d,
      });
      setPriceInfo(res);
      setError("");
    } catch (err) {
      setPriceInfo(null);
      setError(errMsg(err));
    }
  }

  function changeConfig(next) {
    const c = next.copies ?? copies;
    const m = next.mode ?? mode;
    const d = next.doubleSided ?? doubleSided;
    setCopies(c);
    setMode(m);
    setDoubleSided(d);
    if (jobId) recalc(jobId, c, m, d);
  }

  async function handlePay() {
    if (!priceInfo) return;
    setError("");
    setBusy(true);
    setStep(STEP.PAYING);
    try {
      const order = await createPayment(jobId);
      if (!order.mock) await loadRazorpayScript();
      const result = await openCheckout(order);
      const verify = await verifyPayment(jobId, {
        paymentId: result.paymentId,
        signature: result.signature,
        method: result.method,
      });
      if (verify.code) {
        setCode(verify.code);
        setStep(STEP.CODE);
      } else {
        setError("Payment done but code not issued. Please contact support.");
        setStep(STEP.CONFIG);
      }
    } catch (err) {
      setError(errMsg(err));
      setStep(STEP.CONFIG);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center px-4 py-6 max-w-md mx-auto">
      <div className="py-4">
        <Logo />
      </div>

      <div className="card w-full p-5 mt-2">
        {step === STEP.UPLOAD && (
          <>
            <StepHeader
              title="Print Your Documents"
              subtitle="Upload a PDF or image to begin"
            />
            {busy ? (
              <div className="text-center py-6">
                <Spinner />
                <p className="mt-4 font-semibold">
                  {uploadPct > 0 && uploadPct < 100
                    ? `Uploading... ${uploadPct}%`
                    : "Reading your file..."}
                </p>
                {uploadPct > 0 && (
                  <div className="w-full bg-bg rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${uploadPct}%`, background: "#1E73E8" }}
                    />
                  </div>
                )}
                <p className="text-muted text-xs mt-3">Please wait a moment.</p>
              </div>
            ) : (
              <>
                <label className="btn btn-primary cursor-pointer">
                  Choose File
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={handleFile}
                    disabled={busy}
                  />
                </label>
                <p className="text-center text-muted text-xs mt-3">
                  PDF or image, up to the kiosk limit.
                </p>
              </>
            )}
            <ErrorNote>{error}</ErrorNote>
          </>
        )}

        {step === STEP.UNLOCK && (
          <>
            <StepHeader
              title="Password Protected PDF"
              subtitle="Enter the password to unlock and print"
            />
            <input
              type="password"
              className="input"
              placeholder="PDF password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="btn btn-primary mt-4"
              onClick={handleUnlock}
              disabled={busy || !password}
            >
              {busy ? "Unlocking..." : "Unlock"}
            </button>
            <ErrorNote>{error}</ErrorNote>
          </>
        )}

        {step === STEP.CONFIG && (
          <>
            <StepHeader title="Print Options" />
            <div className="text-sm text-muted mb-1">File</div>
            <div className="font-semibold truncate mb-4">{fileName}</div>

            <Row label="Pages">
              <span className="font-semibold">{pageCount}</span>
            </Row>

            <Row label="Copies">
              <Stepper
                value={copies}
                onChange={(v) => changeConfig({ copies: Math.max(1, v) })}
              />
            </Row>

            <div className="my-3">
              <div className="text-sm text-muted mb-2">Color</div>
              <div className="grid grid-cols-2 gap-2">
                <Choice
                  active={mode === "BW"}
                  onClick={() => changeConfig({ mode: "BW" })}
                >
                  Black &amp; White
                </Choice>
                <Choice
                  active={mode === "COLOR"}
                  onClick={() => changeConfig({ mode: "COLOR" })}
                >
                  Color
                </Choice>
              </div>
            </div>

            {pageCount > 1 && (
              <div className="my-3">
                <div className="text-sm text-muted mb-2">Sides</div>
                <div className="grid grid-cols-2 gap-2">
                  <Choice
                    active={!doubleSided}
                    onClick={() => changeConfig({ doubleSided: false })}
                  >
                    Single Sided
                  </Choice>
                  <Choice
                    active={doubleSided}
                    onClick={() => changeConfig({ doubleSided: true })}
                  >
                    Double Sided
                  </Choice>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line mt-4 pt-4">
              <span className="text-muted">Total Amount</span>
              <span className="text-2xl font-extrabold">
                {priceInfo ? `Rs ${priceInfo.amount}` : "-"}
              </span>
            </div>

            <button
              className="btn btn-primary mt-4"
              onClick={handlePay}
              disabled={busy || !priceInfo}
            >
              Pay &amp; Get Code
            </button>
            <ErrorNote>{error}</ErrorNote>
          </>
        )}

        {step === STEP.PAYING && (
          <div className="text-center py-10">
            <Spinner />
            <p className="mt-4 font-semibold">Processing payment...</p>
            <p className="text-muted text-sm mt-1">Please do not close this page.</p>
          </div>
        )}

        {step === STEP.CODE && (
          <div className="text-center">
            <StepHeader
              title="Payment Successful"
              subtitle="Enter this code on the kiosk to print"
            />
            <div className="bg-bg border border-line rounded-2xl py-6 my-2">
              <div className="text-5xl font-extrabold tracking-[0.3em] pl-[0.3em]">
                {code}
              </div>
            </div>
            <p className="text-muted text-sm mt-3">
              Go to the kiosk, tap Enter Code, and type the number above.
              Collect your printout from the slot.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4 text-muted text-xs">
              <Spinner small />
              <span>Waiting for kiosk to print...</span>
            </div>
          </div>
        )}

        {step === STEP.PRINTED && (
          <div className="text-center py-4">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-3xl"
              style={{ background: "#E7F3EA", color: "#2E9E4F" }}
            >
              ✓
            </div>
            <p className="font-bold text-lg mt-4">Printed Successfully</p>
            <p className="text-muted text-sm mt-2 px-2">
              Your document has been printed. Please collect it from the kiosk slot.
            </p>
            <p className="text-muted text-xs mt-3">Thank you for using ASK Kiosk.</p>
          </div>
        )}

        {step === STEP.REFUNDED && (
          <div className="text-center py-4">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-3xl"
              style={{ background: "#FDEAEA", color: "#D33" }}
            >
              !
            </div>
            <p className="font-bold text-lg mt-4">Print Failed</p>
            <p className="text-muted text-sm mt-2 px-2">
              The printer could not complete your job. Your payment has been
              refunded and will reflect in your account shortly.
            </p>
            <p className="text-muted text-xs mt-3">Sorry for the inconvenience.</p>
          </div>
        )}
      </div>

      <p className="text-muted text-xs mt-6">Need help? Ask at the counter.</p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}

function Stepper({ value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <button className="btn btn-ghost px-4 py-1" onClick={() => onChange(value - 1)}>
        -
      </button>
      <span className="font-semibold w-6 text-center">{value}</span>
      <button className="btn btn-ghost px-4 py-1" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

function Choice({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl py-3 text-sm font-semibold border transition"
      style={{
        borderColor: active ? "#1E73E8" : "#E5E7EB",
        background: active ? "#1E73E8" : "#fff",
        color: active ? "#fff" : "#0F1115",
      }}
    >
      {children}
    </button>
  );
}

function Spinner({ small }) {
  const size = small ? "w-4 h-4 border-2" : "w-8 h-8 border-4";
  return (
    <div
      className={`inline-block ${size} rounded-full border-line`}
      style={{ borderTopColor: "#1E73E8", animation: "spin 0.8s linear infinite" }}
    />
  );
}

function errMsg(err) {
  return (
    (err && err.response && err.response.data && err.response.data.error) ||
    (err && err.message) ||
    "Something went wrong."
  );
}
