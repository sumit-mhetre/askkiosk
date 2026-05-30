import React from "react";

export function Logo({ small }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-baseline gap-2">
        <span
          className={small ? "text-2xl font-extrabold" : "text-4xl font-extrabold"}
          style={{ letterSpacing: "-0.02em" }}
        >
          ASK
        </span>
        <span
          className={small ? "text-2xl font-light" : "text-4xl font-light"}
          style={{ letterSpacing: "-0.02em" }}
        >
          Kiosk
        </span>
      </div>
      <div className="brand-line mt-2" />
    </div>
  );
}

export function StepHeader({ title, subtitle }) {
  return (
    <div className="text-center mb-6">
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
      {children}
    </div>
  );
}

export function Spinner({ small }) {
  const size = small ? 18 : 32;
  return (
    <span
      className="inline-block rounded-full animate-spin"
      style={{
        width: size,
        height: size,
        border: "3px solid #E5E7EB",
        borderTopColor: "#1E73E8",
      }}
    />
  );
}

export function PrimaryButton({ children, onClick, disabled }) {
  return (
    <button
      className="btn btn-primary w-full mt-4"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled }) {
  return (
    <button
      className="btn btn-ghost"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
