import React from "react";
import Link from "next/link";

export default function DashboardHome() {
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
          <span style={{ fontSize: "1.75rem" }}>💊</span>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              SmartPharm OS
            </h1>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Vision-First Operating System for Physical Indian Pharmacies
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "var(--confidence-high-bg)",
              padding: "0.35rem 0.85rem",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--confidence-high-border)",
            }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--confidence-high-text)" }}>
              Cloud MySQL Live • Store #1
            </span>
          </div>

          <Link
            href="/copilot"
            style={{
              padding: "0.55rem 1rem",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
            }}
          >
            <span>🤖 AI Copilot</span>
          </Link>

          <Link
            href="/prescriptions"
            style={{
              padding: "0.55rem 1rem",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
            }}
          >
            <span>📋 Prescription Scanner</span>
          </Link>

          <Link
            href="/distributor"
            style={{
              padding: "0.55rem 1rem",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
            }}
          >
            <span>🚛 Receiving</span>
          </Link>

          <Link
            href="/intelligence"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #0d9488, #059669)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(13, 148, 136, 0.3)",
            }}
          >
            <span>🧠 ML Intelligence</span>
          </Link>

          <Link
            href="/shelves"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #0284c7, #0369a1)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
            }}
          >
            <span>🗄️ Shelves</span>
          </Link>

          <Link
            href="/offline"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #0891b2, #0e7490)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(8, 145, 178, 0.3)",
            }}
          >
            <span>📶 Offline & Sync</span>
          </Link>

          <Link
            href="/voice"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #4f46e5, #4338ca)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(79, 70, 229, 0.3)",
            }}
          >
            <span>🎙️ Voice Assistant</span>
          </Link>

          <Link
            href="/multibranch"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)",
            }}
          >
            <span>🏢 Multi-Branch</span>
          </Link>

          <Link
            href="/audit"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #475569, #334155)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(51, 65, 85, 0.3)",
            }}
          >
            <span>📜 Audit Trail</span>
          </Link>

          <Link
            href="/returns"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #d97706, #b45309)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(217, 119, 6, 0.3)",
            }}
          >
            <span>↺ Returns</span>
          </Link>

          <Link
            href="/expenses"
            style={{
              padding: "0.55rem 1rem",
              background: "linear-gradient(135deg, #059669, #047857)",
              color: "#ffffff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              textDecoration: "none",
              boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)",
            }}
          >
            <span>💰 Expenses & P&L</span>
          </Link>

          <Link
            href="/vision"
            style={{
              padding: "0.55rem 1.25rem",
              background: "var(--brand-500)",
              color: "#ffffff",
              borderRadius: "var(--radius-sm)",
              fontWeight: 700,
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              boxShadow: "0 2px 8px var(--brand-shadow)",
              textDecoration: "none",
            }}
          >
            <span>📷 Launch Vision Workstation</span>
          </Link>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <main style={{ flex: 1, padding: "2.5rem", maxWidth: "1350px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* KPI Summary Cards */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.25rem" }}>
          <div style={{ background: "var(--bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Today&apos;s Sales
            </span>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "0.25rem" }}>
              ₹4,850.00
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--confidence-high-accent)", fontWeight: 600 }}>
              ↑ 12% vs last week
            </span>
          </div>

          <div style={{ background: "var(--bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Bills Dispensed
            </span>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "0.25rem" }}>
              18
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              Auto-FEFO stock managed
            </span>
          </div>

          <div style={{ background: "var(--bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Low Stock Warnings
            </span>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--confidence-med-accent)", marginTop: "0.25rem" }}>
              2 items
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--confidence-med-text)" }}>
              Requires distributor reorder
            </span>
          </div>

          <div style={{ background: "var(--bg-surface)", padding: "1.25rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
              Expiry Risk (30d)
            </span>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--confidence-low-accent)", marginTop: "0.25rem" }}>
              1 batch
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--confidence-low-text)" }}>
              LIVE-B20260913-01
            </span>
          </div>
        </section>

        {/* Operational Modules Section */}
        <section>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "1rem" }}>
            Operational Subsystems
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem" }}>
            {/* Module 1: Vision Workstation */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "2px solid var(--brand-500)",
                boxShadow: "var(--shadow-md)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>📷</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Vision Packaging Recognition
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--brand-50)",
                      color: "var(--brand-600)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    PHASE 2 ACTIVE
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Camera-first medicine recognition using PaddleOCR + OpenCV. Identifies brand, strength, batch number, and expiry date. Enforces PRD Rule 9 human verification.
                </p>
              </div>

              <Link
                href="/vision"
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "var(--brand-500)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "0.95rem",
                }}
              >
                Open Camera Scanner →
              </Link>
            </div>

            {/* Module 2: POS Billing & Sales */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>🧾</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    POS Billing Counter
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--confidence-high-bg)",
                      color: "var(--confidence-high-text)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    PHASE 1 VERIFIED
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Fast point-of-sale checkout with automated FEFO batch resolution, split payment support (UPI, Cash, Card), and itemized customer receipts.
                </p>
              </div>

              <Link
                href="/vision"
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "var(--bg-app)",
                  color: "var(--text-primary)",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "0.95rem",
                  border: "1px solid var(--border-default)",
                }}
              >
                View Counter Queue →
              </Link>
            </div>

            {/* Module 3: Inventory & FEFO Expiry Tracking */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>🗄️</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Batches & Location Stock
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--confidence-high-bg)",
                      color: "var(--confidence-high-text)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    PHASE 1 VERIFIED
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Strict Medicine != Batch != Physical Inventory hierarchy. Tracks shelf/rack locations, stock adjustments with audit logs, and FEFO expiry risk buckets.
                </p>
              </div>

              <button
                disabled
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "var(--bg-app)",
                  color: "var(--text-tertiary)",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  border: "1px solid var(--border-subtle)",
                  cursor: "default",
                }}
              >
                95 Units Active Stock
              </button>
            </div>

            {/* Module 4: Purchases & Distributor Receiving */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>🚛</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Distributor Invoices & Intake
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--brand-50)",
                      color: "var(--brand-600)",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    PHASE 3 ACTIVE
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Two-stage purchase draft & delivery verification. Invoices are booked to inventory only after physical quantity check and pharmacist confirmation.
                </p>
              </div>

              <Link
                href="/distributor"
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "var(--brand-500)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  boxShadow: "0 2px 6px var(--brand-shadow)",
                }}
              >
                Open Receiving & Verification →
              </Link>
            </div>

            {/* Module 5: Phase 5 Machine Learning Operating System */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid #a7f3d0",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.08)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>🧠</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Predictive ML Intelligence
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "#ecfdf5",
                      color: "#059669",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #a7f3d0",
                    }}
                  >
                    PHASE 5 LIVE
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Demand forecasting (Autoregressive Ridge + Adaptive baseline), stock-out runway monitoring, unsold expiry loss estimation, and explainable reorders with 1-click draft PO creation.
                </p>
              </div>

              <Link
                href="/intelligence"
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "linear-gradient(135deg, #0d9488, #059669)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(13, 148, 136, 0.3)",
                }}
              >
                Launch ML Intelligence Workstation →
              </Link>
            </div>

            {/* Module 6: Audit & Compliance Ledger */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>📜</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Audit Trail & Ledger
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "#f1f5f9",
                      color: "#475569",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    PRD RULE 22
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Immutable operational change log. Review stock write-offs, shelf cycle reconciliations, discounts, inter-store transfers, and state before/after diffs with strict RBAC access.
                </p>
              </div>

              <Link
                href="/audit"
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "linear-gradient(135deg, #475569, #334155)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(71, 85, 105, 0.3)",
                }}
              >
                Inspect Audit Trail →
              </Link>
            </div>

            {/* Module 7: Sales Returns & Refunds */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.75rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.25rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>↺</span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)" }}>
                    Sales Returns & Refunds
                  </h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "#fef3c7",
                      color: "#b45309",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #fde68a",
                    }}
                  >
                    PRD RULE 14
                  </span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  Customer return terminal with line-item validation against original POS sales, restock vs damaged write-off controls, atomic tender refunds, and automatic audit trails.
                </p>
              </div>

              <Link
                href="/returns"
                style={{
                  padding: "0.75rem 1.25rem",
                  background: "linear-gradient(135deg, #d97706, #b45309)",
                  color: "#ffffff",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  boxShadow: "0 2px 6px rgba(217, 119, 6, 0.3)",
                }}
              >
                Open Returns Terminal →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
