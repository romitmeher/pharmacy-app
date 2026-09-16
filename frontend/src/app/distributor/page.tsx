"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  scanDistributorInvoice,
  verifyPhysicalDelivery,
  confirmDelivery,
  MatchedDraftData,
  DeliveryDiscrepancyReport,
  ActualScanPayload,
} from "@/lib/api";

const PRESET_INVOICES = {
  mahavir: `================================================================================
                    MAHAVIR PHARMA DISTRIBUTORS PVT LTD
             24 Wholesale Market, Kalbadevi, Mumbai - 400002
GSTIN: 27AAACM1234F1Z5                  DL No: 20B/21B-45892
--------------------------------------------------------------------------------
Invoice No: MP-2026-9842                Date: 15/09/2026
Customer: SmartPharm Central            Due Date: 30/09/2026
--------------------------------------------------------------------------------
Item Description           Pack    HSN      Batch No    Exp Date   Qty  Rate    MRP    GST%  Amount
--------------------------------------------------------------------------------
CROCIN 650 MG TAB         15's    300490   CR-9921     08/2028    50   24.50   35.00  12%   1225.00
AZITHRAL 500 MG TAB        5's     300490   AZ-4410     11/2027    20   85.00  118.00  12%   1700.00
AUGMENTIN 625 DUO TAB     10's    300490   AUG-102     04/2027    10  160.00  204.00  12%   1600.00
--------------------------------------------------------------------------------
Subtotal: Rs. 4525.00
GST Total: Rs. 543.00
Grand Total: Rs. 5068.00
================================================================================`,
  medplus: `================================================================================
                    MEDPLUS SUPPLY NETWORK PVT LTD
             88 Logistics Hub, Bhiwandi, Thane - 421302
GSTIN: 27AABCM1234F1Z5                  DL No: 20B/21B-98765
--------------------------------------------------------------------------------
Invoice No: MP-LIVE-2026-001            Date: 13/09/2026
Customer: SmartPharm Flagship           Due Date: 28/09/2026
--------------------------------------------------------------------------------
Item Description           Pack    HSN      Batch No    Exp Date   Qty  Rate    MRP    GST%  Amount
--------------------------------------------------------------------------------
CROCIN 650 MG TAB         15's    300490   LIV-B01     09/2027    25   25.00   35.50  12%    625.00
--------------------------------------------------------------------------------
Grand Total: Rs. 700.00
================================================================================`,
};

export default function DistributorIntakePage() {
  // Step 1: Invoice Ingestion State
  const [invoiceText, setInvoiceText] = useState(PRESET_INVOICES.mahavir);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<MatchedDraftData | null>(null);

  // Step 2: Physical Delivery Scanning & Verification State
  const [actualScans, setActualScans] = useState<ActualScanPayload[]>([
    {
      medicine_name: "CROCIN 650 MG TAB",
      batch_number: "CR-9921",
      expiry_date: "2028-08-31",
      actual_quantity: 48, // Short shipment example
      mrp: 35.0,
    },
    {
      medicine_name: "AZITHRAL 500 MG TAB",
      batch_number: "AZ-4410",
      expiry_date: "2027-11-30",
      actual_quantity: 20,
      mrp: 118.0,
    },
  ]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationReport, setVerificationReport] = useState<DeliveryDiscrepancyReport | null>(null);

  // Step 3: Confirmation State
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmedSuccess, setConfirmedSuccess] = useState<any | null>(null);

  // Handler: Scan and Create Purchase Draft
  const handleScanInvoice = async () => {
    setIsParsing(true);
    setParseError(null);
    setDraftData(null);
    setVerificationReport(null);
    setConfirmedSuccess(null);

    try {
      const response = await scanDistributorInvoice(
        selectedFile ? undefined : invoiceText,
        selectedFile || undefined
      );
      setDraftData(response.data);

      // Pre-fill physical scans based on expected items for convenience
      if (response.data.matched_draft.items.length > 0) {
        setActualScans(
          response.data.matched_draft.items.map((it, idx) => ({
            medicine_name: it.raw_item_name,
            batch_number: it.batch_number,
            expiry_date: it.expiry_date,
            actual_quantity: idx === 0 ? Math.max(1, it.quantity - 2) : it.quantity, // deliberate discrepancy on 1st item
            mrp: it.mrp,
            medicine_id: it.medicine_id,
          }))
        );
      }
    } catch (err: any) {
      setParseError(err.message || "Failed to parse invoice.");
    } finally {
      setIsParsing(false);
    }
  };

  // Handler: Run Delivery Verification AI
  const handleVerifyDelivery = async () => {
    if (!draftData) return;
    setIsVerifying(true);
    try {
      const res = await verifyPhysicalDelivery(draftData.purchase_invoice_id, actualScans);
      setVerificationReport(res.report);
    } catch (err: any) {
      alert("Verification failed: " + err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handler: Commit Verified Delivery to Inventory
  const handleConfirmDelivery = async () => {
    if (!draftData) return;
    setIsConfirming(true);
    try {
      const receivedItems = actualScans.map((scan) => ({
        received_quantity: scan.actual_quantity,
        batch_number: scan.batch_number,
        expiry_date: scan.expiry_date,
        mrp: scan.mrp,
      }));

      const res = await confirmDelivery({
        purchase_invoice_id: draftData.purchase_invoice_id,
        location_id: 1,
        received_items: receivedItems,
      });

      setConfirmedSuccess(res.data);
    } catch (err: any) {
      alert("Failed to confirm delivery: " + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "MATCHED":
        return { background: "var(--confidence-high-bg)", color: "var(--confidence-high-accent)", border: "1px solid var(--confidence-high-border)" };
      case "QUANTITY_MISMATCH":
        return { background: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "1px solid rgba(245, 158, 11, 0.3)" };
      case "MISSING_ITEM":
        return { background: "var(--confidence-low-bg)", color: "var(--confidence-low-accent)", border: "1px solid var(--confidence-low-border)" };
      case "EXTRA_ITEM":
        return { background: "rgba(147, 51, 234, 0.12)", color: "#9333ea", border: "1px solid rgba(147, 51, 234, 0.3)" };
      default:
        return { background: "rgba(59, 130, 246, 0.12)", color: "#2563eb", border: "1px solid rgba(59, 130, 246, 0.3)" };
    }
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
                Distributor Receiving & Delivery Verifier
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
                PHASE 3 INTELLIGENCE
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              PRD Rule 8, 11 & 12: Invoice Scan • Layout Extraction • Expected vs Actual AI • Safe Stock Commit
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/vision"
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
            📷 Packaging Vision
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

      {/* Main Receiving Workflow */}
      <main
        style={{
          flex: 1,
          padding: "2rem 2.5rem",
          maxWidth: "1400px",
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Step 1: Ingest & Parse Distributor Invoice */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    background: "var(--brand-500)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  1
                </span>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Distributor Invoice Ingestion (OCR & Multi-Template Layout Parsing)
                </h2>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Accepts multi-format printed invoices, text PDFs, or raw OCR streams. Extracts distributor GSTIN, invoice #, and tabular line items.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setInvoiceText(PRESET_INVOICES.mahavir);
                }}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Load Mahavir Pharma Sample
              </button>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setInvoiceText(PRESET_INVOICES.medplus);
                }}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Load MedPlus Network Sample
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.25rem" }}>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.4rem" }}>
                Invoice Raw Text / Layout Stream
              </label>
              <textarea
                value={invoiceText}
                onChange={(e) => setInvoiceText(e.target.value)}
                rows={10}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-app)",
                  color: "var(--text-primary)",
                  lineHeight: "1.4",
                }}
              />
            </div>

            <div
              style={{
                border: "2px dashed var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                background: "var(--bg-app)",
                gap: "0.75rem",
              }}
            >
              <span style={{ fontSize: "2rem" }}>📄</span>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Upload Invoice File
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                PDF or scanned packaging photo (PNG, JPG)
              </p>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
                style={{ fontSize: "0.75rem" }}
              />
              {selectedFile && (
                <span style={{ fontSize: "0.75rem", color: "var(--brand-600)", fontWeight: 600 }}>
                  Selected: {selectedFile.name}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.9rem" }}>🛡️</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                <strong>PRD Rule 8 & 11:</strong> Scanning strictly creates a <em>DRAFT</em>. Inventory will <strong>NOT</strong> be mutated at this stage.
              </span>
            </div>

            <button
              onClick={handleScanInvoice}
              disabled={isParsing}
              style={{
                padding: "0.65rem 1.5rem",
                background: isParsing ? "var(--border-default)" : "var(--brand-500)",
                color: "#ffffff",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: isParsing ? "not-allowed" : "pointer",
                border: "none",
                boxShadow: "0 2px 6px var(--brand-shadow)",
              }}
            >
              {isParsing ? "Parsing Layout & Matching Catalog..." : "Parse & Create Purchase Draft"}
            </button>
          </div>

          {parseError && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--confidence-low-bg)",
                border: "1px solid var(--confidence-low-border)",
                color: "var(--confidence-low-accent)",
                fontSize: "0.85rem",
              }}
            >
              {parseError}
            </div>
          )}
        </section>

        {/* Step 2: Review Purchase Draft & Line Items */}
        {draftData && (
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    background: "var(--brand-500)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  2
                </span>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Purchase Draft #{draftData.purchase_invoice_id} ({draftData.invoice_number})
                </h2>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.5rem",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#d97706",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {draftData.status}
                </span>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.85rem" }}>
                <div>
                  <span style={{ color: "var(--text-tertiary)" }}>Distributor:</span>{" "}
                  <strong>{draftData.distributor_name}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-tertiary)" }}>Total Amount:</span>{" "}
                  <strong style={{ color: "var(--brand-600)" }}>₹{draftData.total_amount.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>#</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Medicine Description</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Batch No</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Expiry</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Expected Qty</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Purchase Rate</th>
                    <th style={{ padding: "0.75rem 1rem" }}>MRP</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Line Total</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Catalog Match</th>
                  </tr>
                </thead>
                <tbody>
                  {draftData.matched_draft.items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.75rem 1rem", color: "var(--text-tertiary)" }}>{it.line_number}</td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{it.raw_item_name}</td>
                      <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace" }}>{it.batch_number}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>{it.expiry_date}</td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>{it.quantity}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>₹{it.purchase_rate.toFixed(2)}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>₹{it.mrp.toFixed(2)}</td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>₹{it.total_amount.toFixed(2)}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {it.medicine_id ? (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "var(--radius-full)",
                              background: "var(--confidence-high-bg)",
                              color: "var(--confidence-high-accent)",
                              fontWeight: 600,
                            }}
                          >
                            ✓ Matched (ID #{it.medicine_id})
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "var(--radius-full)",
                              background: "rgba(59, 130, 246, 0.12)",
                              color: "#2563eb",
                              fontWeight: 600,
                            }}
                          >
                            ★ New Product
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Step 3: Physical Delivery Verification Section */}
            <div
              style={{
                marginTop: "1rem",
                padding: "1.25rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-app)",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Physical Intake Scans (Expected vs Actual Verification)
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Scanned at physical carton intake via workstation camera. Comparison AI verifies batch, expiry, quantity, and packaging MRP.
                  </p>
                </div>

                <button
                  onClick={handleVerifyDelivery}
                  disabled={isVerifying}
                  style={{
                    padding: "0.55rem 1.25rem",
                    background: "var(--brand-500)",
                    color: "#ffffff",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  {isVerifying ? "Verifying Discrepancies..." : "Run Delivery Verification AI"}
                </button>
              </div>

              {/* Editable actual scans for test review */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {actualScans.map((scan, sIdx) => (
                  <div
                    key={sIdx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr",
                      gap: "0.75rem",
                      background: "var(--bg-surface)",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      alignItems: "center",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", display: "block" }}>Medicine</span>
                      <input
                        type="text"
                        value={scan.medicine_name}
                        onChange={(e) => {
                          const updated = [...actualScans];
                          updated[sIdx].medicine_name = e.target.value;
                          setActualScans(updated);
                        }}
                        style={{ width: "100%", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-default)" }}
                      />
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", display: "block" }}>Batch No</span>
                      <input
                        type="text"
                        value={scan.batch_number}
                        onChange={(e) => {
                          const updated = [...actualScans];
                          updated[sIdx].batch_number = e.target.value;
                          setActualScans(updated);
                        }}
                        style={{ width: "100%", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-default)" }}
                      />
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", display: "block" }}>Expiry</span>
                      <input
                        type="text"
                        value={scan.expiry_date || ""}
                        onChange={(e) => {
                          const updated = [...actualScans];
                          updated[sIdx].expiry_date = e.target.value;
                          setActualScans(updated);
                        }}
                        style={{ width: "100%", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-default)" }}
                      />
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", display: "block" }}>Actual Count</span>
                      <input
                        type="number"
                        value={scan.actual_quantity}
                        onChange={(e) => {
                          const updated = [...actualScans];
                          updated[sIdx].actual_quantity = parseInt(e.target.value) || 0;
                          setActualScans(updated);
                        }}
                        style={{ width: "100%", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-default)", fontWeight: 700 }}
                      />
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", display: "block" }}>Scanned MRP</span>
                      <input
                        type="number"
                        value={scan.mrp || 0}
                        onChange={(e) => {
                          const updated = [...actualScans];
                          updated[sIdx].mrp = parseFloat(e.target.value) || 0;
                          setActualScans(updated);
                        }}
                        style={{ width: "100%", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-default)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Discrepancy Audit Report & Commit Boundary */}
        {verificationReport && draftData && (
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    background: "var(--brand-500)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  3
                </span>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Discrepancy Audit Report (PRD Rule 12)
                </h2>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "var(--radius-sm)",
                    ...getStatusBadgeStyle(verificationReport.status),
                    fontWeight: 700,
                  }}
                >
                  {verificationReport.status}
                </span>
              </div>

              {verificationReport.total_financial_discrepancy !== 0 && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "var(--confidence-low-accent)",
                    padding: "0.4rem 0.85rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                  }}
                >
                  Debit Note Value: ₹{Math.abs(verificationReport.total_financial_discrepancy).toFixed(2)}
                </div>
              )}
            </div>

            {/* Audit Line Items */}
            <div style={{ overflowX: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>Medicine</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Expected Qty</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Actual Qty</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Difference</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Batch (Exp / Act)</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Expiry (Exp / Act)</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Financial Impact</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Audit Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {verificationReport.lines.map((line, lIdx) => (
                    <tr key={lIdx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{line.medicine_name}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "var(--radius-full)",
                            ...getStatusBadgeStyle(line.status),
                            fontWeight: 700,
                          }}
                        >
                          {line.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>{line.expected_quantity}</td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 700 }}>{line.actual_quantity}</td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 700,
                          color: line.quantity_difference < 0 ? "var(--confidence-low-accent)" : line.quantity_difference > 0 ? "#9333ea" : "var(--confidence-high-accent)",
                        }}
                      >
                        {line.quantity_difference > 0 ? `+${line.quantity_difference}` : line.quantity_difference}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {line.expected_batch} / {line.actual_batch}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem" }}>
                        {line.expected_expiry || "-"} / {line.actual_expiry || "-"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                        {line.financial_difference !== 0 ? `₹${line.financial_difference.toFixed(2)}` : "₹0.00"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {line.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Human Confirmation Barrier */}
            <div
              style={{
                marginTop: "0.5rem",
                padding: "1rem 1.25rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-app)",
                border: "1px solid var(--border-default)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Human Review & Inventory Commitment Boundary
                </span>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                  Confirming this delivery will book received batches into active stock at <strong>Shelf Location #1</strong> and update invoice status to <strong>ACCEPTED</strong>.
                </p>
              </div>

              <button
                onClick={handleConfirmDelivery}
                disabled={isConfirming || confirmedSuccess !== null}
                style={{
                  padding: "0.75rem 1.75rem",
                  background: confirmedSuccess ? "var(--confidence-high-accent)" : "var(--brand-500)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: isConfirming || confirmedSuccess ? "not-allowed" : "pointer",
                  border: "none",
                  boxShadow: "0 2px 8px var(--brand-shadow)",
                }}
              >
                {confirmedSuccess ? "✓ Stock Booked into Inventory" : isConfirming ? "Committing Batches..." : "Confirm & Book Verified Stock to Inventory"}
              </button>
            </div>

            {confirmedSuccess && (
              <div
                style={{
                  padding: "1rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--confidence-high-bg)",
                  border: "1px solid var(--confidence-high-border)",
                  color: "var(--confidence-high-accent)",
                  fontSize: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <div style={{ fontWeight: 700 }}>✓ Transaction Committed Successfully to MySQL!</div>
                <div>
                  Invoice #{confirmedSuccess.invoice_number} is now marked <strong>{confirmedSuccess.status}</strong>. Batches and physical stock units have been verified and added to inventory.
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
