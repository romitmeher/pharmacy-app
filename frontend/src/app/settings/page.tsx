"use client";
import "./presentation.css";

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

import { EffectsSetting } from "@/components/ui/EffectsSetting";
import { DensityToggle } from "@/components/ui/DensityToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { clearCachedPack } from "@/lib/offlineQueue";
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
  const { user } = useAuth();
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
    void Promise.resolve().then(() => loadData());
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
    <div className="settings-1">
      {/* Header — 64px height seam matching sidebar */}
      <header className="page-header">
        <div>
          <div className="settings-2">
            <h1 className="page-title">Store & System Settings</h1>
            <span  className="status-badge high settings-3">
              Store #1 Active
            </span>
          </div>
          <p className="page-subtitle">
            Pharmacy Licensing, Drug Authority Credentials, POS Hardware & User Profile
          </p>
        </div>

        <div className="settings-4">
          <ThemeToggle />
          <button
            onClick={loadData}
            disabled={refreshing}
            
            className="btn btn-secondary settings-5"
            title="Refresh settings" aria-label="Refresh"
          >
            <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div  className="page-body settings-6">
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
            <button onClick={() => setStatusMessage(null)}  className="btn-icon settings-7" aria-label="Close dialog">
              <X size={14} />
            </button>
          </div>
        )}

        <section className="card" aria-label="Display preferences"><h2 className="card-title">Display preferences</h2><div className="display-preferences"><DensityToggle /><EffectsSetting /></div></section>
        {/* Tab Navigation */}
        <div className="settings-8">
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
          <div className="settings-10">
            Loading store settings and configurations...
          </div>
        ) : (
          <>
            {/* Tab 1: Pharmacy Store & Statutory Compliance */}
            {activeTab === "store" && (
              <form onSubmit={handleSaveStore} className="settings-11">
                {/* Store Profile Card */}
                <div  className="card settings-12">
                  <div>
                    <div className="settings-13">
                      Physical Pharmacy Identification
                    </div>
                    <div className="settings-14">
                      Appears on customer POS tax invoices, purchase orders, and statutory dispatch notes
                    </div>
                  </div>

                  <div className="settings-15">
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-1">Pharmacy Business Name *</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="e.g. SmartPharm Central Pharmacy"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)} id="settings-field-1"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-2">Official Store Contact Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 080-23456789 or 9876543210"
                        value={storePhone}
                        onChange={(e) => setStorePhone(e.target.value)} id="settings-field-2"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-3">Official Billing Email</label>
                      <input
                        type="email"
                        className="form-input"
                        placeholder="e.g. billing@smartpharm.in"
                        value={storeEmail}
                        onChange={(e) => setStoreEmail(e.target.value)} id="settings-field-3"
                      />
                    </div>

                    <div  className="form-group settings-16">
                      <label className="form-label" htmlFor="settings-field-4">Registered Physical Address</label>
                      <textarea
                        rows={2}
                        className="form-textarea"
                        placeholder="e.g. Plot 42, Health City, Bengaluru, Karnataka 560029"
                        value={storeAddress}
                        onChange={(e) => setStoreAddress(e.target.value)} id="settings-field-4"
                      />
                    </div>
                  </div>
                </div>

                {/* Statutory Regulatory Licenses Card */}
                <div  className="card settings-17">
                  <div className="settings-18">
                    <div>
                      <div className="settings-19">
                        Statutory Indian Pharmacy Licenses & GST
                      </div>
                      <div className="settings-20">
                        Mandated by Drugs & Cosmetics Act 1940 and Central Board of Indirect Taxes (CBIC)
                      </div>
                    </div>
                    <span className="status-badge high">
                      <span className="badge-icon"><ShieldCheck size={12} /></span>
                      <span>Verified Active</span>
                    </span>
                  </div>

                  <div className="settings-21">
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-5">
                        Retail Drug License Numbers (Form 20B & 21B)
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. KA-BLR-20B-129482 / 21B-129483"
                        value={storeDrugLicense}
                        onChange={(e) => setStoreDrugLicense(e.target.value)} id="settings-field-5"
                      />
                      <span className="settings-22">
                        Required to legally sell Schedule C, C1, and H medications in India.
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-6">
                        15-Character Indian GSTIN
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        
                        placeholder="e.g. 29AABCS1429B1Z8"
                        value={storeGstin}
                        onChange={(e) => setStoreGstin(e.target.value.toUpperCase())}
                        className="form-input settings-23" id="settings-field-6"
                      />
                      <span className="settings-24">
                        2 state digits + 10 PAN chars + 1 entity + Z + 1 checksum char.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div className="settings-25">
                  <button type="submit" disabled={storeSaving}  className="btn btn-primary settings-26">
                    <Save size={14} />
                    <span>{storeSaving ? "Saving..." : "Save Store Settings"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: User Account & Pharmacist Credentials */}
            {activeTab === "user" && (
              <form onSubmit={handleSaveUser} className="settings-27">
                <div  className="card settings-28">
                  <div>
                    <div className="settings-29">
                      Registered Pharmacist Profile
                    </div>
                    <div className="settings-30">
                      Pharmacist credentials linked to clinical dispensing sign-offs and regulatory audit trails
                    </div>
                  </div>

                  <div className="settings-31">
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-7">Registered Pharmacist Full Name *</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        value={userFullName}
                        onChange={(e) => setUserFullName(e.target.value)} id="settings-field-7"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-8">Login Username</label>
                      <input
                        type="text"
                        disabled
                        
                        value={userProfile?.username || ""}
                        className="form-input settings-32" id="settings-field-8"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-9">Staff Role & Governance Level</label>
                      <input
                        type="text"
                        disabled
                        
                        value={(userProfile?.role || "owner").toUpperCase()}
                        className="form-input settings-33" id="settings-field-9"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-10">Contact Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 9876543210"
                        value={userPhone}
                        onChange={(e) => setUserPhone(e.target.value)} id="settings-field-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Password Change Card */}
                <div  className="card settings-34">
                  <div>
                    <div className="settings-35">
                      Change Security Password
                    </div>
                    <div className="settings-36">
                      Leave blank if you do not wish to update your login credentials
                    </div>
                  </div>

                  <div className="settings-37">
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-11">New Password (Min. 8 characters)</label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)} id="settings-field-11"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-12">Confirm New Password</label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder="••••••••"
                        value={userConfirmPassword}
                        onChange={(e) => setUserConfirmPassword(e.target.value)} id="settings-field-12"
                      />
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div className="settings-38">
                  <button type="submit" disabled={userSaving}  className="btn btn-primary settings-39">
                    <Save size={14} />
                    <span>{userSaving ? "Saving..." : "Save Account Settings"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: POS Terminal & Billing Preferences */}
            {activeTab === "pos" && (
              <form onSubmit={handleSavePosPreferences} className="settings-40">
                <div  className="card settings-41">
                  <div>
                    <div className="settings-42">
                      Point-of-Sale Terminal & Printer Preferences
                    </div>
                    <div className="settings-43">
                      Settings apply directly to the counter terminal workstation
                    </div>
                  </div>

                  <div className="settings-44">
                    {/* Invoice format */}
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-field-13">Default Invoice Print Format</label>
                      <select
                        className="form-select"
                        value={receiptSize}
                        onChange={(e) => setReceiptSize(e.target.value as "thermal_80mm" | "a4")} id="settings-field-13"
                      >
                        <option value="thermal_80mm">3-inch (80mm) Thermal Roll Receipt</option>
                        <option value="a4">Standard A4 Laser Tax Invoice (Full Sheet)</option>
                      </select>
                      <span className="settings-45">
                        ESC/POS thermal roll is optimized for fast dispensing speed.
                      </span>
                    </div>

                    {/* Auto-print toggle */}
                    <div  className="form-group settings-46">
                      <label className="settings-47">
                        <input
                          type="checkbox"
                          checked={autoPrintReceipt}
                          onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                          className="settings-48"
                        />
                        <span className="settings-49">
                          Auto-Trigger Print Dialog on Bill Settlement
                        </span>
                      </label>
                      <span className="settings-50">
                        Opens print preview immediately when cash/UPI transaction completes.
                      </span>
                    </div>

                    {/* Schedule H warning */}
                    <div  className="form-group settings-51">
                      <label className="settings-52">
                        <input
                          type="checkbox"
                          checked={requireScheduleHDoctor}
                          onChange={(e) => setRequireScheduleHDoctor(e.target.checked)}
                          className="settings-53"
                        />
                        <span className="settings-54">
                          Strict Schedule H Doctor Name Verification
                        </span>
                      </label>
                      <span className="settings-55">
                        Blocks bill completion unless Prescribing Doctor is entered for Schedule H drugs.
                      </span>
                    </div>

                    {/* Barcode Audio Beep */}
                    <div  className="form-group settings-56">
                      <label className="settings-57">
                        <input
                          type="checkbox"
                          checked={barcodeAudioBeep}
                          onChange={(e) => setBarcodeAudioBeep(e.target.checked)}
                          className="settings-58"
                        />
                        <span className="settings-59">
                          Sound Feedback on Barcode Scan
                        </span>
                      </label>
                      <span className="settings-60">
                        Emits a high-frequency audio click when camera or USB barcode reader scans a lot.
                      </span>
                    </div>

                    {/* Tax breakdown */}
                    <div  className="form-group settings-61">
                      <label className="settings-62">
                        <input
                          type="checkbox"
                          checked={showGstBreakdown}
                          onChange={(e) => setShowGstBreakdown(e.target.checked)}
                          className="settings-63"
                        />
                        <span className="settings-64">
                          Itemized CGST / SGST Breakdown on Bill
                        </span>
                      </label>
                      <span className="settings-65">
                        Prints explicit 2.5%, 6%, or 9% state/central GST lines on customer receipt.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="settings-66">
                  <button type="submit"  className="btn btn-primary settings-67">
                    <Save size={14} />
                    <span>Save POS Preferences</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 4: Database & Cloud Sync */}
            {activeTab === "system" && (
              <div className="settings-68">
                <div  className="card settings-69">
                  <div>
                    <div className="settings-70">
                      Cloud Database & Local Sync Engine
                    </div>
                    <div className="settings-71">
                      Aiven Managed MySQL Connection & Local SQLite Offline Storage Health
                    </div>
                  </div>

                  <div className="settings-72">
                    <div className="settings-73">
                      <span className="settings-74">Database Engine</span>
                      <strong className="settings-75">MySQL 8.0 (Aiven Cloud)</strong>
                      <span  className="status-badge high settings-76">
                        <span className="badge-icon"><CheckCircle2 size={10} /></span>
                        <span>Connected</span>
                      </span>
                    </div>

                    <div className="settings-77">
                      <span className="settings-78">Offline Cache Mode</span>
                      <strong className="settings-79">Active Hybrid Engine</strong>
                      <span  className="status-badge info settings-80">
                        <span className="badge-icon"><HardDrive size={10} /></span>
                        <span>IndexedDB Ready</span>
                      </span>
                    </div>

                    <div className="settings-81">
                      <span className="settings-82">Security & Encryption</span>
                      <strong className="settings-83">HMAC-SHA256 JWT</strong>
                      <span  className="status-badge high settings-84">
                        <span className="badge-icon"><ShieldCheck size={10} /></span>
                        <span>Enforced</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* System Maintenance Actions */}
                <div  className="card settings-85">
                  <div>
                    <strong className="settings-86">
                      Clear Local Browser Cache
                    </strong>
                    <div className="settings-87">
                      Refreshes the medicine catalog. Saved bills and your login are preserved.
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      if (confirm("Reset local terminal cache? This will refresh your medicine catalog cache.")) {
                        try {
                          if (user) await clearCachedPack(user);
                          window.location.reload();
                        } catch (error: unknown) {
                          setStatusMessage({ type: "error", text: error instanceof Error ? error.message : "Cannot clear catalog cache." });
                        }
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
