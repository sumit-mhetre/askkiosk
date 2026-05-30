import React, { useEffect, useState } from "react";
import {
  uploadFile,
  uploadFiles,
  unlockJob,
  unlockJobFile,
  configureJob,
  configureMulti,
  createPayment,
  verifyPayment,
  getStatus,
  kioskInfo,
  appendFilesToJob,
  deleteJobFile,
} from "../lib/api.js";
import { openCheckout } from "../lib/razorpay.js";
import {
  Logo,
  Spinner,
  StepHeader,
  ErrorNote,
  PrimaryButton,
  GhostButton,
} from "../components/UI.jsx";

const STEP = {
  LOADING: "LOADING",
  UPLOAD: "UPLOAD",
  UNLOCK: "UNLOCK", // password-protected PDFs
  CONFIG: "CONFIG",
  PAYING: "PAYING",
  CODE: "CODE",
  PRINTED: "PRINTED",
  REFUNDED: "REFUNDED",
};

export default function PhoneFlow() {
  const [step, setStep] = useState(STEP.LOADING);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");

  const kioskId = new URLSearchParams(window.location.search).get("kiosk") || "";
  const [kInfo, setKInfo] = useState(null); // { multi: {enabled,max,mode}, limits: {...} }

  // ---- Persisted code recovery ----
  // After payment we save { kioskId, jobId, code, savedAt } so a refresh or
  // browser-restart can re-show the code instead of stranding the customer.
  // Cleared when the job reaches a final state, or after 1 hour.
  const STORAGE_KEY = "askkiosk:active_code";
  const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  function saveActive(jobId, code) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ kioskId, jobId, code, savedAt: Date.now() })
      );
    } catch (e) {}
  }
  function clearActive() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }
  function loadActive() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.jobId || !data.code) return null;
      // Different kiosk -> different session, ignore.
      if (data.kioskId !== kioskId) return null;
      // Too old -> ignore.
      if (!data.savedAt || Date.now() - data.savedAt > MAX_AGE_MS) {
        clearActive();
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  // Job-level state
  const [jobId, setJobId] = useState(null);
  const [multiMode, setMultiMode] = useState("single"); // single | shared | per_file
  const [files, setFiles] = useState([]); // [{id, name, pageCount, encrypted, ...settings}]
  const [unlockingFileId, setUnlockingFileId] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState("");

  // Shared-mode config (used when multiMode === "shared")
  const [copies, setCopies] = useState(1);
  const [mode, setMode] = useState("BW"); // BW or COLOR
  const [doubleSided, setDoubleSided] = useState(false);

  // Per-file overrides keyed by fileId (used when multiMode === "per_file")
  const [perFile, setPerFile] = useState({}); // { [fileId]: { copies, mode, doubleSided } }

  // Pricing
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalSheets, setTotalSheets] = useState(0);

  // Code
  const [code, setCode] = useState("");

  // Load kiosk info up-front so we know if multi-file is enabled. If the user
  // refreshed after getting a code, restore the code straight away.
  useEffect(() => {
    (async () => {
      try {
        const info = await kioskInfo(kioskId);
        setKInfo(info);
      } catch (e) {
        setError(errMsg(e) || "Could not contact kiosk.");
      }
      const saved = loadActive();
      if (saved) {
        try {
          const s = await getStatus(saved.jobId);
          if (s && s.state === "CODE_ISSUED") {
            setJobId(saved.jobId);
            setCode(saved.code);
            setStep(STEP.CODE);
            return;
          }
          if (s && s.state === "PRINTED_OK") {
            clearActive();
            setStep(STEP.PRINTED);
            return;
          }
          if (s && (s.state === "FAILED_REFUNDED" || s.state === "EXPIRED")) {
            clearActive();
            setStep(STEP.REFUNDED);
            return;
          }
        } catch (e) {
          // ignore and fall through to upload
        }
        // Status unreadable -> abandon the saved entry.
        clearActive();
      }
      setStep(STEP.UPLOAD);
    })();
  }, [kioskId]);

  // Poll job status after code is shown, until printed or failed. Also clears
  // the saved code from localStorage on any terminal state.
  useEffect(() => {
    if (step !== STEP.CODE || !jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await getStatus(jobId);
        if (stop) return;
        if (s.state === "PRINTED_OK") {
          clearActive();
          setStep(STEP.PRINTED);
        } else if (s.state === "FAILED_REFUNDED" || s.state === "EXPIRED") {
          clearActive();
          setStep(STEP.REFUNDED);
        }
      } catch (e) {
        // ignore poll errors
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    const stopAt = setTimeout(() => clearInterval(id), 10 * 60 * 1000);
    return () => {
      stop = true;
      clearInterval(id);
      clearTimeout(stopAt);
    };
  }, [step, jobId]);

  function errMsg(e) {
    return (e && e.response && e.response.data && e.response.data.error) || e.message || "";
  }

  // ----- Upload handlers -----
  async function handleFiles(e) {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;
    setError("");
    setUploadPct(0);
    setBusy(true);
    try {
      if (kInfo?.multi?.enabled && fileList.length >= 1) {
        // Multi-file path (works for 1 or more files; backend creates JobFile rows).
        const cap = kInfo?.multi?.max || 10;
        if (fileList.length > cap) {
          throw new Error(`You can upload up to ${cap} files at a time.`);
        }
        const res = await uploadFiles(fileList, kioskId, (p) => setUploadPct(p));
        setJobId(res.jobId);
        setMultiMode(res.multiMode || "shared");
        const fl = (res.files || []).map((f) => ({ ...f }));
        setFiles(fl);
        // initialize per-file settings to defaults so per_file mode can edit them
        const pf = {};
        fl.forEach((f) => { pf[f.id] = { copies: 1, mode: "BW", doubleSided: false }; });
        setPerFile(pf);
        if (res.needsUnlock) {
          setStep(STEP.UNLOCK);
        } else {
          setStep(STEP.CONFIG);
          await recalcShared(fl, 1, "BW", false); // initial preview
        }
      } else {
        // Single-file legacy path (when multi-file disabled for this kiosk).
        const file = fileList[0];
        const res = await uploadFile(file, kioskId, (p) => setUploadPct(p));
        setJobId(res.jobId);
        setMultiMode("single");
        if (res.encrypted) {
          setFiles([{ id: "single", name: file.name, encrypted: true }]);
          setStep(STEP.UNLOCK);
        } else {
          setFiles([{ id: "single", name: file.name, pageCount: res.pageCount }]);
          // Single page = no duplex
          const eff = res.pageCount > 1 ? doubleSided : false;
          if (eff !== doubleSided) setDoubleSided(false);
          setStep(STEP.CONFIG);
          await recalcSingle(res.jobId, copies, mode, eff);
        }
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function removeFile(fileId) {
    // Removing a file in the new batch: locally only (backend keeps until configure).
    setFiles((f) => f.filter((x) => x.id !== fileId));
    setPerFile((p) => {
      const c = { ...p };
      delete c[fileId];
      return c;
    });
  }

  // Remove a file from the batch on the server, then update local state.
  // If the removed file was the last one, return to UPLOAD step.
  async function handleRemoveFile(fileId) {
    if (multiMode === "single") return; // can't remove the only file in single mode
    setError("");
    setBusy(true);
    try {
      await deleteJobFile(jobId, fileId);
      const next = files.filter((x) => x.id !== fileId);
      removeFile(fileId);
      if (next.length === 0) {
        // empty batch -> restart from UPLOAD
        setJobId(null);
        setFiles([]);
        setPerFile({});
        setMultiMode("single");
        setTotalAmount(0);
        setTotalSheets(0);
        setStep(STEP.UPLOAD);
        return;
      }
      if (multiMode === "per_file") {
        const pfNext = { ...perFile };
        delete pfNext[fileId];
        recalcPerFile(next, pfNext);
      } else {
        recalcShared(next, copies, mode, doubleSided);
      }
    } catch (e) {
      setError(errMsg(e) || "Could not remove file.");
    } finally {
      setBusy(false);
    }
  }

  // Append more files to the existing job from the CONFIG step.
  async function handleAddMoreFiles(e) {
    const fileList = Array.from(e.target.files || []);
    // reset the input so the same file can be reselected later
    e.target.value = "";
    if (!fileList.length || !jobId) return;
    setError("");
    setUploadPct(0);
    setBusy(true);
    try {
      const cap = kInfo?.multi?.max || 10;
      if (files.length + fileList.length > cap) {
        throw new Error(`Maximum ${cap} files per batch.`);
      }
      const res = await appendFilesToJob(jobId, fileList, (p) => setUploadPct(p));
      const newOnes = (res.added || []).map((f) => ({ ...f }));
      const merged = [...files, ...newOnes];
      setFiles(merged);
      // initialize per-file defaults for the new files
      const pfNext = { ...perFile };
      newOnes.forEach((f) => {
        if (!pfNext[f.id]) pfNext[f.id] = { copies: 1, mode: "BW", doubleSided: false };
      });
      setPerFile(pfNext);
      // handle encrypted new files
      if (newOnes.some((f) => f.encrypted)) {
        setStep(STEP.UNLOCK);
      } else {
        if (multiMode === "per_file") recalcPerFile(merged, pfNext);
        else recalcShared(merged, copies, mode, doubleSided);
      }
    } catch (err) {
      setError(errMsg(err) || "Could not add files.");
    } finally {
      setBusy(false);
      setUploadPct(0);
    }
  }

  // ----- Unlock handlers -----
  async function submitUnlock() {
    setError("");
    setBusy(true);
    try {
      if (multiMode === "single") {
        const res = await unlockJob(jobId, unlockPassword);
        setUnlockPassword("");
        setFiles([{ id: "single", name: files[0]?.name || "file", pageCount: res.pageCount, encrypted: false }]);
        const eff = res.pageCount > 1 ? doubleSided : false;
        if (eff !== doubleSided) setDoubleSided(false);
        setStep(STEP.CONFIG);
        await recalcSingle(jobId, copies, mode, eff);
      } else {
        const fileId = unlockingFileId;
        if (!fileId) throw new Error("Pick a file to unlock first.");
        const res = await unlockJobFile(jobId, fileId, unlockPassword);
        setUnlockPassword("");
        setFiles((arr) =>
          arr.map((f) =>
            f.id === fileId
              ? { ...f, pageCount: res.pageCount, encrypted: false }
              : f
          )
        );
        // If no more encrypted files remain, move on to CONFIG
        const stillLocked = files.some((f) => f.encrypted && f.id !== fileId);
        if (!stillLocked) {
          setStep(STEP.CONFIG);
          await recalcShared(
            files.map((f) =>
              f.id === fileId ? { ...f, pageCount: res.pageCount, encrypted: false } : f
            ),
            copies,
            mode,
            doubleSided
          );
        } else {
          setUnlockingFileId(null);
        }
      }
    } catch (err) {
      setError(errMsg(err) || "Wrong password.");
    } finally {
      setBusy(false);
    }
  }

  // ----- Pricing previews -----
  // Live local preview of pricing while editing config (final price is set on configure).
  function previewShared(filesLocal, c, m, d) {
    // sum of (sheetsPerCopy * copies * rate), where sheets = pages or ceil(p/2) for duplex
    const isColor = m === "COLOR";
    let sheets = 0;
    let amount = 0;
    for (const f of filesLocal) {
      const pc = f.pageCount || 0;
      const effDuplex = pc > 1 ? d : false;
      const persheet = effDuplex
        ? Math.ceil(pc / 2)
        : pc;
      sheets += persheet * c;
      let cost;
      if (!effDuplex) {
        cost = pc * (isColor ? 3 : 1);
      } else {
        cost = Math.ceil(pc / 2) * (isColor ? 4.5 : 1.5);
      }
      amount += cost * c;
    }
    return { sheets, amount: Math.round(amount * 100) / 100 };
  }

  function previewPerFile(filesLocal, pfMap) {
    let sheets = 0;
    let amount = 0;
    for (const f of filesLocal) {
      const cfg = pfMap[f.id] || { copies: 1, mode: "BW", doubleSided: false };
      const pc = f.pageCount || 0;
      const effDuplex = pc > 1 ? cfg.doubleSided : false;
      const isColor = cfg.mode === "COLOR";
      const persheet = effDuplex ? Math.ceil(pc / 2) : pc;
      sheets += persheet * cfg.copies;
      let cost;
      if (!effDuplex) cost = pc * (isColor ? 3 : 1);
      else cost = Math.ceil(pc / 2) * (isColor ? 4.5 : 1.5);
      amount += cost * cfg.copies;
    }
    return { sheets, amount: Math.round(amount * 100) / 100 };
  }

  async function recalcSingle(jid, c, m, d) {
    try {
      const res = await configureJob(jid, {
        copies: c,
        mode: m,
        doubleSided: d,
      });
      setTotalAmount(res.amount);
      setTotalSheets(res.sheets || 0);
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function recalcShared(filesLocal, c, m, d) {
    // Local preview only (no server call) for snappy UI; final amount on Pay & Get Code.
    const { sheets, amount } = previewShared(filesLocal, c, m, d);
    setTotalSheets(sheets);
    setTotalAmount(amount);
  }

  function recalcPerFile(filesLocal, pfMap) {
    const { sheets, amount } = previewPerFile(filesLocal, pfMap);
    setTotalSheets(sheets);
    setTotalAmount(amount);
  }

  // ----- Payment -----
  async function payAndGetCode() {
    setError("");
    setBusy(true);
    setStep(STEP.PAYING);
    try {
      let configured;
      if (multiMode === "single") {
        configured = { amount: totalAmount };
      } else if (multiMode === "per_file") {
        configured = await configureMulti(jobId, {
          files: files.map((f) => ({
            id: f.id,
            copies: perFile[f.id]?.copies || 1,
            mode: perFile[f.id]?.mode || "BW",
            doubleSided: !!perFile[f.id]?.doubleSided,
          })),
        });
      } else {
        configured = await configureMulti(jobId, {
          copies,
          mode,
          doubleSided,
        });
      }
      const payment = await createPayment(jobId);
      const result = await openCheckout(payment);
      const ver = await verifyPayment(jobId, result);
      if (ver.code) {
        setCode(ver.code);
        saveActive(jobId, ver.code);
        setStep(STEP.CODE);
      } else {
        throw new Error("Payment ok but no code received.");
      }
    } catch (err) {
      setError(errMsg(err) || "Payment failed.");
      setStep(STEP.CONFIG);
    } finally {
      setBusy(false);
    }
  }

  // ----- Renders -----
  if (step === STEP.LOADING) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
        <Logo />
        <div className="card p-6 mt-6 text-center">
          <Spinner />
          <p className="mt-3 text-muted text-sm">Connecting to the kiosk...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-6 max-w-md mx-auto">
      <Logo />

      <div className="card mt-6 p-5">
        {step === STEP.UPLOAD && (
          <>
            <StepHeader
              title="Print Your Documents"
              subtitle={
                kInfo?.multi?.enabled
                  ? `Upload up to ${kInfo.multi.max} PDF or image files`
                  : "Upload a PDF or image to begin"
              }
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
                  Choose File{kInfo?.multi?.enabled ? "s" : ""}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple={!!kInfo?.multi?.enabled}
                    className="hidden"
                    onChange={handleFiles}
                    disabled={busy}
                  />
                </label>
                <p className="text-center text-muted text-xs mt-3">
                  {kInfo?.multi?.enabled
                    ? `PDF or image, up to ${kInfo.limits?.maxFileSizeMb || 25} MB each.`
                    : "PDF or image, up to the kiosk limit."}
                </p>
              </>
            )}
            <ErrorNote>{error}</ErrorNote>
          </>
        )}

        {step === STEP.UNLOCK && (
          <>
            <StepHeader
              title="Password Protected"
              subtitle="Enter the PDF password to continue"
            />
            {multiMode !== "single" && files.filter((f) => f.encrypted).length > 1 && (
              <div className="mb-3">
                <label className="text-xs font-semibold text-muted">Pick a file to unlock:</label>
                <select
                  className="input mt-1"
                  value={unlockingFileId || ""}
                  onChange={(e) => setUnlockingFileId(e.target.value)}
                >
                  <option value="">Select a file</option>
                  {files
                    .filter((f) => f.encrypted)
                    .map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
              </div>
            )}
            <input
              type="password"
              className="input"
              placeholder="PDF password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
            />
            <PrimaryButton
              onClick={submitUnlock}
              disabled={
                busy ||
                !unlockPassword ||
                (multiMode !== "single" &&
                  files.filter((f) => f.encrypted).length > 1 &&
                  !unlockingFileId)
              }
            >
              {busy ? "Unlocking..." : "Unlock"}
            </PrimaryButton>
            <ErrorNote>{error}</ErrorNote>
          </>
        )}

        {step === STEP.CONFIG && (
          <>
            <StepHeader title="Print Options" />

            {/* file list */}
            <div className="mb-4">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 py-2 border-b border-line text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{f.name}</div>
                    <div className="text-muted text-xs">{f.pageCount} page{f.pageCount === 1 ? "" : "s"}</div>
                  </div>
                  {multiMode !== "single" && (
                    <button
                      className="file-x"
                      title="Remove this file"
                      onClick={() => handleRemoveFile(f.id)}
                      disabled={busy}
                      aria-label="Remove file"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {/* Add more files (only when multi-file is enabled and under cap) */}
              {kInfo?.multi?.enabled && multiMode !== "single" && (
                <div className="mt-3">
                  {files.length < (kInfo?.multi?.max || 10) ? (
                    <label className={"add-more " + (busy ? "is-busy" : "")}>
                      {busy && uploadPct > 0 ? (
                        <span>Uploading... {uploadPct}%</span>
                      ) : (
                        <>
                          <span className="add-more-plus">+</span>
                          <span>Add another file</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        multiple
                        className="hidden"
                        onChange={handleAddMoreFiles}
                        disabled={busy}
                      />
                    </label>
                  ) : (
                    <p className="text-muted text-xs text-center">
                      Maximum {kInfo.multi.max} files reached.
                    </p>
                  )}
                </div>
              )}
            </div>

            {multiMode === "per_file" ? (
              // Per-file: each file gets its own controls
              <div className="space-y-4">
                {files.map((f, i) => {
                  const cfg = perFile[f.id] || { copies: 1, mode: "BW", doubleSided: false };
                  const setCfg = (next) => {
                    const pfNext = { ...perFile, [f.id]: { ...cfg, ...next } };
                    setPerFile(pfNext);
                    recalcPerFile(files, pfNext);
                  };
                  return (
                    <div key={f.id} className="border border-line rounded-xl p-3">
                      <div className="text-xs font-semibold text-muted mb-2 truncate">
                        File {i + 1}: {f.name}
                      </div>
                      <div className="mb-2">
                        <label className="text-xs text-muted">Copies</label>
                        <div className="flex items-center gap-2 mt-1">
                          <GhostButton onClick={() => setCfg({ copies: Math.max(1, cfg.copies - 1) })}>−</GhostButton>
                          <span className="w-10 text-center font-bold">{cfg.copies}</span>
                          <GhostButton onClick={() => setCfg({ copies: cfg.copies + 1 })}>+</GhostButton>
                        </div>
                      </div>
                      <div className="mb-2">
                        <label className="text-xs text-muted">Color</label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button className={"btn " + (cfg.mode === "BW" ? "btn-primary" : "btn-ghost")} onClick={() => setCfg({ mode: "BW" })}>Black & White</button>
                          <button className={"btn " + (cfg.mode === "COLOR" ? "btn-primary" : "btn-ghost")} onClick={() => setCfg({ mode: "COLOR" })}>Color</button>
                        </div>
                      </div>
                      {f.pageCount > 1 && (
                        <div>
                          <label className="text-xs text-muted">Sides</label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <button className={"btn " + (!cfg.doubleSided ? "btn-primary" : "btn-ghost")} onClick={() => setCfg({ doubleSided: false })}>Single-sided</button>
                            <button className={"btn " + (cfg.doubleSided ? "btn-primary" : "btn-ghost")} onClick={() => setCfg({ doubleSided: true })}>Double-sided</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Shared: one set of controls for all files
              <>
                <div className="mb-3">
                  <label className="text-xs text-muted">Copies</label>
                  <div className="flex items-center gap-2 mt-1">
                    <GhostButton onClick={() => { const n = Math.max(1, copies - 1); setCopies(n); if (multiMode === "single") recalcSingle(jobId, n, mode, doubleSided); else recalcShared(files, n, mode, doubleSided); }}>−</GhostButton>
                    <span className="w-10 text-center font-bold">{copies}</span>
                    <GhostButton onClick={() => { const n = copies + 1; setCopies(n); if (multiMode === "single") recalcSingle(jobId, n, mode, doubleSided); else recalcShared(files, n, mode, doubleSided); }}>+</GhostButton>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs text-muted">Color</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button className={"btn " + (mode === "BW" ? "btn-primary" : "btn-ghost")} onClick={() => { setMode("BW"); if (multiMode === "single") recalcSingle(jobId, copies, "BW", doubleSided); else recalcShared(files, copies, "BW", doubleSided); }}>Black & White</button>
                    <button className={"btn " + (mode === "COLOR" ? "btn-primary" : "btn-ghost")} onClick={() => { setMode("COLOR"); if (multiMode === "single") recalcSingle(jobId, copies, "COLOR", doubleSided); else recalcShared(files, copies, "COLOR", doubleSided); }}>Color</button>
                  </div>
                </div>
                {files.some((f) => (f.pageCount || 0) > 1) && (
                  <div className="mb-3">
                    <label className="text-xs text-muted">Sides</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button className={"btn " + (!doubleSided ? "btn-primary" : "btn-ghost")} onClick={() => { setDoubleSided(false); if (multiMode === "single") recalcSingle(jobId, copies, mode, false); else recalcShared(files, copies, mode, false); }}>Single-sided</button>
                      <button className={"btn " + (doubleSided ? "btn-primary" : "btn-ghost")} onClick={() => { setDoubleSided(true); if (multiMode === "single") recalcSingle(jobId, copies, mode, true); else recalcShared(files, copies, mode, true); }}>Double-sided</button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="border-t border-line mt-4 pt-4 flex items-center justify-between">
              <span className="text-muted text-sm">Total ({totalSheets} sheet{totalSheets === 1 ? "" : "s"})</span>
              <span className="font-display font-bold text-xl">Rs {totalAmount}</span>
            </div>
            <PrimaryButton
              onClick={payAndGetCode}
              disabled={busy || totalAmount <= 0 || files.length === 0}
            >
              {busy ? "Please wait..." : "Pay & Get Code"}
            </PrimaryButton>
            <ErrorNote>{error}</ErrorNote>
          </>
        )}

        {step === STEP.PAYING && (
          <div className="text-center py-6">
            <Spinner />
            <p className="mt-3 font-semibold">Opening secure payment...</p>
          </div>
        )}

        {step === STEP.CODE && (
          <>
            <StepHeader
              title="Payment Successful"
              subtitle="Enter this code on the kiosk to print"
            />
            <div className="rounded-xl bg-bg p-4 my-3 text-center">
              <div className="font-display text-4xl font-extrabold tracking-widest">
                {code.split("").join(" ")}
              </div>
            </div>
            <p className="text-muted text-sm text-center">
              Go to the kiosk, tap Enter Code, and type the number above.
              Collect your printout from the slot.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4 text-muted text-sm">
              <Spinner small /> Waiting for kiosk to print...
            </div>
          </>
        )}

        {step === STEP.PRINTED && (
          <div className="text-center py-4">
            <StepHeader title="Printed Successfully" subtitle="Thanks for using ASK Kiosk." />
            <p className="text-muted text-sm">Collect your prints from the kiosk slot.</p>
          </div>
        )}

        {step === STEP.REFUNDED && (
          <div className="text-center py-4">
            <StepHeader title="Print Failed - Refunded" subtitle="Your money has been refunded." />
            <p className="text-muted text-sm">If you do not see it back in a few minutes, contact support.</p>
          </div>
        )}
      </div>

      <p className="text-center text-muted text-xs mt-4">
        Need help? Ask at the counter.
      </p>
    </div>
  );
}
