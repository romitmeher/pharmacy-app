"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Save,
  RefreshCw,
  ShieldCheck,
  User,
  Printer,
  Database,
  Key,
  MapPin,
  Phone,
  Mail,
  FileText,
  AlertCircle,
  X,
  Volume2,
  HardDrive,
  Settings,
  Building2,
  CheckCircle2,
  Bookmark,
  ShoppingBag,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getStoreProfile,
  updateStoreProfile,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  StoreProfile,
  UserProfile,
} from "@/lib/api";

type SettingsTab = "store" | "user" | "pos" | "system";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("store");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Store form state
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storeGstin, setStoreGstin] = useState("");
  const [storeDrugLicense, setStoreDrugLicense] = useState("");
  const [storeSaving, setStoreSaving] = useState(false);

  // User form state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userFullName, setUserFullName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userConfirmPassword, setUserConfirmPassword] = useState("");
  const [userSaving, setUserSaving] = useState(false);

  // POS preferences state (local storage backed)
  const [receiptSize, setReceiptSize] = useState<"thermal_80mm" | "a4">("thermal_80mm");
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
  const [requireScheduleHDoctor, setRequireScheduleHDoctor] = useState(true);
  const [barcodeAudioBeep, setBarcodeAudioBeep] = useState(true);
  const [showGstBreakdown, setShowGstBreakdown] = useState(true);

  const [, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [store, user] = await Promise.all([
        getStoreProfile().catch(() => null),
        getCurrentUserProfile().catch(() => null),
      ]);

      startTransition(() => {
        if (store) {
          setStoreName(store.name || "");
          setStoreAddress(store.address || "");
          setStorePhone(store.phone || "");
          setStoreEmail(store.email || "");
          setStoreGstin(store.gstin || "");
          setStoreDrugLicense(store.drug_license_number || "");
        }
        if (user) {
          setUserProfile(user);
          setUserFullName(user.full_name || "");
          setUserPhone(user.phone || "");
        }

        // Load local POS settings
        if (typeof window !== "undefined") {
          const savedReceipt = localStorage.getItem("sp_pos_receipt_size");
          if (savedReceipt === "a4" || savedReceipt === "thermal_80mm") setReceiptSize(savedReceipt);
          const savedAutoPrint = localStorage.getItem("sp_pos_auto_print");
          if (savedAutoPrint !== null) setAutoPrintReceipt(savedAutoPrint === "true");
          const savedScheduleH = localStorage.getItem("sp_pos_require_sch_h");
          if (savedScheduleH !== null) setRequireScheduleHDoctor(savedScheduleH === "true");
          const savedBeep = localStorage.getItem("sp_pos_barcode_beep");
          if (savedBeep !== null) setBarcodeAudioBeep(savedBeep === "true");
          const savedGst = localStorage.getItem("sp_pos_show_gst");
          if (savedGst !== null) setShowGstBreakdown(savedGst === "true");
        }

        setLoading(false);
        setRefreshing(false);
      });
    } catch (err: unknown) {
      console.error("Failed to load settings:", err);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load store settings.",
      });
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save store settings
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      setStatusMessage({ type: "error", text: "Store Name is required." });
      return;
    }

    // Optional 15-char GSTIN check
    const trimmedGstin = storeGstin.trim().toUpperCase();
    if (trimmedGstin && trimmedGstin.length !== 15) {
      setStatusMessage({
        type: "error",
        text: "Indian GSTIN must be exactly 15 alphanumeric characters.",
      });
      return;
    }

    try {
      setStoreSaving(true);
      await updateStoreProfile({
        name: storeName.trim(),
        address: storeAddress.trim() || null,
        phone: storePhone.trim() || null,
        email: storeEmail.trim() || null,
        gstin: trimmedGstin || null,
        drug_license_number: storeDrugLicense.trim() || null,
      });

      setStatusMessage({
        type: "success",
        text: "Pharmacy store profile and statutory drug licenses updated successfully.",
      });
      setStoreSaving(false);
    } catch (err: unknown) {
      setStoreSaving(false);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update store profile.",
      });
    }
  };

  // Save user profile
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim()) {
      setStatusMessage({ type: "error", text: "Full Name is required." });
      return;
    }

    if (userPassword) {
      if (userPassword.length < 8) {
        setStatusMessage({
          type: "error",
          text: "New password must be at least 8 characters.",
        });
        return;
      }
      if (userPassword !== userConfirmPassword) {
        setStatusMessage({
          type: "error",
          text: "New password and confirmation do not match.",
        });
        return;
      }
    }

    try {
      setUserSaving(true);
      const updated = await updateCurrentUserProfile({
        full_name: userFullName.trim(),
        phone: userPhone.trim() || undefined,
        password: userPassword || undefined,
      });

      setUserProfile(updated);
      setUserPassword("");
      setUserConfirmPassword("");
      setStatusMessage({
        type: "success",
        text: "Pharmacist account profile updated successfully.",
      });
      setUserSaving(false);
    } catch (err: unknown) {
      setUserSaving(false);
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update user profile.",
      });
    }
  };

  // Save POS terminal preferences
  const handleSavePosPreferences = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("sp_pos_receipt_size", receiptSize);
      localStorage.setItem("sp_pos_auto_print", String(autoPrintReceipt));
      localStorage.setItem("sp_pos_require_sch_h", String(requireScheduleHDoctor));
      localStorage.setItem("sp_pos_barcode_beep", String(barcodeAudioBeep));
      localStorage.setItem("sp_pos_show_gst", String(showGstBreakdown));
    }
    setStatusMessage({
      type: "success",
      text: "Point of Sale terminal preferences saved locally on this machine.",
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — 64px height seam matching sidebar */}
      <header className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 className="page-title">Store & System Settings</h1>
            <span className="status-badge high" style={{ fontSize: "0.6875rem", padding: "0.1rem 0.45rem" }}>
              Store #1 Active
            </span>
          </div>
          <p className="page-subtitle">
            Pharmacy Licensing, Drug Authority Credentials, POS Hardware & User Profile
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button
            onClick={loadData}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ padding: "0 0.625rem" }}
            title="Refresh settings"
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Status Toast */}
        {statusMessage && (
          <div
            style={{
              padding: "0.75rem 1.25rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: statusMessage.type === "success" ? "var(--status-high-bg)" : "var(--status-low-bg)",
              border: `1px solid ${statusMessage.type === "success" ? "var(--status-high-border)" : "var(--status-low-border)"}`,
              color: statusMessage.type === "success" ? "var(--status-high-text)" : "var(--status-low-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.8125rem",
              fontWeight: 700,
            }}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="btn-icon" style={{ width: "24px", height: "24px" }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.75rem" }}>
          {[
            { id: "store", label: "Pharmacy Profile & Licenses", icon: Building2 },
            { id: "user", label: "User Account & Pharmacist", icon: User },
            { id: "pos", label: "POS Terminal & Hardware", icon: Printer },
            { id: "system", label: "Database & Cloud Sync", icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.8125rem" }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Loading placeholder */}
        {loading ? (
          <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            Loading store settings and configurations...
          </div>
        ) : (
          <>
            {/* Tab 1: Pharmacy Store & Statutory Compliance */}
            {activeTab === "store" && (
              <form onSubmit={handleSaveStore} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {/* Store Profile Card */}
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Physical Pharmacy Identification
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Appears on customer POS tax invoices, purchase orders, and statutory dispatch notes
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">Pharmacy Business Name *</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="e.g. SmartPharm Central Pharmacy"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Official Store Contact Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 080-23456789 or 9876543210"
                        value={storePhone}
                        onChange={(e) => setStorePhone(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Official Billing Email</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="e.g. billing@smartpharm.in"
                        value={storeEmail}
                        onChange={(e) => setStoreEmail(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                      <label className="form-label">Registered Physical Address</label>
                      <textarea
                        rows={2}
                        className="form-textarea"
                        placeholder="e.g. Plot 42, Health City, Bengaluru, Karnataka 560029"
                        value={storeAddress}
                        onChange={(e) => setStoreAddress(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Statutory Regulatory Licenses Card */}
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        Statutory Indian Pharmacy Licenses & GST
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Mandated by Drugs & Cosmetics Act 1940 and Central Board of Indirect Taxes (CBIC)
                      </div>
                    </div>
                    <span className="status-badge high">
                      <span className="badge-icon"><ShieldCheck size={12} /></span>
                      <span>Verified Active</span>
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">
                        Retail Drug License Numbers (Form 20B & 21B)
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. KA-BLR-20B-129482 / 21B-129483"
                        value={storeDrugLicense}
                        onChange={(e) => setStoreDrugLicense(e.target.value)}
                      />
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Required to legally sell Schedule C, C1, and H medications in India.
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        15-Character Indian GSTIN
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        className="form-input"
                        placeholder="e.g. 29AABCS1429B1Z8"
                        value={storeGstin}
                        onChange={(e) => setStoreGstin(e.target.value.toUpperCase())}
                        style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
                      />
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        2 state digits + 10 PAN chars + 1 entity + Z + 1 checksum char.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" disabled={storeSaving} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Save size={14} />
                    <span>{storeSaving ? "Saving..." : "Save Store Settings"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: User Account & Pharmacist Credentials */}
            {activeTab === "user" && (
              <form onSubmit={handleSaveUser} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Registered Pharmacist Profile
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Pharmacist credentials linked to clinical dispensing sign-offs and regulatory audit trails
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">Registered Pharmacist Full Name *</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        value={userFullName}
                        onChange={(e) => setUserFullName(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Login Username</label>
                      <input
                        type="text"
                        disabled
                        className="form-input"
                        value={userProfile?.username || ""}
                        style={{ opacity: 0.6, cursor: "not-allowed" }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Staff Role & Governance Level</label>
                      <input
                        type="text"
                        disabled
                        className="form-input"
                        value={(userProfile?.role || "owner").toUpperCase()}
                        style={{ opacity: 0.6, cursor: "not-allowed", textTransform: "uppercase", fontWeight: 700 }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Contact Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 9876543210"
                        value={userPhone}
                        onChange={(e) => setUserPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Password Change Card */}
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Change Security Password
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Leave blank if you do not wish to update your login credentials
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                    <div className="form-group">
                      <label className="form-label">New Password (Min. 8 characters)</label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Confirm New Password</label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={userConfirmPassword}
                        onChange={(e) => setUserConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" disabled={userSaving} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Save size={14} />
                    <span>{userSaving ? "Saving..." : "Save Account Settings"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: POS Terminal & Billing Preferences */}
            {activeTab === "pos" && (
              <form onSubmit={handleSavePosPreferences} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Point-of-Sale Terminal & Printer Preferences
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Settings apply directly to the counter terminal workstation
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
                    {/* Invoice format */}
                    <div className="form-group">
                      <label className="form-label">Default Invoice Print Format</label>
                      <select
                        className="form-select"
                        value={receiptSize}
                        onChange={(e) => setReceiptSize(e.target.value as "thermal_80mm" | "a4")}
                      >
                        <option value="thermal_80mm">3-inch (80mm) Thermal Roll Receipt</option>
                        <option value="a4">Standard A4 Laser Tax Invoice (Full Sheet)</option>
                      </select>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        ESC/POS thermal roll is optimized for fast dispensing speed.
                      </span>
                    </div>

                    {/* Auto-print toggle */}
                    <div className="form-group" style={{ justifyContent: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={autoPrintReceipt}
                          onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                          style={{ width: "16px", height: "16px" }}
                        />
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 700 }}>
                          Auto-Trigger Print Dialog on Bill Settlement
                        </span>
                      </label>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px", marginLeft: "1.5rem" }}>
                        Opens print preview immediately when cash/UPI transaction completes.
                      </span>
                    </div>

                    {/* Schedule H warning */}
                    <div className="form-group" style={{ justifyContent: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={requireScheduleHDoctor}
                          onChange={(e) => setRequireScheduleHDoctor(e.target.checked)}
                          style={{ width: "16px", height: "16px" }}
                        />
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 700 }}>
                          Strict Schedule H Doctor Name Verification
                        </span>
                      </label>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px", marginLeft: "1.5rem" }}>
                        Blocks bill completion unless Prescribing Doctor is entered for Schedule H drugs.
                      </span>
                    </div>

                    {/* Barcode Audio Beep */}
                    <div className="form-group" style={{ justifyContent: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={barcodeAudioBeep}
                          onChange={(e) => setBarcodeAudioBeep(e.target.checked)}
                          style={{ width: "16px", height: "16px" }}
                        />
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 700 }}>
                          Sound Feedback on Barcode Scan
                        </span>
                      </label>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px", marginLeft: "1.5rem" }}>
                        Emits a high-frequency audio click when camera or USB barcode reader scans a lot.
                      </span>
                    </div>

                    {/* Tax breakdown */}
                    <div className="form-group" style={{ justifyContent: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={showGstBreakdown}
                          onChange={(e) => setShowGstBreakdown(e.target.checked)}
                          style={{ width: "16px", height: "16px" }}
                        />
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 700 }}>
                          Itemized CGST / SGST Breakdown on Bill
                        </span>
                      </label>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px", marginLeft: "1.5rem" }}>
                        Prints explicit 2.5%, 6%, or 9% state/central GST lines on customer receipt.
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Save size={14} />
                    <span>Save POS Preferences</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 4: Database & Cloud Sync */}
            {activeTab === "system" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Cloud Database & Local Sync Engine
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Aiven Managed MySQL Connection & Local SQLite Offline Storage Health
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                    <div style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Database Engine</span>
                      <strong style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>MySQL 8.0 (Aiven Cloud)</strong>
                      <span className="status-badge high" style={{ marginTop: "0.375rem" }}>
                        <span className="badge-icon"><CheckCircle2 size={10} /></span>
                        <span>Connected</span>
                      </span>
                    </div>

                    <div style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Offline Cache Mode</span>
                      <strong style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>Active Hybrid Engine</strong>
                      <span className="status-badge info" style={{ marginTop: "0.375rem" }}>
                        <span className="badge-icon"><HardDrive size={10} /></span>
                        <span>IndexedDB Ready</span>
                      </span>
                    </div>

                    <div style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", display: "block" }}>Security & Encryption</span>
                      <strong style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>HMAC-SHA256 JWT</strong>
                      <span className="status-badge high" style={{ marginTop: "0.375rem" }}>
                        <span className="badge-icon"><ShieldCheck size={10} /></span>
                        <span>Enforced</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* System Maintenance Actions */}
                <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
                      Clear Local Browser Cache
                    </strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Resets local storage cached catalog and forces fresh sync from backend API
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm("Reset local terminal cache? This will refresh your medicine catalog cache.")) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="btn btn-secondary"
                  >
                    Clear Terminal Cache
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
