"use client";

import React from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Clipboard,
  Box,
  Clock,
  File,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
} from "@duo-icons/react";

import ThemeToggle from "@/components/ThemeToggle";

export default function DashboardPage() {
  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Pharmacy Operations</h1>
          <p className="page-subtitle">
            Physical Pharmacy Operating System • Store #1 • {currentDate}
          </p>
        </div>

        {/* Quick Dispensing Action & Theme Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <Link href="/prescriptions" className="btn btn-secondary">
            <Clipboard size={16} />
            <span>Prescription Scan</span>
          </Link>
          <Link href="/pos" className="btn btn-primary">
            <ShoppingBag size={16} />
            <span>Open POS Terminal</span>
          </Link>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {/* Metric Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Card 1: POS Billing */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Dispensed Today
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={13} /></span>
                <span>Active Shift</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              --
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Bills completed in current session
            </div>
          </div>

          {/* Card 2: Low Stock */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Low Stock Threshold
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={13} /></span>
                <span>Review</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              --
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Medicines below safety stock
            </div>
          </div>

          {/* Card 3: Expiring Batches */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Expiry in &le; 30 Days
              </span>
              <span className="status-badge low">
                <span className="badge-icon"><AlertOctagon size={13} /></span>
                <span>Critical</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              --
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Batches requiring action / supplier return
            </div>
          </div>

          {/* Card 4: Delivery Verification */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Pending Deliveries
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><File size={13} /></span>
                <span>Verification</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              --
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Invoices awaiting physical check
            </div>
          </div>
        </div>

        {/* Operational Sections */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1.25rem" }}>
          {/* Section A: Pharmacy Workflows */}
          <div className="card">
            <div className="card-title">Core Operational Modules</div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Vision-first pharmacy workflows conforming to Phase 1 foundation.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Link href="/inventory" className="module-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="module-icon">
                    <Box size={16} />
                  </span>
                  <span className="module-title">Batch Inventory</span>
                </div>
                <span className="module-desc">
                  FEFO tracking, locations, physical units
                </span>
              </Link>

              <Link href="/purchases" className="module-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="module-icon">
                    <File size={16} />
                  </span>
                  <span className="module-title">Invoices & Verification</span>
                </div>
                <span className="module-desc">
                  Distributor drafts & physical verification
                </span>
              </Link>

              <Link href="/expiry" className="module-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="module-icon">
                    <Clock size={16} />
                  </span>
                  <span className="module-title">Expiry Protocol</span>
                </div>
                <span className="module-desc">
                  Near-expiry alerts & supplier returns
                </span>
              </Link>

              <Link href="/audit" className="module-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="module-icon">
                    <CheckCircle size={16} />
                  </span>
                  <span className="module-title">Audit Trail</span>
                </div>
                <span className="module-desc">
                  Compliance logs & stock adjustment records
                </span>
              </Link>
            </div>
          </div>

          {/* Section B: System Status & Verification Policy */}
          <div className="card">
            <div className="card-title">Operating Policy</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginTop: "0.75rem" }}>
              <div className="policy-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span style={{ color: "var(--status-high-text)", display: "inline-flex" }}>
                    <CheckCircle size={15} />
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                    Human-in-the-Loop Active
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Consequential inventory adjustments and delivery receipts require licensed pharmacist confirmation.
                </div>
              </div>

              <div className="policy-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span style={{ color: "var(--status-info-text)", display: "inline-flex" }}>
                    <File size={15} />
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                    Data Integrity Rule
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Medicine identity is strictly decoupled from manufacturing batch and location unit stock.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
