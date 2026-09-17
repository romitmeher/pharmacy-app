"use client";

/**
 * SmartPharm — Login Page
 *
 * Full-screen layout. No sidebar. Pharmacy-grade professional design.
 * Split: left branding panel, right credential form.
 */

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Package,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Activity,
  Layers,
} from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    startTransition(async () => {
      try {
        await login(email.trim(), password);
        router.replace("/");
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Authentication failed. Check your credentials."
        );
      }
    });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#0a0a0a" }}>
      {/* ── Left Panel: Branding ─────────────────────────────────────────── */}
      <div
        style={{
          width: "42%",
          minWidth: "380px",
          background:
            "linear-gradient(160deg, #0f1117 0%, #111827 60%, #0d1520 100%)",
          borderRight: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          padding: "3rem 3.5rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background grid */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(30,110,232,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(30,110,232,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            pointerEvents: "none",
          }}
        />

        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", position: "relative" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #1e6ee8 0%, #3b82f6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(30,110,232,0.35)",
            }}
          >
            <Package size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
              SmartPharm
            </div>
            <div style={{ fontSize: "0.6875rem", color: "#64748b", marginTop: "1px" }}>
              Pharmacy Operating System
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }}>
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              color: "#1e6ee8",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: "1.25rem",
            }}
          >
            Vision-First AI + ML Platform
          </div>
          <h1
            style={{
              fontSize: "2.25rem",
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              marginBottom: "1.25rem",
            }}
          >
            Your pharmacy,<br />
            <span style={{ color: "#1e6ee8" }}>intelligently</span><br />
            managed.
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#64748b",
              lineHeight: 1.65,
              maxWidth: "340px",
            }}
          >
            Camera-first medicine recognition, distributor invoice scanning,
            FEFO billing, expiry alerts, and AI-powered reorder intelligence —
            built for Indian physical pharmacies.
          </p>

          {/* Feature pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "2.5rem" }}>
            {[
              { icon: <ShieldCheck size={14} />, label: "Human-in-the-loop verification" },
              { icon: <Activity size={14} />, label: "Real-time batch & expiry tracking" },
              { icon: <Layers size={14} />, label: "Medicine ≠ Batch ≠ Inventory — strict separation" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                }}
              >
                <span style={{ color: "#1e6ee8", display: "inline-flex" }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div style={{ fontSize: "0.6875rem", color: "#334155", position: "relative" }}>
          SmartPharm © {new Date().getFullYear()} • For authorised pharmacy staff only
        </div>
      </div>

      {/* ── Right Panel: Login Form ──────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 2rem",
          backgroundColor: "#0a0a0a",
        }}
      >
        <div style={{ width: "100%", maxWidth: "400px" }}>
          {/* Heading */}
          <div style={{ marginBottom: "2.5rem" }}>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.025em",
                marginBottom: "0.5rem",
              }}
            >
              Sign in to SmartPharm
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748b" }}>
              Enter your staff credentials to access the pharmacy system.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.625rem",
                backgroundColor: "rgba(255, 80, 80, 0.08)",
                border: "1px solid rgba(255, 80, 80, 0.25)",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                marginBottom: "1.5rem",
                fontSize: "0.8125rem",
                color: "#ff8080",
                lineHeight: 1.45,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Email */}
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="pharmacist@yourpharmacy.com"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                style={{
                  height: "42px",
                  backgroundColor: "#111111",
                  border: "1px solid #252525",
                  color: "#fff",
                }}
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  className="form-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending}
                  style={{
                    height: "42px",
                    backgroundColor: "#111111",
                    border: "1px solid #252525",
                    color: "#fff",
                    paddingRight: "2.75rem",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    display: "inline-flex",
                    padding: 0,
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isPending}
              style={{
                height: "42px",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                backgroundColor: isPending ? "#1a3f7a" : "#1e6ee8",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 700,
                cursor: isPending ? "not-allowed" : "pointer",
                transition: "background-color 0.15s ease",
                marginTop: "0.25rem",
              }}
            >
              {isPending ? (
                <>
                  <span
                    style={{
                      width: "14px",
                      height: "14px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.6s linear infinite",
                      display: "inline-block",
                    }}
                  />
                  Authenticating…
                </>
              ) : (
                <>
                  Sign In <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* First-time setup link */}
          <div
            style={{
              marginTop: "2.5rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid #1a1a1a",
              textAlign: "center",
              fontSize: "0.8125rem",
              color: "#475569",
            }}
          >
            New pharmacy installation?{" "}
            <Link
              href="/login/setup"
              style={{
                color: "#1e6ee8",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Set up your pharmacy →
            </Link>
          </div>
        </div>
      </div>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
