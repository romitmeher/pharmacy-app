"use client";

/**
 * SmartPharm — Initial Pharmacy Setup Page
 *
 * One-time onboarding: creates the pharmacy store record and the owner account.
 * Only available when no stores exist in the database (backend enforces this).
 * On success, calls login() to auto-authenticate and redirect to dashboard.
 */

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Package,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Building2,
  User,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

interface SetupPayload {
  store: {
    name: string;
    phone: string;
    address: string;
    gstin: string;
    drug_license_number: string;
  };
  owner: {
    full_name: string;
    email: string;
    username: string;
    password: string;
    phone: string;
  };
}

function InputField({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled,
  required = false,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  required?: boolean;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id} className="form-label">
        {label}
        {required && (
          <span style={{ color: "#ff8080", marginLeft: "3px" }}>*</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        className="form-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ height: "38px", backgroundColor: "#111111", border: "1px solid #252525", color: "#fff" }}
      />
    </div>
  );
}

export default function SetupPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Store fields
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeGstin, setStoreGstin] = useState("");
  const [storeLicense, setStoreLicense] = useState("");

  // Owner fields
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!storeName.trim()) {
      setError("Pharmacy name is required.");
      return;
    }
    if (!ownerName.trim() || !ownerEmail.trim() || !ownerUsername.trim() || !ownerPassword) {
      setError("All owner account fields marked with * are required.");
      return;
    }
    if (ownerPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const payload: SetupPayload = {
          store: {
            name: storeName.trim(),
            phone: storePhone.trim(),
            address: storeAddress.trim(),
            gstin: storeGstin.trim(),
            drug_license_number: storeLicense.trim(),
          },
          owner: {
            full_name: ownerName.trim(),
            email: ownerEmail.trim(),
            username: ownerUsername.trim(),
            password: ownerPassword,
            phone: ownerPhone.trim(),
          },
        };

        const res = await fetch(`${API_BASE}/api/auth/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message || "Setup failed. The pharmacy may already be configured.");
        }

        // Auto-login using the returned token via the standard login flow
        await login(ownerEmail.trim(), ownerPassword);
        setSuccess(true);

        setTimeout(() => {
          router.replace("/");
        }, 1500);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Setup failed. Please try again."
        );
      }
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #1e6ee8 0%, #3b82f6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              boxShadow: "0 0 20px rgba(30,110,232,0.3)",
            }}
          >
            <Package size={22} color="#fff" />
          </div>
          <h1
            style={{
              fontSize: "1.375rem",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.025em",
              marginBottom: "0.5rem",
            }}
          >
            Set Up Your Pharmacy
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#64748b", lineHeight: 1.5 }}>
            This one-time setup creates your pharmacy store record and owner account.
            This page is only available before the first login.
          </p>
        </div>

        {/* Success state */}
        {success && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              backgroundColor: "rgba(125, 255, 149, 0.08)",
              border: "1px solid rgba(125, 255, 149, 0.25)",
              borderRadius: "10px",
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              color: "#7dff95",
              fontSize: "0.875rem",
              fontWeight: 700,
            }}
          >
            <CheckCircle2 size={16} />
            Pharmacy configured! Redirecting to dashboard…
          </div>
        )}

        {/* Error */}
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
        <form onSubmit={handleSetup} noValidate>
          {/* Store Section */}
          <div
            style={{
              backgroundColor: "#111111",
              border: "1px solid #1e293b",
              borderRadius: "10px",
              padding: "1.5rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1.25rem",
                paddingBottom: "0.875rem",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <Building2 size={14} style={{ color: "#1e6ee8" }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Pharmacy Store Details
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <InputField id="store-name" label="Pharmacy Name" required placeholder="Apollo Pharmacy Koramangala" value={storeName} onChange={setStoreName} disabled={isPending || success} />
              </div>
              <InputField id="store-phone" label="Phone Number" placeholder="9876543210" value={storePhone} onChange={setStorePhone} disabled={isPending || success} />
              <InputField id="store-gstin" label="GSTIN" placeholder="29AAABM0000B1ZT" value={storeGstin} onChange={setStoreGstin} disabled={isPending || success} />
              <InputField id="store-license" label="Drug License Number" placeholder="DL-KA-01-000001" value={storeLicense} onChange={setStoreLicense} disabled={isPending || success} />
              <div style={{ gridColumn: "1 / -1" }}>
                <InputField id="store-address" label="Store Address" placeholder="123, 80 Feet Road, Koramangala, Bengaluru" value={storeAddress} onChange={setStoreAddress} disabled={isPending || success} />
              </div>
            </div>
          </div>

          {/* Owner Section */}
          <div
            style={{
              backgroundColor: "#111111",
              border: "1px solid #1e293b",
              borderRadius: "10px",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1.25rem",
                paddingBottom: "0.875rem",
                borderBottom: "1px solid #1e293b",
              }}
            >
              <User size={14} style={{ color: "#1e6ee8" }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Owner Account
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <InputField id="owner-name" label="Full Name" required placeholder="Rajesh Kumar" value={ownerName} onChange={setOwnerName} disabled={isPending || success} />
              <InputField id="owner-phone" label="Mobile Number" placeholder="9876543210" value={ownerPhone} onChange={setOwnerPhone} disabled={isPending || success} />
              <div style={{ gridColumn: "1 / -1" }}>
                <InputField id="owner-email" label="Email Address" required type="email" placeholder="owner@pharmacy.com" value={ownerEmail} onChange={setOwnerEmail} disabled={isPending || success} />
              </div>
              <InputField id="owner-username" label="Username" required placeholder="rajesh_owner" value={ownerUsername} onChange={setOwnerUsername} disabled={isPending || success} />
              <InputField id="owner-password" label="Password (min 8 chars)" required type="password" placeholder="••••••••" value={ownerPassword} onChange={setOwnerPassword} disabled={isPending || success} />
            </div>
          </div>

          {/* Submit */}
          <button
            id="setup-submit-btn"
            type="submit"
            disabled={isPending || success}
            style={{
              height: "42px",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: isPending || success ? "#1a3f7a" : "#1e6ee8",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: isPending || success ? "not-allowed" : "pointer",
              marginBottom: "1.25rem",
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
                Creating pharmacy…
              </>
            ) : (
              "Create Pharmacy & Owner Account"
            )}
          </button>

          <div style={{ textAlign: "center", fontSize: "0.8125rem", color: "#475569" }}>
            <Link
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                color: "#64748b",
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={13} />
              Back to Login
            </Link>
          </div>
        </form>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
