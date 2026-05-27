import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "../components/UI.jsx";
import { kioskClaim } from "../lib/api.js";

const VIEW = { HOME: "home", ENTER: "enter", RESULT: "result" };

export default function KioskScreen() {
  const [view, setView] = useState(VIEW.HOME);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  // The phone web app URL. The QR points to the site root.
  const phoneUrl = window.location.origin + "/";

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
      const res = await kioskClaim(code);
      setResult({ ok: true, message: res.message || "Printing your document." });
    } catch (err) {
      const msg =
        (err && err.response && err.response.data && err.response.data.error) ||
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
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-8 max-w-md mx-auto">
      <div className="card w-full p-6">
        <div className="py-2">
          <Logo />
        </div>
        <p className="text-center text-muted text-sm mb-4">Print Your Documents</p>

        {view === VIEW.HOME && (
          <div className="text-center">
            <div className="bg-bg border border-line rounded-2xl p-6 my-3 flex flex-col items-center">
              <p className="font-semibold mb-3">Scan QR Code to Start</p>
              <div className="bg-white p-3 rounded-xl border border-line">
                <QRCodeSVG value={phoneUrl} size={180} />
              </div>
            </div>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-line" />
              <span className="text-muted text-sm">or</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <button className="btn btn-primary" onClick={() => setView(VIEW.ENTER)}>
              Enter Code
            </button>
          </div>
        )}

        {view === VIEW.ENTER && (
          <div className="text-center">
            <p className="font-bold text-lg mb-1">Enter Code</p>
            <p className="text-muted text-sm mb-4">Type your 6 digit code</p>

            <div className="flex justify-center gap-2 mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-10 h-12 rounded-lg border flex items-center justify-center text-2xl font-bold"
                  style={{ borderColor: code[i] ? "#1E73E8" : "#E5E7EB" }}
                >
                  {code[i] || ""}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} className="key" onClick={() => press(String(n))}>
                  {n}
                </button>
              ))}
              <button className="key" onClick={reset}>
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
              className="btn btn-primary mt-5"
              onClick={submit}
              disabled={busy || code.length < 4}
            >
              {busy ? "Printing..." : "Submit"}
            </button>
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
