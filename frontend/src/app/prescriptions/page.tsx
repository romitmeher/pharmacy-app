"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clipboard,
  Bookmark,
  CheckCircle,
  AlertTriangle,
  File,
  ShoppingBag,
  User,
  Clock,
  AddCircle,
} from "@duo-icons/react";
import {
  Search,
  X,
  Upload,
  Eye,
  Check,
  ArrowRight,
  Stethoscope,
  Sparkles,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getPrescriptions,
  getPrescriptionDetail,
  savePrescription,
  verifyPrescription,
  scanDoctorPrescription,
  getMedicines,
  StoredPrescriptionRecord,
  SavePrescriptionPayload,
  Medicine,
} from "@/lib/api";

export default function PrescriptionsPage() {
  const router = useRouter();
  const [prescriptions, setPrescriptions] = useState<StoredPrescriptionRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modals
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedRx, setSelectedRx] = useState<StoredPrescriptionRecord | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);

  // New Prescription Form State
  const [patientName, setPatientName] = useState<string>("");
  const [patientAge, setPatientAge] = useState<string>("");
  const [patientGender, setPatientGender] = useState<string>("Male");
  const [doctorName, setDoctorName] = useState<string>("");
  const [doctorRegNo, setDoctorRegNo] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanningAI, setIsScanningAI] = useState<boolean>(false);
  const [scannedItems, setScannedItems] = useState<
    Array<{ extracted_name: string; medicine_id?: number | null; dosage_instructions?: string; quantity_prescribed?: number; is_available?: boolean }>
  >([]);

  // Verification Form State
  const [verifyNotes, setVerifyNotes] = useState<string>("");

  const [isSubmitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPrescriptionsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPrescriptions(
        page,
        20,
        statusFilter || undefined,
        searchQuery.trim() || undefined
      );
      setPrescriptions(res.items || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.pages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load prescriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptionsList();
  }, [page, searchQuery, statusFilter]);

  // AI OCR Prescription Scan
  const handleRunAIScan = async () => {
    if (!rawText.trim() && !selectedFile) {
      setActionError("Please paste prescription text or select an image file to scan.");
      return;
    }

    setIsScanningAI(true);
    setActionError(null);
    try {
      const scanRes = await scanDoctorPrescription(
        rawText.trim() || undefined,
        selectedFile || undefined
      );

      if (scanRes.items && scanRes.items.length > 0) {
        const mapped = scanRes.items.map((item) => ({
          extracted_name: item.detected_brand_or_generic || item.raw_text,
          medicine_id: item.matched_medicine_id,
          dosage_instructions: item.dosage_instructions || undefined,
          quantity_prescribed: item.quantity_to_dispense || 1,
          is_available: item.is_available,
        }));
        setScannedItems(mapped);
        setActionSuccess(`AI recognized ${scanRes.items.length} prescribed items with clinical catalog mapping!`);
      } else {
        setActionError("No clinical medicines could be recognized. Please check input.");
      }
    } catch (err: any) {
      setActionError(err?.message || "AI scanning failed.");
    } finally {
      setIsScanningAI(false);
    }
  };

  // Save new prescription
  const handleSavePrescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      setActionError("Patient Name is required.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const itemsToSave =
          scannedItems.length > 0
            ? scannedItems
            : [
                {
                  extracted_name: "General Consultation",
                  quantity_prescribed: 1,
                  is_available: true,
                },
              ];

        const payload: SavePrescriptionPayload = {
          patient_name: patientName.trim(),
          patient_age: patientAge ? parseInt(patientAge) : undefined,
          patient_gender: patientGender,
          doctor_name: doctorName.trim() || undefined,
          doctor_reg_number: doctorRegNo.trim() || undefined,
          customer_phone: customerPhone.trim() || undefined,
          raw_text: rawText.trim() || undefined,
          items: itemsToSave,
        };

        await savePrescription(payload);
        setActionSuccess("Prescription archived and pending clinical sign-off!");
        setTimeout(() => {
          setShowUploadModal(false);
          resetUploadForm();
          fetchPrescriptionsList();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to save prescription.");
      }
    });
  };

  const resetUploadForm = () => {
    setPatientName("");
    setPatientAge("");
    setPatientGender("Male");
    setDoctorName("");
    setDoctorRegNo("");
    setCustomerPhone("");
    setRawText("");
    setSelectedFile(null);
    setScannedItems([]);
    setActionError(null);
    setActionSuccess(null);
  };

  // Handle Pharmacist Clinical Sign-off
  const handleVerifyPrescription = () => {
    if (!selectedRx) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const updated = await verifyPrescription(selectedRx.id, {
          notes: verifyNotes.trim() || undefined,
        });
        setSelectedRx(updated);
        setActionSuccess(`Prescription #${updated.prescription_number} signed off by Licensed Pharmacist!`);
        setTimeout(() => {
          setShowVerifyModal(false);
          fetchPrescriptionsList();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to sign off prescription.");
      }
    });
  };

  // Open detail view
  const handleViewDetail = async (rx: StoredPrescriptionRecord) => {
    setSelectedRx(rx);
    try {
      const full = await getPrescriptionDetail(rx.id);
      setSelectedRx(full);
    } catch {
      // fallback to initial rx
    }
  };

  // Metrics
  const pendingCount = prescriptions.filter(
    (p) => p.status === "pending_verification"
  ).length;
  const verifiedCount = prescriptions.filter((p) => p.status === "verified").length;
  const dispensedCount = prescriptions.filter((p) => p.status === "dispensed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Prescriptions & Verification</h1>
          <p className="page-subtitle">
            Doctor Rx Digitization • Human-in-the-Loop Clinical Verification • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button
            onClick={() => {
              resetUploadForm();
              setShowUploadModal(true);
            }}
            className="btn btn-primary"
          >
            <AddCircle size={16} />
            <span>Upload / Scan Rx</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Human-in-the-Loop Notice */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.75rem",
            lineHeight: 1.4,
          }}
        >
          <span style={{ color: "var(--brand-primary)", display: "inline-flex" }}>
            <Clipboard size={18} />
          </span>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              Human-in-the-Loop Mandate (PRD Rule 9 & 21):
            </strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              AI drafts prescription readings; all dispensing of Schedule H / H1 formulations legally requires licensed
              pharmacist verification and signature before physical release.
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}
        >
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Total Prescriptions
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Clipboard size={12} /></span>
                <span>Archive</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {totalCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Archived clinical doctor orders
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Pending Review
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Action Needed</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {pendingCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Requires pharmacist clinical sign-off
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Verified & Ready
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Verified</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {verifiedCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Ready for POS billing & dispensing
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Dispensed
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Completed</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {dispensedCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Linked to completed POS sales
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", flex: 1, minWidth: "280px" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: "340px" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                placeholder="Search by patient name, doctor, or Rx #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: "2.25rem" }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select"
              style={{ width: "180px" }}
            >
              <option value="">All Statuses</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="verified">Verified</option>
              <option value="dispensed">Dispensed</option>
            </select>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Showing <strong>{prescriptions.length}</strong> of <strong>{totalCount}</strong> records
          </div>
        </div>

        {/* Prescriptions Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rx Identifier</th>
                <th>Patient Details</th>
                <th>Doctor & Registration</th>
                <th>Prescribed Items</th>
                <th>Clinical Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      Loading clinical prescriptions archive...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--status-low-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      {error}
                    </div>
                    <button onClick={fetchPrescriptionsList} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        <Clipboard size={32} />
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        No prescriptions found
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "360px" }}>
                        {searchQuery
                          ? `No prescriptions match "${searchQuery}".`
                          : "Upload a doctor prescription photo or paste digital text to start verification."}
                      </div>
                      <button
                        onClick={() => {
                          resetUploadForm();
                          setShowUploadModal(true);
                        }}
                        className="btn btn-primary"
                        style={{ marginTop: "0.5rem" }}
                      >
                        <AddCircle size={16} />
                        <span>Upload First Prescription</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                prescriptions.map((rx) => {
                  const isPending = rx.status === "pending_verification";
                  const isVerified = rx.status === "verified";
                  const isDispensed = rx.status === "dispensed";

                  return (
                    <tr key={rx.id}>
                      {/* Rx Identifier & Date */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                            {rx.prescription_number}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                            {rx.created_at ? new Date(rx.created_at).toLocaleDateString("en-IN") : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Patient Details */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                            {rx.patient_name}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                            {rx.patient_age ? `${rx.patient_age}y` : ""} {rx.patient_gender ? `• ${rx.patient_gender}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Doctor & Reg # */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                          <span style={{ color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                            {rx.doctor_name ? `Dr. ${rx.doctor_name}` : "—"}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                            {rx.doctor_reg_number ? `Reg: ${rx.doctor_reg_number}` : "Reg: N/A"}
                          </span>
                        </div>
                      </td>

                      {/* Prescribed Items Count */}
                      <td>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {(rx.items || []).length} items prescribed
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        {isPending && (
                          <span className="status-badge med">
                            <span className="badge-icon"><AlertTriangle size={11} /></span>
                            <span>Pending Review</span>
                          </span>
                        )}
                        {isVerified && (
                          <span className="status-badge high">
                            <span className="badge-icon"><CheckCircle size={11} /></span>
                            <span>Verified Safe</span>
                          </span>
                        )}
                        {isDispensed && (
                          <span className="status-badge high">
                            <span className="badge-icon"><CheckCircle size={11} /></span>
                            <span>Dispensed #{rx.sale_invoice_number || rx.sale_id}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            onClick={() => handleViewDetail(rx)}
                            className="btn btn-secondary"
                            style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            title="View Full Prescription Details"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>

                          {isPending && (
                            <button
                              onClick={() => {
                                setSelectedRx(rx);
                                setVerifyNotes("");
                                setShowVerifyModal(true);
                              }}
                              className="btn btn-primary"
                              style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            >
                              <Check size={13} />
                              <span>Verify</span>
                            </button>
                          )}

                          {isVerified && (
                            <Link
                              href="/pos"
                              className="btn btn-primary"
                              style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            >
                              <ShoppingBag size={13} />
                              <span>Dispense</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          Modal: Upload & AI Scan Doctor Prescription
          ===================================================================== */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <Clipboard size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Capture & Digitize Prescription
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    AI extraction with pharmacist clinical verification
                  </p>
                </div>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePrescription} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <div className="modal-body">
                {actionError && (
                  <div
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(255, 128, 128, 0.12)",
                      border: "1px solid var(--status-low-border)",
                      color: "var(--status-low-text)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div
                    style={{
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "rgba(125, 255, 149, 0.12)",
                      border: "1px solid var(--status-high-border)",
                      color: "var(--status-high-text)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {actionSuccess}
                  </div>
                )}

                {/* Patient Information */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label className="form-label">Patient Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Sharma"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Age</label>
                    <input
                      type="number"
                      placeholder="45"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gender</label>
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value)}
                      className="form-select"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Doctor Details */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label className="form-label">Doctor Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. V. K. Gupta"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Doctor Medical Reg # (MCI/SMC)</label>
                    <input
                      type="text"
                      placeholder="e.g. MCI-29481"
                      value={doctorRegNo}
                      onChange={(e) => setDoctorRegNo(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Input Mode: OCR / Text entry */}
                <div className="form-group">
                  <label className="form-label">Doctor Prescription Content (Paste Text or Upload Photo)</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Rx: Tab Augmentin 625 Duo 1 tab BD x 5 days, Tab Paracetamol 650 TDS..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="form-textarea"
                  />
                </div>

                {/* Image upload selector & AI run button */}
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{ fontSize: "0.75rem" }}
                  />
                  <button
                    type="button"
                    onClick={handleRunAIScan}
                    disabled={isScanningAI}
                    className="btn btn-secondary"
                    style={{ height: "32px", fontSize: "0.75rem" }}
                  >
                    <Sparkles size={14} />
                    <span>{isScanningAI ? "Extracting..." : "Scan with AI OCR"}</span>
                  </button>
                </div>

                {/* Extracted Line Items List */}
                {scannedItems.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <label className="form-label">Extracted Clinical Formulations ({scannedItems.length})</label>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                        maxHeight: "150px",
                        overflowY: "auto",
                      }}
                    >
                      {scannedItems.map((it, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: "0.5rem 0.75rem",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "var(--bg-surface-elevated)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: "0.75rem",
                          }}
                        >
                          <div>
                            <strong style={{ color: "var(--text-primary)" }}>{it.extracted_name}</strong>
                            {it.dosage_instructions && (
                              <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                ({it.dosage_instructions})
                              </span>
                            )}
                          </div>
                          <span className="status-badge high">
                            <span className="badge-icon"><CheckCircle size={10} /></span>
                            <span>Qty: {it.quantity_prescribed}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowUploadModal(false)} className="btn btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Archiving..." : "Archive for Clinical Sign-off"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Pharmacist Clinical Verification Sign-Off
          ===================================================================== */}
      {showVerifyModal && selectedRx && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowVerifyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--status-high-text)" }}>
                  <CheckCircle size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Pharmacist Clinical Verification
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Prescription #{selectedRx.prescription_number} • Schedule H Compliance
                  </p>
                </div>
              </div>
              <button onClick={() => setShowVerifyModal(false)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {actionError && (
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(255, 128, 128, 0.12)",
                    border: "1px solid var(--status-low-border)",
                    color: "var(--status-low-text)",
                    fontSize: "0.75rem",
                  }}
                >
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(125, 255, 149, 0.12)",
                    border: "1px solid var(--status-high-border)",
                    color: "var(--status-high-text)",
                    fontSize: "0.75rem",
                  }}
                >
                  {actionSuccess}
                </div>
              )}

              <div
                style={{
                  padding: "0.875rem",
                  backgroundColor: "var(--bg-surface-elevated)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Patient: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedRx.patient_name}</strong>
                  {selectedRx.patient_age && ` (${selectedRx.patient_age}y ${selectedRx.patient_gender || ""})`}
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Prescribing Doctor: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedRx.doctor_name || "Doctor Unspecified"}</strong>
                  {selectedRx.doctor_reg_number && ` (Reg: ${selectedRx.doctor_reg_number})`}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pharmacist Clinical Notes & Verification Observations</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Dosage verified with patient, no contraindications with current medications."
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="form-textarea"
                />
              </div>

              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(30, 110, 232, 0.08)",
                  border: "1px solid var(--brand-border)",
                  fontSize: "0.6875rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                By signing off, I certify as a Registered Pharmacist under the Pharmacy Act 1948 that this prescription
                has been clinically evaluated and is safe for dispensing.
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowVerifyModal(false)} className="btn btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="button" onClick={handleVerifyPrescription} className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? "Signing Audit..." : "Sign-Off & Authorize Dispensing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Prescription Detail Quick View
          ===================================================================== */}
      {selectedRx && !showVerifyModal && (
        <div className="modal-backdrop" onClick={() => setSelectedRx(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "580px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <Clipboard size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Prescription #{selectedRx.prescription_number}
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Archived on {selectedRx.created_at ? new Date(selectedRx.created_at).toLocaleString("en-IN") : "—"}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedRx(null)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: "1rem" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                  padding: "0.875rem",
                  backgroundColor: "var(--bg-surface-elevated)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                }}
              >
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Patient</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedRx.patient_name} ({selectedRx.patient_age ? `${selectedRx.patient_age}y` : "—"})
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Doctor</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedRx.doctor_name || "—"} ({selectedRx.doctor_reg_number || "N/A"})
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Status</div>
                  <div style={{ marginTop: "4px" }}>
                    <span className={`status-badge ${selectedRx.status === "verified" || selectedRx.status === "dispensed" ? "high" : "med"}`}>
                      <span className="badge-icon"><CheckCircle size={10} /></span>
                      <span>{selectedRx.status.toUpperCase()}</span>
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Verified By</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedRx.verified_by_name || "Pending Pharmacist"}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <label className="form-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                  Prescribed Line Items
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {(selectedRx.items || []).map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--bg-surface-elevated)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.75rem",
                      }}
                    >
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>{it.extracted_name}</strong>
                        {it.dosage_instructions && (
                          <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                            ({it.dosage_instructions})
                          </span>
                        )}
                      </div>
                      <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>
                        Qty: {it.quantity_prescribed}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {selectedRx.status === "verified" && (
                <Link href="/pos" className="btn btn-primary" style={{ height: "34px" }}>
                  <ShoppingBag size={14} />
                  <span>Dispense in POS</span>
                </Link>
              )}
              <button onClick={() => setSelectedRx(null)} className="btn btn-secondary" style={{ height: "34px" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
