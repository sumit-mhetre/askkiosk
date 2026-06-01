import React, { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "../components/UI.jsx";
import { kioskClaimOnly, getStatus } from "../lib/api.js";

const VIEW = { HOME: "home", RESULT: "result", QUEUE: "queue" };

export default function KioskScreen() {
  const [view, setView] = useState(VIEW.HOME);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, shownCode, jobId }
  const [queue, setQueue] = useState(null); // { jobId, position, shownCode }

  // Force navy body bg while the kiosk screen is mounted (covers browsers
  // without :has() support).
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#0B1228";
    return () => { document.body.style.background = prev; };
  }, []);

  // Auto-submit when the customer finishes typing 6 digits. The ref guards
  // against double-fire (React strict mode in dev or a stray re-render). It
  // is reset whenever the code is cleared or shrinks back below 6, so the
  // next retry will fire again.
  const autoFired = useRef(false);
  useEffect(() => {
    if (code.length === 6 && view === VIEW.HOME && !busy && !autoFired.current) {
      autoFired.current = true;
      submit();
    }
    if (code.length < 6) {
      autoFired.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, view, busy]);

  // The phone web app URL. The QR points to the site root.
  // This kiosk's own ID, from the URL (?kiosk=ID). Used so the QR points to
  // this kiosk and the claim is scoped to this kiosk's operator.
  const myKioskId = new URLSearchParams(window.location.search).get("kiosk") || "";
  const phoneUrl =
    window.location.origin + "/print" + (myKioskId ? `?kiosk=${myKioskId}` : "");

  function press(d) {
    setCode((prev) => (prev.length >= 6 ? prev : prev + d));
  }
  function backspace() {
    setCode((prev) => prev.slice(0, -1));
  }

  async function submit() {
    if (code.length !== 6 || busy) return;
    const entered = code; // remember before we clear
    setBusy(true);
    try {
      const claim = await kioskClaimOnly(code, myKioskId);
      if (claim.queued) {
        // Kiosk was busy; we accepted the code but the job is in queue.
        setQueue({
          jobId: claim.jobId,
          position: claim.position || 2,
          shownCode: entered,
        });
        setView(VIEW.QUEUE);
        setCode("");
        return;
      }
      setResult({
        ok: true,
        message: "Sent to printer. Please collect your document from the slot.",
        jobId: claim.jobId,
        shownCode: entered,
      });
      setView(VIEW.RESULT);
      setCode("");
    } catch (err) {
      const msg =
        (err && err.response && err.response.data && err.response.data.error) ||
        err.message ||
        "Could not print. Please try again.";
      setResult({ ok: false, message: msg, shownCode: entered });
      setView(VIEW.RESULT);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCode("");
    setResult(null);
    setQueue(null);
    setView(VIEW.HOME);
  }

  // Auto-return to home from RESULT: faster on success, longer on error.
  useEffect(() => {
    if (view === VIEW.RESULT) {
      const ms = result?.ok ? 2800 : 6000;
      const t = setTimeout(reset, ms);
      return () => clearTimeout(t);
    }
  }, [view, result]);

  // While QUEUED, poll the job status every 3s. When the job moves to PRINTING
  // we show the verified animation; when it finishes we either reset (printed
  // ok) or show the failed-refund message.
  useEffect(() => {
    if (view !== VIEW.QUEUE || !queue?.jobId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const s = await getStatus(queue.jobId);
        if (stopped) return;
        if (s.state === "PRINTING") {
          setResult({
            ok: true,
            message: "Sent to printer. Please collect your document from the slot.",
            jobId: queue.jobId,
            shownCode: queue.shownCode,
          });
          setQueue(null);
          setView(VIEW.RESULT);
        } else if (s.state === "PRINTED_OK") {
          // Edge: agent printed and reported faster than our poll caught
          // PRINTING. Still show the verified animation so the customer sees
          // their job went through.
          setResult({
            ok: true,
            message: "Done. Please collect your document from the slot.",
            jobId: queue.jobId,
            shownCode: queue.shownCode,
          });
          setQueue(null);
          setView(VIEW.RESULT);
        } else if (s.state === "FAILED_REFUNDED" || s.state === "EXPIRED") {
          setResult({
            ok: false,
            message: "Sorry, this print failed. Your payment has been refunded.",
            shownCode: queue.shownCode,
          });
          setQueue(null);
          setView(VIEW.RESULT);
        } else if (s.state === "QUEUED" && typeof s.queuePosition === "number") {
          // Update position as queue drains.
          if (s.queuePosition !== queue.position) {
            setQueue({ ...queue, position: s.queuePosition });
          }
        }
      } catch (e) {
        // ignore transient errors
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    // Hard limit: 15 minutes in the queue screen. If we are still queued after
    // that, give up and reset to home (something is wrong upstream).
    const stopAt = setTimeout(() => {
      stopped = true;
      clearInterval(id);
      reset();
    }, 15 * 60 * 1000);
    return () => {
      stopped = true;
      clearInterval(id);
      clearTimeout(stopAt);
    };
  }, [view, queue]);

  return (
    <div className="kiosk-dark min-h-full flex flex-col items-center justify-center px-4 py-6 max-w-4xl mx-auto">
      <div className="card w-full p-6 kiosk-card">
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
                    className={"k-pin " + (code[i] ? "k-pin-on" : "")}
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
                disabled={busy || code.length !== 6}
              >
                {busy ? "Printing..." : "Submit"}
              </button>
            </div>
          </div>
        )}

        {view === VIEW.QUEUE && queue && (
          <div className="kv-queue" aria-live="polite">
            <div className="kv-digits">
              {(queue.shownCode || "").split("").map((d, i) => (
                <span
                  key={i}
                  className="kv-digit kv-digit-amber"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {d}
                </span>
              ))}
            </div>

            <div className="kv-queue-badge">
              <span className="kv-queue-pos">#{queue.position}</span>
              <span className="kv-queue-label">In queue</span>
            </div>

            <p className="kv-title">Code Accepted</p>
            <p className="kv-sub">
              {queue.position <= 2
                ? "You're next. Your document will print in a moment."
                : `${queue.position - 1} job${queue.position - 1 === 1 ? "" : "s"} ahead of you. Please wait.`}
            </p>

            <div className="kv-spinner-dot">
              <span /><span /><span />
            </div>

            <button className="btn btn-ghost mt-4" onClick={reset}>
              Return to Home
            </button>
          </div>
        )}

        {view === VIEW.RESULT && result?.ok && (
          <div className="kv-stage" aria-live="polite">
            {/* Step 1: digits glow + dissolve (uses lastCode captured before reset) */}
            <div className="kv-digits">
              {(result?.shownCode || "").split("").map((d, i) => (
                <span
                  key={i}
                  className="kv-digit"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Step 2: checkmark card */}
            <div className="kv-check-wrap">
              <div className="kv-glow" />
              <div className="kv-check">
                <svg viewBox="0 0 52 52" className="kv-check-svg">
                  <circle className="kv-check-circle" cx="26" cy="26" r="23" />
                  <path
                    className="kv-check-path"
                    d="M14 27 L23 36 L39 18"
                  />
                </svg>
              </div>
            </div>

            <p className="kv-title">Code Verified</p>
            <p className="kv-sub">Printing your documents...</p>
          </div>
        )}

        {view === VIEW.RESULT && !result?.ok && (
          <div className="kv-stage" aria-live="polite">
            {/* Digits typed by customer - pop in, then turn red, shake, dissolve */}
            <div className="kv-digits kv-digits-fail">
              {(result?.shownCode || "").split("").map((d, i) => (
                <span
                  key={i}
                  className="kv-digit kv-digit-red"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Red X card */}
            <div className="kv-check-wrap kv-x-wrap">
              <div className="kv-glow kv-glow-red" />
              <div className="kv-check kv-x-card">
                <svg viewBox="0 0 52 52" className="kv-check-svg">
                  <circle className="kv-x-circle" cx="26" cy="26" r="23" />
                  <path className="kv-x-line-1" d="M17 17 L35 35" />
                  <path className="kv-x-line-2" d="M35 17 L17 35" />
                </svg>
              </div>
            </div>

            <p className="kv-title kv-title-fail">Code Not Valid</p>
            <p className="kv-sub kv-sub-fail">{result?.message || "Please check the code and try again."}</p>

            <button className="btn btn-ghost mt-4 kv-done-btn" onClick={reset}>
              Done
            </button>
          </div>
        )}
      </div>
      <p className="text-muted text-xs mt-6">ASK Kiosk - Self Service Print Station</p>
    </div>
  );
}