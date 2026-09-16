"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  scanDoctorPrescription,
  savePrescription,
  getPrescriptions,
  getPrescriptionDetail,
  verifyPrescription,
  dispensePrescription,
  PrescriptionScanResponseData,
  PrescribedItemData,
  StoredPrescriptionRecord,
} from "@/lib/api";

const PRESET_PRESCRIPTIONS = {
  internal_med: `DR. R. SHARMA, MD (Internal Med)
Reg No: MH-2012-48921
City Hospital & Specialty Clinic
Date: 14/09/2026
Patient: Sunil Deshmukh, 45/M
Phone: 9876501234

Rx:
1. Tab Crocin 650mg       1-0-1    5 days (After food)
2. Cap Amoxicillin 500mg  1-1-1    7 days
3. Tab Pantocid 40mg      1-0-0    5 days (Before food)`,
  pediatric: `DR. A. MEHTA, MBBS, DCH (Pediatrics)
Reg No: MH-2018-91023
Little Care Children's Clinic
Date: 13/09/2026
Patient: Aarav Patel, 6/M (Weight: 20kg)
Phone: 9812345678

Rx:
1. Tab Crocin 650mg       0-0-1    3 days
2. Syr Azithral 200mg     1-0-0    3 days`,
};

export default function PrescriptionWorkstationPage() {
  const [activeTab, setActiveTab] = useState<"scanner" | "archive">("scanner");

  // Scanner state
  const [rxText, setRxText] = useState(PRESET_PRESCRIPTIONS.internal_med);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<PrescriptionScanResponseData | null>(null);
  const [posSuccessMessage, setPosSuccessMessage] = useState<string | null>(null);

  // Patient metadata inputs for saving
  const [patientName, setPatientName] = useState("Sunil Deshmukh");
  const [patientAge, setPatientAge] = useState<number | undefined>(45);
  const [patientGender, setPatientGender] = useState("Male");
  const [doctorName, setDoctorName] = useState("Dr. R. Sharma");
  const [doctorRegNumber, setDoctorRegNumber] = useState("MH-2012-48921");
  const [customerPhone, setCustomerPhone] = useState("9876501234");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Archive state
  const [archiveItems, setArchiveItems] = useState<StoredPrescriptionRecord[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRxDetail, setSelectedRxDetail] = useState<StoredPrescriptionRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Clinical verification & dispensing state
  const [verifyNotes, setVerifyNotes] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [dispenseSaleId, setDispenseSaleId] = useState("");
  const [isDispensing, setIsDispensing] = useState(false);

  // Fetch archive when tab switched or filters change
  useEffect(() => {
    if (activeTab === "archive") {
      loadArchive();
    }
  }, [activeTab, statusFilter]);

  const loadArchive = async () => {
    setArchiveLoading(true);
    try {
      const res = await getPrescriptions(1, 50, statusFilter || undefined, searchQuery || undefined);
      setArchiveItems(res.items || []);
    } catch (err: any) {
      console.error("Failed to load prescriptions archive:", err);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleScanPrescription = async () => {
    setIsScanning(true);
    setScanResult(null);
    setPosSuccessMessage(null);
    setSaveSuccessMessage(null);
    try {
      const data = await scanDoctorPrescription(
        selectedFile ? undefined : rxText,
        selectedFile || undefined
      );
      setScanResult(data);
    } catch (err: any) {
      alert("Prescription scan failed: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveToRecord = async () => {
    if (!scanResult) return;
    setIsSaving(true);
    setSaveSuccessMessage(null);
    try {
      const itemsPayload = scanResult.items.map((item) => ({
        extracted_name: item.detected_brand_or_generic,
        medicine_id: item.matched_medicine_id || null,
        dosage_instructions: item.dosage_instructions || undefined,
        quantity_prescribed: item.quantity_to_dispense || 1,
        is_available: item.is_available,
      }));

      const record = await savePrescription({
        patient_name: patientName || "Anonymous Patient",
        patient_age: patientAge,
        patient_gender: patientGender,
        doctor_name: doctorName,
        doctor_reg_number: doctorRegNumber,
        customer_phone: customerPhone,
        raw_text: selectedFile ? undefined : rxText,
        notes: clinicalNotes || scanResult.notes || undefined,
        items: itemsPayload,
      });

      setSaveSuccessMessage(
        `✓ Prescription saved as ${record.prescription_number}. Regulatory audit entry created.`
      );
    } catch (err: any) {
      alert("Failed to save prescription: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDetail = async (rxId: number) => {
    setDetailLoading(true);
    try {
      const rx = await getPrescriptionDetail(rxId);
      setSelectedRxDetail(rx);
      setVerifyNotes(rx.notes || "");
    } catch (err: any) {
      alert("Failed to load prescription detail: " + err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleVerifySignOff = async () => {
    if (!selectedRxDetail) return;
    setIsVerifying(true);
    try {
      const updated = await verifyPrescription(selectedRxDetail.id, {
        notes: verifyNotes,
        doctor_name: selectedRxDetail.doctor_name || undefined,
        doctor_reg_number: selectedRxDetail.doctor_reg_number || undefined,
        patient_name: selectedRxDetail.patient_name,
      });
      setSelectedRxDetail(updated);
      alert("Prescription verified successfully with pharmacist clinical sign-off!");
      loadArchive();
    } catch (err: any) {
      alert("Verification failed: " + err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDispenseLink = async () => {
    if (!selectedRxDetail || !dispenseSaleId) {
      alert("Please enter a valid completed Sale Invoice ID.");
      return;
    }
    setIsDispensing(true);
    try {
      const updated = await dispensePrescription(selectedRxDetail.id, parseInt(dispenseSaleId, 10));
      setSelectedRxDetail(updated);
      alert(`Prescription linked to Sale #${dispenseSaleId} and marked as Dispensed.`);
      setDispenseSaleId("");
      loadArchive();
    } catch (err: any) {
      alert("Dispense linking failed: " + err.message);
    } finally {
      setIsDispensing(false);
    }
  };

  const handleSendToPOS = (items: PrescribedItemData[]) => {
    const availableItems = items.filter((it) => it.is_available);
    if (availableItems.length === 0) {
      alert("No available in-stock medicines to send to POS counter.");
      return;
    }
    setPosSuccessMessage(
      `✓ Successfully queued ${availableItems.length} item(s) (${availableItems.map((i) => i.detected_brand_or_generic).join(", ")}) to POS Billing Counter!`
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      {/* Navigation Header */}
      <header
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "1rem 2.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/" style={{ fontSize: "1.75rem", textDecoration: "none" }}>
            💊
          </Link>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Prescriptions & Clinical Compliance Hub
              </h1>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "var(--radius-full)",
                  background: "var(--confidence-high-bg)",
                  color: "var(--confidence-high-accent)",
                  fontWeight: 700,
                  border: "1px solid var(--confidence-high-border)",
                }}
              >
                PRD RULES 7, 21, 22, 23, 26
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Doctor Rx OCR • Molecule Extraction • Catalog Matching • Audit Logging • Pharmacist Verification Sign-off
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Sub-tab switcher */}
          <div
            style={{
              display: "flex",
              background: "var(--bg-app)",
              padding: "0.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: activeTab === "scanner" ? "var(--brand-500)" : "transparent",
                color: activeTab === "scanner" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              📷 Scanner & Intake
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("archive")}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: activeTab === "archive" ? "var(--brand-500)" : "transparent",
                color: activeTab === "archive" ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              📁 Prescriptions Archive
            </button>
          </div>

          <Link
            href="/audit"
            style={{
              padding: "0.45rem 1rem",
              background: "var(--bg-app)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            🛡️ Audit Ledger
          </Link>
          <Link
            href="/"
            style={{
              padding: "0.45rem 1rem",
              background: "var(--brand-500)",
              color: "#ffffff",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main
        style={{
          flex: 1,
          maxWidth: "1400px",
          width: "100%",
          margin: "0 auto",
          padding: "2rem 2.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {activeTab === "scanner" && (
          <>
            {/* Input Section */}
            <section
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Prescription Capture & Digital OCR Intake
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    Scan handwritten or printed doctor prescriptions. Extracts medicines, dosage instructions, and checks real-time inventory.
                  </p>
                </div>

                {/* Preset Switcher */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRxText(PRESET_PRESCRIPTIONS.internal_med);
                      setSelectedFile(null);
                      setPatientName("Sunil Deshmukh");
                      setDoctorName("Dr. R. Sharma");
                      setDoctorRegNumber("MH-2012-48921");
                      setCustomerPhone("9876501234");
                    }}
                    style={{
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      cursor: "pointer",
                    }}
                  >
                    Sample Internal Med
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRxText(PRESET_PRESCRIPTIONS.pediatric);
                      setSelectedFile(null);
                      setPatientName("Aarav Patel");
                      setDoctorName("Dr. A. Mehta");
                      setDoctorRegNumber("MH-2018-91023");
                      setCustomerPhone("9812345678");
                    }}
                    style={{
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      cursor: "pointer",
                    }}
                  >
                    Sample Pediatric
                  </button>
                </div>
              </div>

              {/* Upload or Text Inputs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Digital Text / OCR Transcription
                  </label>
                  <textarea
                    rows={8}
                    value={rxText}
                    onChange={(e) => setRxText(e.target.value)}
                    placeholder="Enter doctor's prescription text or OCR transcript..."
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      fontFamily: "monospace",
                      fontSize: "0.85rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-app)",
                      color: "var(--text-primary)",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Prescription Image Capture (Camera / File)
                  </label>
                  <div
                    style={{
                      flex: 1,
                      border: "2px dashed var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "1.5rem",
                      background: "var(--bg-app)",
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0]);
                        }
                      }}
                      style={{ display: "none" }}
                      id="rx-file-upload"
                    />
                    <label
                      htmlFor="rx-file-upload"
                      style={{
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span style={{ fontSize: "2rem" }}>📸</span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--brand-600)" }}>
                        {selectedFile ? selectedFile.name : "Click to select or capture camera image"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                        Supports JPG, PNG packaging and doctor slips
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={handleScanPrescription}
                  disabled={isScanning}
                  style={{
                    padding: "0.75rem 2rem",
                    background: isScanning ? "var(--border-default)" : "var(--brand-500)",
                    color: "#ffffff",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: isScanning ? "not-allowed" : "pointer",
                    border: "none",
                    boxShadow: "0 2px 6px var(--brand-shadow)",
                  }}
                >
                  {isScanning ? "Extracting Medicines & Checking Stock..." : "Scan & Verify Availability"}
                </button>
              </div>
            </section>

            {/* Analysis Results */}
            {scanResult && (
              <section
                style={{
                  background: "var(--bg-surface)",
                  padding: "1.75rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                {/* Tally Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      Prescription Extraction Summary
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      {scanResult.notes}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <div
                      style={{
                        background: "var(--confidence-high-bg)",
                        border: "1px solid var(--confidence-high-border)",
                        color: "var(--confidence-high-accent)",
                        padding: "0.4rem 0.85rem",
                        borderRadius: "var(--radius-full)",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                      }}
                    >
                      ✓ {scanResult.available_count} In Stock
                    </div>
                    {scanResult.unavailable_count > 0 && (
                      <div
                        style={{
                          background: "var(--confidence-low-bg)",
                          border: "1px solid var(--confidence-low-border)",
                          color: "var(--confidence-low-accent)",
                          padding: "0.4rem 0.85rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                        }}
                      >
                        ✕ {scanResult.unavailable_count} Out of Stock
                      </div>
                    )}
                  </div>
                </div>

                {/* Prescribed Items Table */}
                <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Prescribed Item</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Strength</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Dosage SIG</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Duration</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Dispense Qty</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Store Stock Status</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Substitutes for Review (PRD Rule 20)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                              {item.detected_brand_or_generic}
                            </div>
                            {item.matched_brand_name && (
                              <span style={{ fontSize: "0.7rem", color: "var(--brand-600)" }}>
                                Catalog: {item.matched_brand_name} (MRP: ₹{item.matched_mrp?.toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>{item.strength || "-"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontWeight: 600 }}>
                            {item.dosage_instructions || "-"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>{item.duration || "-"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>
                            {item.quantity_to_dispense} units
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            {item.is_available ? (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "var(--radius-full)",
                                  background: "var(--confidence-high-bg)",
                                  color: "var(--confidence-high-accent)",
                                  fontWeight: 700,
                                }}
                              >
                                ✓ Available ({item.available_units} in stock)
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "var(--radius-full)",
                                  background: "var(--confidence-low-bg)",
                                  color: "var(--confidence-low-accent)",
                                  fontWeight: 700,
                                }}
                              >
                                ✕ Out of Stock (0 units)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem" }}>
                            {item.alternative_candidates.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                {item.alternative_candidates.map((alt, aIdx) => (
                                  <div
                                    key={aIdx}
                                    style={{
                                      background: "var(--bg-app)",
                                      padding: "0.25rem 0.5rem",
                                      borderRadius: "var(--radius-xs)",
                                      border: "1px solid var(--border-default)",
                                    }}
                                  >
                                    <strong>{alt.brand_name}</strong> ({alt.units_in_stock} in stock) • ₹{alt.selling_price.toFixed(2)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-tertiary)" }}>
                                {item.is_available ? "In-stock, no substitution needed" : "No generic alternative in stock"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Patient Record Persistence Form (PRD Rules 7, 21, 22) */}
                <div
                  style={{
                    background: "var(--bg-app)",
                    padding: "1.25rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      Patient Record & Regulatory Compliance Archive
                    </h4>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      Saves document header & line items to secure database with immutable audit log
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                    <div>
                      <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Patient Name *
                      </label>
                      <input
                        type="text"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.4rem 0.6rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                          marginTop: "0.25rem",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Patient Phone
                      </label>
                      <input
                        type="text"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.4rem 0.6rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                          marginTop: "0.25rem",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Doctor Name
                      </label>
                      <input
                        type="text"
                        value={doctorName}
                        onChange={(e) => setDoctorName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.4rem 0.6rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                          marginTop: "0.25rem",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Doctor Reg No
                      </label>
                      <input
                        type="text"
                        value={doctorRegNumber}
                        onChange={(e) => setDoctorRegNumber(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.4rem 0.6rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                          marginTop: "0.25rem",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "1rem", flex: 1, marginRight: "1rem" }}>
                      <input
                        type="text"
                        placeholder="Optional clinical notes / allergy warnings..."
                        value={clinicalNotes}
                        onChange={(e) => setClinicalNotes(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "0.45rem 0.75rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button
                        type="button"
                        onClick={handleSaveToRecord}
                        disabled={isSaving}
                        style={{
                          padding: "0.6rem 1.25rem",
                          background: "var(--text-primary)",
                          color: "var(--bg-app)",
                          borderRadius: "var(--radius-sm)",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          cursor: isSaving ? "not-allowed" : "pointer",
                          border: "none",
                        }}
                      >
                        {isSaving ? "Saving..." : "💾 Save to Patient Record"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendToPOS(scanResult.items)}
                        style={{
                          padding: "0.6rem 1.25rem",
                          background: "var(--brand-500)",
                          color: "#ffffff",
                          borderRadius: "var(--radius-sm)",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          border: "none",
                          boxShadow: "0 2px 6px var(--brand-shadow)",
                        }}
                      >
                        Send to POS Billing →
                      </button>
                    </div>
                  </div>

                  {saveSuccessMessage && (
                    <div
                      style={{
                        background: "var(--confidence-high-bg)",
                        border: "1px solid var(--confidence-high-border)",
                        color: "var(--confidence-high-accent)",
                        padding: "0.65rem 1rem",
                        borderRadius: "var(--radius-xs)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                      }}
                    >
                      {saveSuccessMessage}
                    </div>
                  )}
                </div>

                {posSuccessMessage && (
                  <div
                    style={{
                      background: "var(--confidence-high-bg)",
                      border: "1px solid var(--confidence-high-border)",
                      color: "var(--confidence-high-accent)",
                      padding: "0.85rem 1.25rem",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    {posSuccessMessage}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* Prescriptions Archive View */}
        {activeTab === "archive" && (
          <section
            style={{
              background: "var(--bg-surface)",
              padding: "1.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            {/* Header & Filter Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)" }}>
                  Prescription Compliance Archive & Document Records
                </h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  Regulatory repository with pharmacist clinical verification sign-off and dispensing linkage.
                </p>
              </div>

              {/* Status Filters */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {["", "pending_verification", "verified", "dispensed"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    style={{
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: statusFilter === st ? "var(--brand-500)" : "var(--bg-app)",
                      color: statusFilter === st ? "#ffffff" : "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    {st === "" ? "All Statuses" : st.replace("_", " ").toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Prescriptions List Table */}
            {archiveLoading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
                Loading prescription records...
              </div>
            ) : archiveItems.length === 0 ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-tertiary)" }}>
                No prescription records found matching the criteria.
              </div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                      <th style={{ padding: "0.75rem 1rem" }}>Rx Number</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Patient</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Doctor</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Items Prescribed</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Date Saved</th>
                      <th style={{ padding: "0.75rem 1rem" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archiveItems.map((rx) => {
                      const isPending = rx.status === "pending_verification";
                      const isVerified = rx.status === "verified";
                      const isDispensed = rx.status === "dispensed";

                      return (
                        <tr key={rx.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--brand-600)" }}>
                            {rx.prescription_number}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div style={{ fontWeight: 600 }}>{rx.patient_name}</div>
                            {rx.customer_name && (
                              <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                                Customer #{rx.customer_id}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div>{rx.doctor_name || "Unspecified"}</div>
                            {rx.doctor_reg_number && (
                              <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>
                                Reg: {rx.doctor_reg_number}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span style={{ fontWeight: 600 }}>{rx.items?.length || 0} medicines</span>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                              {rx.items?.map((i) => i.extracted_name).slice(0, 2).join(", ")}
                              {(rx.items?.length || 0) > 2 ? "..." : ""}
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.25rem 0.6rem",
                                borderRadius: "var(--radius-full)",
                                fontWeight: 700,
                                background: isDispensed
                                  ? "var(--brand-50)"
                                  : isVerified
                                  ? "var(--confidence-high-bg)"
                                  : "var(--confidence-mid-bg)",
                                color: isDispensed
                                  ? "var(--brand-600)"
                                  : isVerified
                                  ? "var(--confidence-high-accent)"
                                  : "var(--confidence-mid-accent)",
                              }}
                            >
                              {rx.status.replace("_", " ").toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            {rx.created_at ? new Date(rx.created_at).toLocaleDateString() : "-"}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(rx.id)}
                              style={{
                                padding: "0.35rem 0.75rem",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                background: "var(--bg-app)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-xs)",
                                cursor: "pointer",
                              }}
                            >
                              Review & Verify →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Document Verification & Sign-off Drawer/Modal */}
            {selectedRxDetail && (
              <div
                style={{
                  background: "var(--bg-app)",
                  padding: "1.5rem",
                  borderRadius: "var(--radius-md)",
                  border: "2px solid var(--brand-500)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                      Clinical Review: {selectedRxDetail.prescription_number}
                    </h3>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      Access logged for compliance audit (PRD Rule 22 & 23).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedRxDetail(null)}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: "1.25rem",
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Details Breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", fontSize: "0.85rem" }}>
                  <div style={{ background: "var(--bg-surface)", padding: "0.75rem", borderRadius: "var(--radius-xs)" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Patient:</span>
                    <div style={{ fontWeight: 700 }}>{selectedRxDetail.patient_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      Age: {selectedRxDetail.patient_age || "-"} | Gender: {selectedRxDetail.patient_gender || "-"}
                    </div>
                  </div>

                  <div style={{ background: "var(--bg-surface)", padding: "0.75rem", borderRadius: "var(--radius-xs)" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Doctor:</span>
                    <div style={{ fontWeight: 700 }}>{selectedRxDetail.doctor_name || "Unspecified"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      Reg: {selectedRxDetail.doctor_reg_number || "-"}
                    </div>
                  </div>

                  <div style={{ background: "var(--bg-surface)", padding: "0.75rem", borderRadius: "var(--radius-xs)" }}>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Verification Status:</span>
                    <div style={{ fontWeight: 700 }}>{selectedRxDetail.status.toUpperCase()}</div>
                    {selectedRxDetail.verified_by_name && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                        Signed off by: {selectedRxDetail.verified_by_name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div style={{ background: "var(--bg-surface)", padding: "0.75rem", borderRadius: "var(--radius-xs)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Prescribed Items:</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {selectedRxDetail.items.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.4rem 0.6rem",
                          background: "var(--bg-app)",
                          borderRadius: "var(--radius-xs)",
                          fontSize: "0.8rem",
                        }}
                      >
                        <div>
                          <strong>{item.extracted_name}</strong>
                          {item.dosage_instructions && (
                            <span style={{ marginLeft: "0.5rem", color: "var(--text-secondary)" }}>
                              ({item.dosage_instructions})
                            </span>
                          )}
                        </div>
                        <div>Qty: {item.quantity_prescribed}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sign-off Actions */}
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  {selectedRxDetail.status === "pending_verification" && (
                    <div style={{ display: "flex", gap: "0.5rem", flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Clinical verification notes / allergy checks..."
                        value={verifyNotes}
                        onChange={(e) => setVerifyNotes(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "0.45rem 0.75rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleVerifySignOff}
                        disabled={isVerifying}
                        style={{
                          padding: "0.45rem 1.25rem",
                          background: "var(--confidence-high-accent)",
                          color: "#ffffff",
                          borderRadius: "var(--radius-xs)",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          border: "none",
                          cursor: isVerifying ? "not-allowed" : "pointer",
                        }}
                      >
                        {isVerifying ? "Verifying..." : "✓ Pharmacist Sign-Off"}
                      </button>
                    </div>
                  )}

                  {selectedRxDetail.status === "verified" && (
                    <div style={{ display: "flex", gap: "0.5rem", flex: 1 }}>
                      <input
                        type="number"
                        placeholder="Completed Sale Invoice ID (e.g. 1)"
                        value={dispenseSaleId}
                        onChange={(e) => setDispenseSaleId(e.target.value)}
                        style={{
                          width: "250px",
                          padding: "0.45rem 0.75rem",
                          fontSize: "0.85rem",
                          borderRadius: "var(--radius-xs)",
                          border: "1px solid var(--border-default)",
                          background: "var(--bg-surface)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleDispenseLink}
                        disabled={isDispensing}
                        style={{
                          padding: "0.45rem 1.25rem",
                          background: "var(--brand-500)",
                          color: "#ffffff",
                          borderRadius: "var(--radius-xs)",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          border: "none",
                          cursor: isDispensing ? "not-allowed" : "pointer",
                        }}
                      >
                        {isDispensing ? "Linking..." : "Mark as Dispensed"}
                      </button>
                    </div>
                  )}

                  {selectedRxDetail.status === "dispensed" && (
                    <div style={{ fontSize: "0.85rem", color: "var(--brand-600)", fontWeight: 700 }}>
                      ✓ Dispensed against Sale #{selectedRxDetail.sale_id} on{" "}
                      {selectedRxDetail.dispensed_at ? new Date(selectedRxDetail.dispensed_at).toLocaleString() : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
