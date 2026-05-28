import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../lib/api.js";

function Brand() {
  return (
    <div className="flex items-center gap-2 select-none">
      <span className="font-display font-extrabold tracking-tight text-2xl" style={{ color: "#0F1115" }}>ASK</span>
      <span className="font-display font-light text-2xl" style={{ color: "#6B7280" }}>Kiosk</span>
    </div>
  );
}

export default function LoginPage() {
  const nav = useNavigate();
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
      nav("/admin");
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
    <div className="login-wrap">
      <div className="login-card fade-up">
        <button className="login-back" onClick={() => nav("/")}>&larr; Back to site</button>
        <Brand />
        <div className="brand-line mt-3 mb-6" />
        <h1 className="font-display text-2xl font-bold">Admin sign in</h1>
        <p className="text-muted text-sm mt-1 mb-6">
          Manage operators, kiosks and pricing.
        </p>
        <label className="lbl">Email</label>
        <input className="input mb-4" placeholder="admin@askkiosk.local" value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <label className="lbl">Password</label>
        <input className="input" type="password" placeholder="Your password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        {error && <p className="text-danger text-sm mt-3">{error}</p>}
        <button className="btn btn-primary mt-6" onClick={submit} disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </div>
      <p className="login-foot">ASK Kiosk - Self Service Print Stations</p>
    </div>
  );
}
