"use client";

import React, { useState } from "react";
import { RecognitionPipelineResponse, verifyMedicineRecognition, VerifiedItemResponse } from "@/lib/api";

interface PharmacistVerificationModalProps {
  recognition: RecognitionPipelineResponse;
  imageB64: string;
  isOpen: boolean;
  onClose: () => void;
  onVerified: (verifiedItem: VerifiedItemResponse, targetAction: "pos" | "purchase") => void;
}

export default function PharmacistVerificationModal({
  recognition,
  imageB64,
  isOpen,
  onClose,
  onVerified,
}: PharmacistVerificationModalProps) {
  if (!isOpen) return null;

  const match = recognition.match_result;
  const top = match?.top_candidate;
  const extracted = recognition.extracted_entities;

  // Local state initialized with AI-recognized fields
  const [selectedMedId, setSelectedMedId] = useState<number | null>(top?.medicine_id || null);
  const [batchNumber, setBatchNumber] = useState<string>(
    extracted?.batch_number || top?.matched_batch?.batch_number || ""
  );
  const [expiryDate, setExpiryDate] = useState<string>(
    extracted?.expiry_date || top?.matched_batch?.expiry_date || ""
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isLowConfidence = match?.low_confidence || !top;
  const confidenceScore = top?.confidence_score ?? 0;
  const confidenceLevel = top?.confidence_level ?? "LOW";

  const handleConfirm = async (action: "pos" | "purchase") => {
    if (!selectedMedId) {
      setSubmitError("Please select or match a valid medicine before confirming.");
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const verified = await verifyMedicineRecognition({
        medicine_id: selectedMedId,
        batch_number: batchNumber.trim(),
        expiry_date: expiryDate.trim() || undefined,
        quantity,
      });
      onVerified(verified, action);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || "Verification failed. Please review inputs.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--bg-overlay)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--border-default)",
          width: "100%",
          maxWidth: "880px",
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.75rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--brand-600)",
              }}
            >
              PRD Rule 9 • Human Verification Boundary
            </span>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Pharmacist Medicine Verification
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.5rem",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              padding: "0.25rem 0.5rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.5rem 1.75rem", display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: "1.75rem" }}>
          {/* Left Column: Image Preview & Confidence Ring */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "260px",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                border: "1px solid var(--border-subtle)",
                background: "#090d16",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageB64}
                alt="Captured Medicine Packaging"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  left: "8px",
                  background: "rgba(0,0,0,0.75)",
                  color: "#e2e8f0",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {recognition.detection?.method ? `ROI: ${recognition.detection.method}` : "Full Frame"}
              </div>
            </div>

            {/* Confidence Breakdown Card */}
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                background:
                  confidenceLevel === "HIGH"
                    ? "var(--confidence-high-bg)"
                    : confidenceLevel === "MEDIUM"
                    ? "var(--confidence-med-bg)"
                    : "var(--confidence-low-bg)",
                border: `1px solid ${
                  confidenceLevel === "HIGH"
                    ? "var(--confidence-high-border)"
                    : confidenceLevel === "MEDIUM"
                    ? "var(--confidence-med-border)"
                    : "var(--confidence-low-border)"
                }`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  AI MATCH CONFIDENCE
                </span>
                <span
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    color:
                      confidenceLevel === "HIGH"
                        ? "var(--confidence-high-text)"
                        : confidenceLevel === "MEDIUM"
                        ? "var(--confidence-med-text)"
                        : "var(--confidence-low-text)",
                  }}
                >
                  {confidenceScore.toFixed(1)}% ({confidenceLevel})
                </span>
              </div>

              {top?.score_breakdown && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Brand Match:</span>
                    <strong>+{top.score_breakdown.brand_score || 0} pts</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Strength Match:</span>
                    <strong>+{top.score_breakdown.strength_score || 0} pts</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Batch Verification:</span>
                    <strong>+{top.score_breakdown.batch_score || 0} pts</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Rule 9 Safeguard Alert */}
            {isLowConfidence && (
              <div
                style={{
                  padding: "0.85rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--confidence-low-bg)",
                  border: "1px solid var(--confidence-low-border)",
                  color: "var(--confidence-low-text)",
                  fontSize: "0.85rem",
                }}
              >
                <strong>⚠️ PRD Rule 9 Enforcement:</strong>
                <p style={{ marginTop: "0.25rem" }}>
                  {match?.warning_message || "Unable to confidently identify this medicine. Capture another image or search manually."}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Editable Verification Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Top Medicine Selection */}
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                Identified Medicine Candidate
              </label>
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-app)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>
                  {top ? top.name : "Unidentified Medicine"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                  {top?.generic_name ? `${top.generic_name} • ` : ""}{top?.strength || "No strength specified"}
                </div>
                {top?.manufacturer && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginTop: "0.15rem" }}>
                    Mfg: {top.manufacturer}
                  </div>
                )}
              </div>
            </div>

            {/* Alternative Candidates If Any */}
            {match && match.alternatives.length > 0 && (
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-tertiary)", display: "block", marginBottom: "0.25rem" }}>
                  Alternative Database Matches:
                </label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {match.alternatives.map((alt) => (
                    <button
                      key={alt.medicine_id}
                      onClick={() => setSelectedMedId(alt.medicine_id)}
                      style={{
                        padding: "0.3rem 0.6rem",
                        fontSize: "0.8rem",
                        borderRadius: "var(--radius-sm)",
                        border: selectedMedId === alt.medicine_id ? "2px solid var(--brand-500)" : "1px solid var(--border-subtle)",
                        background: selectedMedId === alt.medicine_id ? "var(--brand-50)" : "var(--bg-surface)",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {alt.name} ({alt.confidence_score.toFixed(0)}%)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Grid of Batch & Expiry */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                  Batch Number
                </label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. B.No 2026-X1"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                  }}
                />
                {top?.matched_batch ? (
                  <span style={{ fontSize: "0.75rem", color: "var(--confidence-high-accent)", fontWeight: 600, marginTop: "0.2rem", display: "block" }}>
                    ✓ Matched existing store batch
                  </span>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.2rem", display: "block" }}>
                    New batch will be registered
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.2rem", display: "block" }}>
                  Normalized to end-of-month
                </span>
              </div>
            </div>

            {/* Pricing, Current Stock & Quantity Selector */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.75rem",
                padding: "0.75rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", display: "block" }}>MRP</span>
                <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>
                  {top?.mrp ? `₹${top.mrp.toFixed(2)}` : "—"}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", display: "block" }}>Current Stock</span>
                <strong style={{ fontSize: "1rem", color: top?.active_stock ? "var(--confidence-high-accent)" : "var(--confidence-low-accent)" }}>
                  {top?.active_stock ?? 0} units
                </strong>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", display: "block" }}>Quantity</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.2rem" }}>
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-surface)",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    -
                  </button>
                  <strong style={{ fontSize: "0.95rem" }}>{quantity}</strong>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-surface)",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {submitError && (
              <div style={{ color: "var(--confidence-low-text)", fontSize: "0.85rem", fontWeight: 600 }}>
                {submitError}
              </div>
            )}

            {/* Consequential Action Buttons */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                onClick={() => handleConfirm("pos")}
                disabled={isSubmitting || !selectedMedId}
                style={{
                  flex: 1,
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: "var(--brand-500)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: isSubmitting || !selectedMedId ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 8px var(--brand-shadow)",
                }}
              >
                {isSubmitting ? "Verifying..." : "✓ Confirm & Add to POS Bill"}
              </button>

              <button
                onClick={() => handleConfirm("purchase")}
                disabled={isSubmitting || !selectedMedId}
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: isSubmitting || !selectedMedId ? "not-allowed" : "pointer",
                }}
              >
                + Add to Purchase
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
