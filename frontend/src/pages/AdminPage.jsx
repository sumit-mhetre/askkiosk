import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  adminLogin,
  listOperators,
  createOperator,
  listKiosks,
  createKiosk,
  getSettings,
  updateSetting,
} from "../lib/api.js";

const APP_BASE = window.location.origin;

export default function AdminPage() {
  const [token, setToken] = useState(
    localStorage.getItem("askkiosk_admin_token") || ""
  );
  if (!token) return <Login onLogin={setToken} />;
  return (
    <Dashboard
      onLogout={() => {
        localStorage.removeItem("askkiosk_admin_token");
        setToken("");
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

/* ---------- login ---------- */

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await adminLogin(email, password);
      localStorage.setItem("askkiosk_admin_token", res.token);
      onLogin(res.token);
    } catch (e) {
      setError(errText(e, "Login failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card fade-up">
        <Brand />
        <div className="brand-line mt-3 mb-6" />
        <h1 className="font-display text-2xl font-bold">Admin sign in</h1>
        <p className="text-muted text-sm mt-1 mb-6">
          Manage operators, kiosks and pricing.
        </p>
        <label className="lbl">Email</label>
        <input
          className="input mb-4"
          placeholder="admin@askkiosk.local"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <label className="lbl">Password</label>
        <input
          className="input"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <p className="text-danger text-sm mt-3">{error}</p>}
        <button className="btn btn-primary mt-6" onClick={submit} disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </div>
      <p className="login-foot">ASK Kiosk - Self Service Print Stations</p>
    </div>
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
            ["settings", "Pricing & Settings"],
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

        {tab === "settings" && (
          <div className="fade-up">
            <SettingsEditor />
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
  function copy(text, id) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch (e) {}
  }
  if (!kiosks.length)
    return <Empty>No kiosks yet. Add one above and its QR appears here.</Empty>;

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

function SettingsEditor() {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const s = await getSettings();
      setSettings(s);
      setDraft(s);
    } catch (e) {
      setMsg(errText(e, "Could not load settings."));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveField(key) {
    setBusy(true);
    setMsg("");
    try {
      let v = draft[key];
      if (!isNaN(parseFloat(v)) && isFinite(v)) v = parseFloat(v);
      const updated = await updateSetting(key, v);
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
      <p className="text-muted text-xs">
        Changes apply to all kiosks. Each value saves individually.
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
