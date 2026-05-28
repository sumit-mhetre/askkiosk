import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "../components/UI.jsx";
import {
  adminLogin,
  listOperators,
  createOperator,
  listKiosks,
  createKiosk,
} from "../lib/api.js";

// The base URL the phone app is served from (for building kiosk QR links).
const APP_BASE = window.location.origin;

export default function AdminPage() {
  const [token, setToken] = useState(
    localStorage.getItem("askkiosk_admin_token") || ""
  );

  if (!token) return <Login onLogin={setToken} />;
  return <Dashboard onLogout={() => {
    localStorage.removeItem("askkiosk_admin_token");
    setToken("");
  }} />;
}

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
      setError(
        (e && e.response && e.response.data && e.response.data.error) ||
          "Login failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 max-w-sm mx-auto">
      <Logo />
      <div className="card w-full p-6 mt-6">
        <h1 className="text-xl font-bold text-center mb-1">Admin Login</h1>
        <p className="text-muted text-sm text-center mb-4">Super admin access</p>
        <input
          className="input mb-3"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        <button className="btn btn-primary mt-4" onClick={submit} disabled={busy}>
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [operators, setOperators] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [selectedOp, setSelectedOp] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const ops = await listOperators();
      setOperators(ops);
      const ks = await listKiosks();
      setKiosks(ks);
    } catch (e) {
      setError(
        (e && e.response && e.response.data && e.response.data.error) ||
          "Could not load data."
      );
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-full px-4 py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Logo small />
        <button className="btn btn-ghost" onClick={onLogout}>
          Log out
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <AddOperator
        onAdded={() => refresh()}
      />

      <OperatorList operators={operators} />

      <AddKiosk operators={operators} onAdded={() => refresh()} />

      <KioskList kiosks={kiosks} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card p-5 mb-5">
      <h2 className="font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

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
      setMsg(
        (e && e.response && e.response.data && e.response.data.error) ||
          "Could not add operator."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Add Operator">
      <div className="grid sm:grid-cols-2 gap-2">
        <input className="input" placeholder="Name" value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="Email" value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className="input" type="password" placeholder="Password" value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })} />
        <input className="input" placeholder="Phone (optional)" value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
      {msg && <p className="text-sm mt-2 text-muted">{msg}</p>}
      <button className="btn btn-primary mt-3" onClick={submit} disabled={busy}>
        {busy ? "Adding..." : "Add Operator"}
      </button>
    </Section>
  );
}

function OperatorList({ operators }) {
  if (!operators.length) return null;
  return (
    <Section title="Operators">
      <div className="divide-y divide-line">
        {operators.map((o) => (
          <div key={o.id} className="py-2 flex items-center justify-between">
            <div>
              <div className="font-semibold">{o.name}</div>
              <div className="text-muted text-sm">{o.email}</div>
            </div>
            <div className="text-sm text-muted">{o.kioskCount} kiosk(s)</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

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
      setMsg(
        (e && e.response && e.response.data && e.response.data.error) ||
          "Could not add kiosk."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Add Kiosk">
      <div className="grid sm:grid-cols-3 gap-2">
        <select className="input" value={f.operatorId}
          onChange={(e) => setF({ ...f, operatorId: e.target.value })}>
          <option value="">Select operator</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <input className="input" placeholder="Kiosk name" value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="Location (optional)" value={f.location}
          onChange={(e) => setF({ ...f, location: e.target.value })} />
      </div>
      {msg && <p className="text-sm mt-2 text-muted">{msg}</p>}
      <button className="btn btn-primary mt-3" onClick={submit} disabled={busy}>
        {busy ? "Adding..." : "Add Kiosk"}
      </button>
    </Section>
  );
}

function KioskList({ kiosks }) {
  if (!kiosks.length) return null;
  return (
    <Section title="Kiosks and QR Codes">
      <div className="grid sm:grid-cols-2 gap-4">
        {kiosks.map((k) => {
          const url = `${APP_BASE}/?kiosk=${k.id}`;
          return (
            <div key={k.id} className="border border-line rounded-xl p-4 text-center">
              <div className="font-semibold">{k.name}</div>
              <div className="text-muted text-sm mb-1">{k.location || ""}</div>
              <div className="text-muted text-xs mb-3">Operator: {k.operatorName}</div>
              <div className="bg-white inline-block p-2 rounded-lg border border-line">
                <QRCodeSVG value={url} size={150} />
              </div>
              <div className="text-muted text-xs mt-2 break-all">{url}</div>
              <div className="text-muted text-xs mt-1">Kiosk ID: {k.id}</div>
            </div>
          );
        })}
      </div>
      <p className="text-muted text-xs mt-3">
        Print each QR and place it on the matching kiosk. The Kiosk ID goes into
        that kiosk's tablet app settings so it prints only its operator's jobs.
      </p>
    </Section>
  );
}
