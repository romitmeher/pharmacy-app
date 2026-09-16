"use client";

import React, { useState } from "react";
import Link from "next/link";
import CameraCapture from "@/components/CameraCapture";
import PharmacistVerificationModal from "@/components/PharmacistVerificationModal";
import { RecognitionPipelineResponse, VerifiedItemResponse } from "@/lib/api";

export default function VisionWorkstationPage() {
  const [activeRecognition, setActiveRecognition] = useState<RecognitionPipelineResponse | null>(null);
  const [capturedImageB64, setCapturedImageB64] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Pharmacist Cart / Staging Area
  const [verifiedCart, setVerifiedCart] = useState<Array<VerifiedItemResponse & { targetAction: "pos" | "purchase" }>>([]);

  const handleRecognitionComplete = (result: RecognitionPipelineResponse, imageB64: string) => {
    setActiveRecognition(result);
    setCapturedImageB64(imageB64);
    setIsProcessing(false);
    setIsModalOpen(true);
  };

  const handleItemVerified = (verifiedItem: VerifiedItemResponse, targetAction: "pos" | "purchase") => {
    setVerifiedCart((prev) => [{ ...verifiedItem, targetAction }, ...prev]);
  };

  const calculateCartTotal = () => {
    return verifiedCart
      .filter((i) => i.targetAction === "pos")
      .reduce((sum, item) => sum + (item.mrp || 0) * item.verified_quantity, 0);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar */}
      <header
        style={{
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem" }}>💊</span>
            <div>
              <span style={{ fontWeight: 800, fontSize: "1.2rem", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                SmartPharm
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--brand-600)", fontWeight: 700, marginLeft: "0.4rem" }}>
                OS v1.0
              </span>
            </div>
          </Link>
          <div style={{ height: "24px", width: "1px", background: "var(--border-subtle)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Camera Workstation • Live Aiven MySQL
            </span>
          </div>
        </div>

        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link
            href="/"
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/vision"
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.9rem",
              fontWeight: 600,
              background: "var(--brand-50)",
              color: "var(--brand-600)",
            }}
          >
            Vision Scanner
          </Link>
        </nav>
      </header>

      {/* Main Workspace Layout */}
      <main style={{ flex: 1, padding: "2rem", maxWidth: "1400px", margin: "0 auto", width: "100%", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "2rem" }}>
        {/* Left Column: Live Camera & Scanner */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--brand-600)" }}>
              Vision-First Physical Counter
            </span>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Packaging Recognition & Verification
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginTop: "0.25rem" }}>
              Hold medicine blister strips or carton packages under the lens. OCR and AI recognize brand, strength, batch, and expiry for professional verification.
            </p>
          </div>

          <CameraCapture
            isProcessing={isProcessing}
            onRecognitionComplete={handleRecognitionComplete}
          />
        </section>

        {/* Right Column: Verified Pharmacist Cart / Queue */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-subtle)",
              padding: "1.5rem",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              minHeight: "540px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border-subtle)" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Verified Items Queue
                </h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                  {verifiedCart.length} item{verifiedCart.length === 1 ? "" : "s"} approved by pharmacist
                </span>
              </div>
              {verifiedCart.length > 0 && (
                <button
                  onClick={() => setVerifiedCart([])}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "0.8rem",
                    color: "var(--confidence-low-accent)",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            {/* List of Verified Items */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {verifiedCart.length === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", padding: "2rem", color: "var(--text-tertiary)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📸</div>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No items verified yet</p>
                  <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    Scan packaging on the left to verify medicine details.
                  </p>
                </div>
              ) : (
                verifiedCart.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "0.85rem 1rem",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                        {item.medicine_name}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                        {item.strength || item.dosage_form || "Standard"} • B.No: {item.batch_number || "N/A"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--brand-600)", fontWeight: 600, marginTop: "0.15rem" }}>
                        Target: {item.targetAction === "pos" ? "POS Bill" : "Purchase Intake"} • Exp: {item.expiry_date || "N/A"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)" }}>
                        ₹{((item.mrp || 0) * item.verified_quantity).toFixed(2)}
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Qty: {item.verified_quantity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer & POS Push */}
            {verifiedCart.length > 0 && (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Estimated Subtotal:</span>
                  <strong style={{ fontSize: "1.2rem", color: "var(--text-primary)" }}>
                    ₹{calculateCartTotal().toFixed(2)}
                  </strong>
                </div>
                <button
                  onClick={() => alert(`Ready for POS Billing! Proceeding with ${verifiedCart.length} items.`)}
                  style={{
                    width: "100%",
                    padding: "0.85rem",
                    background: "var(--confidence-high-accent)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontWeight: 700,
                    fontSize: "1rem",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
                  }}
                >
                  Proceed to POS Billing Checkout →
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Verification Modal */}
      {activeRecognition && (
        <PharmacistVerificationModal
          recognition={activeRecognition}
          imageB64={capturedImageB64}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onVerified={handleItemVerified}
        />
      )}
    </div>
  );
}
