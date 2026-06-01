import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  listOperators,
  createOperator,
  listKiosks,
  createKiosk,
  getSettings,
  updateSetting,
  adminPaperGet,
  adminPaperAdd,
  adminPaperSet,
  adminPaperConfig,
  adminPaperHistory,
  adminReports,
} from "../lib/api.js";

const APP_BASE = window.location.origin;

export default function AdminPage() {
  const nav = useNavigate();
  const [token] = useState(localStorage.getItem("askkiosk_admin_token") || "");

  useEffect(() => {
    if (!token) nav("/login");
  }, [token, nav]);

  if (!token) return null;
  return (
    <Dashboard
      onLogout={() => {
        localStorage.removeItem("askkiosk_admin_token");
        nav("/login");
      }}
    />
  );
}

/* ---------- shared bits ---------- */

function Brand({ light }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <span
        className="font-display font-extrabold tracking-tight text-2xl"
        style={{ color: light ? "#fff" : "#0F1115" }}
      >
        ASK
      </span>
      <span
        className="font-display font-light text-2xl"
        style={{ color: light ? "#cfe0ff" : "#6B7280" }}
      >
        Kiosk
      </span>
    </div>
  );
}

function errText(e, fallback) {
  return (
    (e && e.response && e.response.data && e.response.data.error) || fallback
  );
}

/* ---------- dashboard ---------- */

function Dashboard({ onLogout }) {
  const [operators, setOperators] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("kiosks");

  async function refresh() {
    try {
      setOperators(await listOperators());
      setKiosks(await listKiosks());
    } catch (e) {
      setError(errText(e, "Could not load data."));
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-full">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <button className="btn-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="page">
        <div className="fade-up">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted mt-1">
            Your print network at a glance.
          </p>
        </div>

        {/* stats */}
        <div className="stats fade-up" style={{ animationDelay: ".05s" }}>
          <Stat label="Operators" value={operators.length} />
          <Stat label="Kiosks" value={kiosks.length} />
          <Stat
            label="Active kiosks"
            value={kiosks.filter((k) => k.isActive).length}
          />
        </div>

        {/* tabs */}
        <div className="tabs fade-up" style={{ animationDelay: ".1s" }}>
          {[
            ["kiosks", "Kiosks & QR"],
            ["operators", "Operators"],
            ["reports", "Reports"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={"tab" + (tab === id ? " tab-on" : "")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="text-danger text-sm mb-4">{error}</p>}

        {tab === "operators" && (
          <div className="fade-up">
            <AddOperator onAdded={refresh} />
            <OperatorList operators={operators} />
          </div>
        )}

        {tab === "kiosks" && (
          <div className="fade-up">
            <AddKiosk operators={operators} onAdded={refresh} />
            <KioskList kiosks={kiosks} />
          </div>
        )}

        {tab === "reports" && (
          <div className="fade-up">
            <ReportsTab />
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-val font-display">{value}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}

function Panel({ title, desc, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="font-display font-bold text-lg">{title}</h2>
        {desc && <p className="text-muted text-sm mt-0.5">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------- operators ---------- */

function AddOperator({ onAdded }) {
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!f.name || !f.email || !f.password) {
      setMsg("Name, email and password are required.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await createOperator(f);
      setF({ name: "", email: "", password: "", phone: "" });
      setMsg("Operator added.");
      onAdded();
    } catch (e) {
      setMsg(errText(e, "Could not add operator."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Add operator" desc="A kiosk owner. Codes work across all of their kiosks.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name">
          <input className="input" placeholder="Sumit Mhetre" value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" placeholder="name@email.com" value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" placeholder="Set a password" value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="Phone (optional)">
          <input className="input" placeholder="+91..." value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
      </div>
      {msg && <p className="text-sm mt-3 text-muted">{msg}</p>}
      <div className="mt-4 max-w-xs">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Adding..." : "Add operator"}
        </button>
      </div>
    </Panel>
  );
}

function OperatorList({ operators }) {
  if (!operators.length)
    return <Empty>No operators yet. Add your first one above.</Empty>;
  return (
    <Panel title="Operators">
      <div className="rows">
        {operators.map((o) => (
          <div key={o.id} className="row">
            <div className="avatar">{(o.name || "?").charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{o.name}</div>
              <div className="text-muted text-sm truncate">{o.email}</div>
            </div>
            <span className="pill">{o.kioskCount} kiosk{o.kioskCount === 1 ? "" : "s"}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- kiosks ---------- */

function AddKiosk({ operators, onAdded }) {
  const [f, setF] = useState({ operatorId: "", name: "", location: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!f.operatorId || !f.name) {
      setMsg("Operator and kiosk name are required.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await createKiosk(f);
      setF({ operatorId: f.operatorId, name: "", location: "" });
      setMsg("Kiosk added.");
      onAdded();
    } catch (e) {
      setMsg(errText(e, "Could not add kiosk."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Add kiosk" desc="Each kiosk gets its own QR and screen link.">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Operator">
          <select className="input" value={f.operatorId}
            onChange={(e) => setF({ ...f, operatorId: e.target.value })}>
            <option value="">Select operator</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Kiosk name">
          <input className="input" placeholder="Kiosk 1" value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Location (optional)">
          <input className="input" placeholder="Near KCP" value={f.location}
            onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
      </div>
      {msg && <p className="text-sm mt-3 text-muted">{msg}</p>}
      <div className="mt-4 max-w-xs">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Adding..." : "Add kiosk"}
        </button>
      </div>
    </Panel>
  );
}

function KioskList({ kiosks }) {
  const [copied, setCopied] = useState("");
  const [editing, setEditing] = useState(null); // kiosk object being edited
  function copy(text, id) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch (e) {}
  }
  if (!kiosks.length)
    return <Empty>No kiosks yet. Add one above and its QR appears here.</Empty>;

  if (editing) {
    return (
      <Panel
        title={`Settings: ${editing.name}`}
        desc={`These settings apply only to this kiosk. Operator: ${editing.operatorName || "-"}`}
      >
        <button className="mini-btn mb-4" style={{ maxWidth: 220 }} onClick={() => setEditing(null)}>
          &larr; Back to all kiosks
        </button>
        <SettingsEditor kioskId={editing.id} />
        <PaperPanel kioskId={editing.id} kioskName={editing.name} />
      </Panel>
    );
  }

  return (
    <Panel title="Kiosks & QR codes" desc="Print each QR for its kiosk. Open the screen link on that kiosk's tablet.">
      <div className="kiosk-grid">
        {kiosks.map((k) => {
          const customerUrl = `${APP_BASE}/print?kiosk=${k.id}`;
          const screenUrl = `${APP_BASE}/kiosk?kiosk=${k.id}`;
          return (
            <div key={k.id} className="kiosk-card">
              <div className="kiosk-card-head">
                <div>
                  <div className="font-display font-bold">{k.name}</div>
                  <div className="text-muted text-xs">{k.location || "No location set"}</div>
                </div>
                <span className={"dot " + (k.isActive ? "dot-on" : "dot-off")} title={k.isActive ? "Active" : "Inactive"} />
              </div>

              <div className="qr-box">
                <QRCodeSVG value={customerUrl} size={150} fgColor="#0F1115" />
              </div>

              <div className="text-muted text-xs text-center mt-2">
                Operator: <span className="text-ink">{k.operatorName || "-"}</span>
              </div>

              <div className="kiosk-actions">
                <button className="mini-btn" onClick={() => copy(customerUrl, k.id + "c")}>
                  {copied === k.id + "c" ? "Copied" : "Copy customer link"}
                </button>
                <a className="mini-btn" href={screenUrl} target="_blank" rel="noreferrer">
                  Open kiosk screen
                </a>
                <button className="mini-btn mini-btn-primary" onClick={() => setEditing(k)}>
                  Settings
                </button>
              </div>

              <details className="kiosk-meta">
                <summary>Details</summary>
                <div className="text-muted text-xs mt-2 break-all">
                  <div className="mb-1"><b>Customer:</b> {customerUrl}</div>
                  <div className="mb-1"><b>Screen:</b> {screenUrl}</div>
                  <div><b>Kiosk ID:</b> {k.id}</div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------- settings ---------- */

const PRICE_FIELDS = [
  ["rate_bw_single", "B&W per page", "Rs"],
  ["rate_color_single", "Color per page", "Rs"],
  ["rate_bw_double_sheet", "B&W double-sided per sheet", "Rs"],
  ["rate_color_double_sheet", "Color double-sided per sheet", "Rs"],
];
const LIMIT_FIELDS = [
  ["max_sheets_per_job", "Max sheets per job", ""],
  ["max_file_size_mb", "Max file size (MB)", ""],
  ["max_copies", "Max copies", ""],
  ["code_expiry_minutes", "Code expiry (minutes)", ""],
];

function SettingsEditor({ kioskId }) {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const s = await getSettings(kioskId);
      setSettings(s);
      setDraft(s);
    } catch (e) {
      setMsg(errText(e, "Could not load settings."));
    }
  }
  useEffect(() => {
    load();
  }, [kioskId]);

  async function saveField(key) {
    setBusy(true);
    setMsg("");
    try {
      let v = draft[key];
      if (!isNaN(parseFloat(v)) && isFinite(v)) v = parseFloat(v);
      const updated = await updateSetting(key, v, kioskId);
      setSettings(updated);
      setMsg("Saved " + key.replace(/_/g, " ") + ".");
    } catch (e) {
      setMsg(errText(e, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <Empty>Loading settings...</Empty>;

  const Group = ({ title, fields }) => (
    <Panel title={title}>
      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map(([key, label, prefix]) => (
          <div key={key} className="set-row">
            <label className="lbl">{label}</label>
            <div className="flex gap-2">
              <div className="input-prefix">
                {prefix && <span className="prefix">{prefix}</span>}
                <input
                  className="input"
                  style={prefix ? { paddingLeft: 34 } : {}}
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </div>
              <button
                className="save-btn"
                disabled={busy || String(draft[key]) === String(settings[key])}
                onClick={() => saveField(key)}
              >
                Save
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  return (
    <>
      {msg && <div className="toast">{msg}</div>}
      <Group title="Pricing" fields={PRICE_FIELDS} />
      <Group title="Limits & codes" fields={LIMIT_FIELDS} />

      <Panel title="Multiple files">
        <div className="grid sm:grid-cols-2 gap-3">
          {/* enabled toggle */}
          <div className="set-row">
            <label className="lbl">Allow multiple files</label>
            <div className="flex gap-2 items-center">
              <select
                className="input"
                value={String(!!draft.multi_file_enabled)}
                onChange={(e) =>
                  setDraft({ ...draft, multi_file_enabled: e.target.value === "true" })
                }
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
              <button
                className="save-btn"
                disabled={
                  busy ||
                  String(!!draft.multi_file_enabled) ===
                    String(!!settings.multi_file_enabled)
                }
                onClick={() => saveField("multi_file_enabled")}
              >
                Save
              </button>
            </div>
          </div>

          {/* max files */}
          <div className="set-row">
            <label className="lbl">Max files per batch</label>
            <div className="flex gap-2">
              <div className="input-prefix">
                <input
                  className="input"
                  value={draft.multi_file_max ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, multi_file_max: e.target.value })
                  }
                />
              </div>
              <button
                className="save-btn"
                disabled={
                  busy ||
                  String(draft.multi_file_max) === String(settings.multi_file_max)
                }
                onClick={() => saveField("multi_file_max")}
              >
                Save
              </button>
            </div>
          </div>

          {/* mode picker */}
          <div className="set-row sm:col-span-2">
            <label className="lbl">Mode</label>
            <div className="flex gap-2 items-center">
              <select
                className="input"
                value={draft.multi_file_mode || "shared"}
                onChange={(e) =>
                  setDraft({ ...draft, multi_file_mode: e.target.value })
                }
              >
                <option value="shared">Shared (one setting for all files)</option>
                <option value="per_file">Per file (each file has its own settings)</option>
              </select>
              <button
                className="save-btn"
                disabled={
                  busy ||
                  String(draft.multi_file_mode) === String(settings.multi_file_mode)
                }
                onClick={() => saveField("multi_file_mode")}
              >
                Save
              </button>
            </div>
            <p className="text-muted text-xs mt-2">
              In Shared mode, the customer picks one color/copies/sides config for the whole batch. In Per-file mode, each file has its own settings.
            </p>
          </div>
        </div>
      </Panel>

      <p className="text-muted text-xs">
        These settings apply only to this kiosk. Each value saves individually.
      </p>
    </>
  );
}

/* ---------- tiny helpers ---------- */

function Field({ label, children }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

function PaperPanel({ kioskId, kioskName }) {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [addQty, setAddQty] = useState("");
  const [setQty, setSetQty] = useState("");
  const [config, setConfig] = useState({ enabled: false, max: 250, lowThreshold: 20 });

  async function refresh() {
    try {
      const s = await adminPaperGet(kioskId);
      setStatus(s);
      setConfig({
        enabled: !!s.enabled,
        max: s.max,
        lowThreshold: s.lowThreshold,
      });
      const h = await adminPaperHistory(kioskId, 15);
      setLogs(h.logs || []);
    } catch (e) {
      setMsg(e?.response?.data?.error || e.message);
    }
  }
  useEffect(() => { refresh(); }, [kioskId]);

  function toast(t) {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  }

  async function saveConfig() {
    setBusy(true);
    try {
      const next = await adminPaperConfig(kioskId, config);
      setStatus(next);
      toast("Saved.");
    } catch (e) {
      toast(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doAdd() {
    const n = parseInt(addQty, 10);
    if (!Number.isFinite(n) || n <= 0) return toast("Enter a positive number.");
    setBusy(true);
    try {
      const next = await adminPaperAdd(kioskId, n);
      setStatus(next);
      setAddQty("");
      toast(`Added ${n} sheets.`);
      refresh();
    } catch (e) {
      toast(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doSet() {
    const n = parseInt(setQty, 10);
    if (!Number.isFinite(n) || n < 0) return toast("Enter zero or a positive number.");
    setBusy(true);
    try {
      const next = await adminPaperSet(kioskId, n);
      setStatus(next);
      setSetQty("");
      toast(`Count set to ${n}.`);
      refresh();
    } catch (e) {
      toast(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Paper tracking" desc="Estimated paper count for this kiosk. Operator-managed; not a sensor reading.">
      {msg && <div className="toast">{msg}</div>}

      {/* Enable toggle */}
      <div className="set-row" style={{ marginBottom: 14 }}>
        <label className="lbl">Tracking</label>
        <div className="flex gap-2 items-center">
          <select
            className="input"
            value={String(!!config.enabled)}
            onChange={(e) => setConfig({ ...config, enabled: e.target.value === "true" })}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
          <button className="save-btn" disabled={busy} onClick={saveConfig}>Save</button>
        </div>
      </div>

      {config.enabled && (
        <>
          <div className="paper-panel">
            <div className="paper-status-row">
              <div>
                <div className="text-muted text-xs" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Approximately
                </div>
                <div
                  className={
                    "paper-count-big " +
                    (!status ? "" : status.isEmpty ? "empty" : status.isLow ? "low" : "")
                  }
                >
                  {status ? status.count : "..."} sheets
                </div>
                {status && (
                  <div className="text-muted text-xs">
                    of {status.max} max · low at {status.lowThreshold}
                  </div>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-2">
              {/* Add */}
              <div className="set-row">
                <label className="lbl">Add sheets (after refill)</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="e.g. 250"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                  />
                  <button className="save-btn" disabled={busy || !addQty} onClick={doAdd}>Add</button>
                </div>
              </div>

              {/* Set exact */}
              <div className="set-row">
                <label className="lbl">Set exact count</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="exact number"
                    value={setQty}
                    onChange={(e) => setSetQty(e.target.value)}
                  />
                  <button className="save-btn" disabled={busy || setQty === ""} onClick={doSet}>Set</button>
                </div>
              </div>
            </div>

            {/* Config */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="set-row">
                <label className="lbl">Max capacity (tray)</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={config.max}
                    onChange={(e) => setConfig({ ...config, max: parseInt(e.target.value, 10) || 0 })}
                  />
                  <button className="save-btn" disabled={busy} onClick={saveConfig}>Save</button>
                </div>
              </div>
              <div className="set-row">
                <label className="lbl">Low-warning threshold</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={config.lowThreshold}
                    onChange={(e) => setConfig({ ...config, lowThreshold: parseInt(e.target.value, 10) || 0 })}
                  />
                  <button className="save-btn" disabled={busy} onClick={saveConfig}>Save</button>
                </div>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="paper-panel">
            <div className="text-muted text-xs" style={{ textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
              Recent activity
            </div>
            <div className="history-list">
              {logs.length === 0 ? (
                <p className="text-muted text-sm">No paper activity yet.</p>
              ) : (
                logs.map((l) => (
                  <div className="history-row" key={l.id}>
                    <div>
                      <span className="history-kind">{l.kind}</span>
                      {l.note ? <span className="text-muted"> · {l.note}</span> : null}
                      <div className="history-time">
                        {new Date(l.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <span className={l.delta >= 0 ? "history-delta-pos" : "history-delta-neg"}>
                        {l.delta >= 0 ? "+" : ""}{l.delta}
                      </span>
                      <div className="text-muted text-xs text-right">→ {l.newCount}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function ReportsTab() {
  const [range, setRange] = useState("today");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await adminReports(range);
      setData(d);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [range]);

  return (
    <Panel title="Reports" desc="Jobs, pages, and revenue across your kiosks.">
      <div className="report-range-pills">
        {[
          ["today", "Today"],
          ["week", "Past 7 days"],
          ["month", "Past 30 days"],
          ["all", "All time"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={"report-range-pill " + (range === id ? "active" : "")}
            onClick={() => setRange(id)}
          >
            {label}
          </button>
        ))}
        <button className="report-range-pill" onClick={load}>Refresh</button>
      </div>

      {error && <p className="text-danger text-sm mb-4">{error}</p>}
      {loading && <p className="text-muted text-sm">Loading...</p>}

      {data && (
        <>
          {/* Totals */}
          <div className="paper-panel">
            <div className="text-muted text-xs" style={{ textTransform:"uppercase", letterSpacing:".04em", marginBottom:6 }}>
              Across all kiosks
            </div>
            <div className="reports-grid">
              <ReportStat label="Jobs Printed" value={data.total.printedJobs} />
              <ReportStat label="Revenue" value={`Rs ${data.total.totalRevenue}`} />
              <ReportStat label="Pages" value={data.total.totalPages} />
              <ReportStat label="Sheets" value={data.total.totalSheets} />
              <ReportStat label="Color jobs" value={data.total.colorJobs} />
              <ReportStat label="B&W jobs" value={data.total.bwJobs} />
              <ReportStat label="Duplex jobs" value={data.total.duplexJobs} />
              <ReportStat label="Simplex jobs" value={data.total.simplexJobs} />
              <ReportStat label="Failed / refunded" value={data.total.failedCount} />
              <ReportStat label="Expired" value={data.total.expiredCount} />
            </div>
          </div>

          {/* Per kiosk */}
          {data.rows.map((r) => (
            <div className="paper-panel" key={r.kioskId}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <div className="font-display font-bold">{r.kioskName}</div>
                <div className="text-muted text-xs">{r.location || ""}</div>
              </div>
              <div className="reports-grid">
                <ReportStat label="Jobs Printed" value={r.printedJobs} />
                <ReportStat label="Revenue" value={`Rs ${r.totalRevenue}`} />
                <ReportStat label="Pages" value={r.totalPages} />
                <ReportStat label="Sheets" value={r.totalSheets} />
                <ReportStat label="Color jobs" value={r.colorJobs} />
                <ReportStat label="B&W jobs" value={r.bwJobs} />
                <ReportStat label="Failed" value={r.failedCount} />
                <ReportStat label="In flight" value={r.inFlightCount} />
              </div>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}

function ReportStat({ label, value }) {
  return (
    <div className="report-stat">
      <div className="report-stat-label">{label}</div>
      <div className="report-stat-value">{value}</div>
    </div>
  );
}
