"use client";
import "./presentation.css";

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
          <span className="login-setup-1">*</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="form-input login-setup-2"
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
      className="login-setup-3"
    >
      <div className="login-setup-4">
        {/* Header */}
        <div className="login-setup-5">
          <div
            className="login-setup-6"
          >
            <Package size={22} color="#fff" />
          </div>
          <h1
            className="login-setup-7"
          >
            Set Up Your Pharmacy
          </h1>
          <p className="login-setup-8">
            This one-time setup creates your pharmacy store record and owner account.
            This page is only available before the first login.
          </p>
        </div>

        {/* Success state */}
        {success && (
          <div
            className="login-setup-9"
          >
            <CheckCircle2 size={16} />
            Pharmacy configured! Redirecting to dashboard…
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="login-setup-10"
          >
            <AlertCircle size={15} className="login-setup-11" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSetup} noValidate>
          {/* Store Section */}
          <div
            className="login-setup-12"
          >
            <div
              className="login-setup-13"
            >
              <Building2 size={14} className="login-setup-14" />
              <span className="login-setup-15">
                Pharmacy Store Details
              </span>
            </div>

            <div className="login-setup-16">
              <div className="login-setup-17">
                <InputField id="store-name" label="Pharmacy Name" required placeholder="Apollo Pharmacy Koramangala" value={storeName} onChange={setStoreName} disabled={isPending || success} />
              </div>
              <InputField id="store-phone" label="Phone Number" placeholder="9876543210" value={storePhone} onChange={setStorePhone} disabled={isPending || success} />
              <InputField id="store-gstin" label="GSTIN" placeholder="29AAABM0000B1ZT" value={storeGstin} onChange={setStoreGstin} disabled={isPending || success} />
              <InputField id="store-license" label="Drug License Number" placeholder="DL-KA-01-000001" value={storeLicense} onChange={setStoreLicense} disabled={isPending || success} />
              <div className="login-setup-18">
                <InputField id="store-address" label="Store Address" placeholder="123, 80 Feet Road, Koramangala, Bengaluru" value={storeAddress} onChange={setStoreAddress} disabled={isPending || success} />
              </div>
            </div>
          </div>

          {/* Owner Section */}
          <div
            className="login-setup-19"
          >
            <div
              className="login-setup-20"
            >
              <User size={14} className="login-setup-21" />
              <span className="login-setup-22">
                Owner Account
              </span>
            </div>

            <div className="login-setup-23">
              <InputField id="owner-name" label="Full Name" required placeholder="Rajesh Kumar" value={ownerName} onChange={setOwnerName} disabled={isPending || success} />
              <InputField id="owner-phone" label="Mobile Number" placeholder="9876543210" value={ownerPhone} onChange={setOwnerPhone} disabled={isPending || success} />
              <div className="login-setup-24">
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
              backgroundColor: isPending || success ? "var(--brand-hover)" : "var(--brand-primary)",
              color: "var(--text-inverse)",
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
                  className="login-setup-25"
                />
                Creating pharmacy…
              </>
            ) : (
              "Create Pharmacy & Owner Account"
            )}
          </button>

          <div className="login-setup-26">
            <Link
              href="/login"
              className="login-setup-27"
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
