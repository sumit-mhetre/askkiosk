import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "../components/UI.jsx";
import { kioskClaimOnly } from "../lib/api.js";

const VIEW = { HOME: "home", RESULT: "result" };

export default function KioskScreen() {
  const [view, setView] = useState(VIEW.HOME);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  // The phone web app URL. The QR points to the site root.
  // This kiosk's own ID, from the URL (?kiosk=ID). Used so the QR points to
  // this kiosk and the claim is scoped to this kiosk's operator.
  const myKioskId = new URLSearchParams(window.location.search).get("kiosk") || "";
  const phoneUrl =
    window.location.origin + "/" + (myKioskId ? `?kiosk=${myKioskId}` : "");

  function press(d) {
    setCode((prev) => (prev.length >= 6 ? prev : prev + d));
  }
  function backspace() {
    setCode((prev) => prev.slice(0, -1));
  }

  async function submit() {
    if (code.length < 4) return;
    setBusy(true);
    try {
      // Mark the job ready to print. The local print agent (Windows/Android)
      // picks it up, prints it, and reports the result back to the backend.
      const claim = await kioskClaimOnly(code, myKioskId);
      setResult({
        ok: true,
        message: "Sent to printer. Please collect your document from the slot.",
        jobId: claim.jobId,
      });
    } catch (err) {
      const msg =
        (err && err.response && err.response.data && err.response.data.error) ||
        err.message ||
        "Could not print. Please try again.";
      setResult({ ok: false, message: msg });
    } finally {
      setBusy(false);
      setView(VIEW.RESULT);
      setCode("");
    }
  }

  function reset() {
    setCode("");
    setResult(null);
    setView(VIEW.HOME);
  }

  // Auto-return to home after showing a result.
  useEffect(() => {
    if (view === VIEW.RESULT) {
      const t = setTimeout(reset, 6000);
      return () => clearTimeout(t);
    }
  }, [view]);

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-6 max-w-4xl mx-auto">
      <div className="card w-full p-6">
        <div className="py-1">
          <Logo />
        </div>
        <p className="text-center text-muted text-sm mb-4">Print Your Documents</p>

        {view === VIEW.HOME && (
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
            {/* Left: QR section */}
            <div className="bg-bg border border-line rounded-2xl p-5 flex flex-col items-center justify-center">
              <p className="font-semibold mb-3 text-sm">Scan QR Code to Start</p>
              <div className="bg-white p-3 rounded-xl border border-line">
                <QRCodeSVG value={phoneUrl} size={180} />
              </div>
              <p className="text-muted text-xs mt-3 text-center">
                Scan with any camera or QR app
              </p>
            </div>

            {/* Vertical OR separator (md+); horizontal separator on mobile */}
            <div className="hidden md:flex flex-col items-center justify-center">
              <div className="w-px flex-1 bg-line" />
              <span className="text-muted text-sm my-2">or</span>
              <div className="w-px flex-1 bg-line" />
            </div>
            <div className="flex md:hidden items-center gap-3">
              <div className="flex-1 h-px bg-line" />
              <span className="text-muted text-sm">or</span>
              <div className="flex-1 h-px bg-line" />
            </div>

            {/* Right: Code entry section */}
            <div className="flex flex-col items-center text-center">
              <p className="font-semibold text-sm">Enter Your Code</p>
              <p className="text-muted text-xs mb-3">Type the 6 digit code from your phone</p>

              <div className="flex justify-center gap-2 mb-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-9 h-11 rounded-lg border flex items-center justify-center text-xl font-bold"
                    style={{ borderColor: code[i] ? "#1E73E8" : "#E5E7EB" }}
                  >
                    {code[i] || ""}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 w-full max-w-[260px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} className="key" onClick={() => press(String(n))}>
                    {n}
                  </button>
                ))}
                <button className="key" onClick={() => setCode("")}>
                  C
                </button>
                <button className="key" onClick={() => press("0")}>
                  0
                </button>
                <button className="key" onClick={backspace}>
                  ⌫
                </button>
              </div>

              <button
                className="btn btn-primary mt-4 w-full max-w-[260px]"
                onClick={submit}
                disabled={busy || code.length < 4}
              >
                {busy ? "Printing..." : "Submit"}
              </button>
            </div>
          </div>
        )}

        {view === VIEW.RESULT && (
          <div className="text-center py-8">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-3xl"
              style={{
                background: result?.ok ? "#E7F3EA" : "#FDEAEA",
                color: result?.ok ? "#2E9E4F" : "#D33",
              }}
            >
              {result?.ok ? "✓" : "!"}
            </div>
            <p className="font-bold text-lg mt-4">
              {result?.ok ? "Success" : "Try Again"}
            </p>
            <p className="text-muted text-sm mt-2 px-2">{result?.message}</p>
            <button className="btn btn-ghost mt-5" onClick={reset}>
              Done
            </button>
          </div>
        )}
      </div>
      <p className="text-muted text-xs mt-6">ASK Kiosk - Self Service Print Station</p>
    </div>
  );
}
