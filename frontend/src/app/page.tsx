"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  ClipboardList,
  Package,
  Clock,
  FileText,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  TrendingUp,
  ShieldAlert,
  ShoppingCart,
  Bot,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getSales,
  getBatches,
  getExpiryReport,
  getPurchases,
  getStockOutRisks,
  getReorderRecommendations,
  createReorderDraftPO,
  StockOutPredictionItem,
  ReorderRecommendationItem,
} from "@/lib/api";

export default function DashboardPage() {
  const currentDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Real Database Metrics State
  const [todaySalesCount, setTodaySalesCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [criticalExpiryCount, setCriticalExpiryCount] = useState<number>(0);
  const [pendingDraftsCount, setPendingDraftsCount] = useState<number>(0);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);

  // ML Intelligence State (PRD Phase 5 & Rules 17 & 18)
  const [stockOutRisks, setStockOutRisks] = useState<StockOutPredictionItem[]>([]);
  const [reorderRecs, setReorderRecs] = useState<ReorderRecommendationItem[]>([]);
  const [loadingMl, setLoadingMl] = useState<boolean>(true);

  const [isSubmitting, startTransition] = useTransition();
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDashboardData = async () => {
    setLoadingMetrics(true);
    setLoadingMl(true);
    try {
      const [salesRes, batchRes, expiryRes, purchaseRes, stockOutRes, reorderRes] =
        await Promise.all([
          getSales({ per_page: 50 }),
          getBatches({ has_stock: true }),
          getExpiryReport({ days: 30 }),
          getPurchases({ status: "draft" }),
          getStockOutRisks(10),
          getReorderRecommendations(10),
        ]);

      setTodaySalesCount(salesRes.total || (salesRes.items || []).length);
      setPendingDraftsCount(purchaseRes.total || (purchaseRes.items || []).length);
      setCriticalExpiryCount(expiryRes.summary?.critical || 0 + (expiryRes.summary?.expired || 0));

      // Low stock = batches with total_available <= 10
      const lowStockBatches = (batchRes.batches || []).filter(
        (b) => b.total_available <= 10
      );
      setLowStockCount(lowStockBatches.length);

      // ML Insights
      setStockOutRisks(stockOutRes.predictions || []);
      setReorderRecs(reorderRes.recommendations || []);
    } catch (err: unknown) {
      // Graceful fallback
    } finally {
      setLoadingMetrics(false);
      setLoadingMl(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadDashboardData());
  }, []);

  // 1-Click ML Reorder Draft Order Generation (Reorder planning)
  const handleGenerateMlReorderPo = (rec: ReorderRecommendationItem) => {
    if (!rec.preferred_supplier_id) {
      alert("No preferred supplier configured for this medicine.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createReorderDraftPO(
          rec.preferred_supplier_id!,
          [
            {
              medicine_id: rec.medicine_id,
              quantity: rec.recommended_order_quantity,
              purchase_rate: rec.estimated_purchase_rate || 50,
            },
          ],
          `Auto ML Reorder Recommendation: ${rec.explanation}`
        );

        setActionSuccess(
          `Draft PO #${res.invoice_number} created for ${rec.brand_name}! Pending physical verification.`
        );
        setTimeout(() => setActionSuccess(null), 4000);
      } catch (err: unknown) {
        alert((err instanceof Error ? err.message : "") || "Failed to generate reorder draft PO.");
      }
    });
  };

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
          <button onClick={loadDashboardData} className="btn btn-secondary" title="Refresh metrics">
            <RefreshCw size={15} />
          </button>
          <Link href="/prescriptions" className="btn btn-secondary">
            <ClipboardList size={16} />
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
        {actionSuccess && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(125, 255, 149, 0.12)",
              border: "1px solid var(--status-high-border)",
              color: "var(--status-high-text)",
              fontSize: "0.8125rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <CheckCircle2 size={16} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Real Database Metric Cards Grid */}
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
                Sales Invoices Today
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={13} /></span>
                <span>Active Shift</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              {loadingMetrics ? "..." : todaySalesCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Dispensed bills in current session
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
              {loadingMetrics ? "..." : lowStockCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Batches with &le; 10 units available
            </div>
          </div>

          {/* Card 3: Expiring Batches */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Expiry in &le; 30 Days
              </span>
              <span className="status-badge low">
                <span className="badge-icon"><OctagonAlert size={13} /></span>
                <span>Critical</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              {loadingMetrics ? "..." : criticalExpiryCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Batches requiring supplier return
            </div>
          </div>

          {/* Card 4: Delivery Verification */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Pending Purchases
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><FileText size={13} /></span>
                <span>Verification</span>
              </span>
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.5rem 0 0.25rem", color: "var(--text-primary)" }}>
              {loadingMetrics ? "..." : pendingDraftsCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Draft invoices awaiting inward check
            </div>
          </div>
        </div>

        {/* Section: Predictive ML Intelligence Cards (PRD Phase 5 & Rules 17 & 18) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
          {/* Predictive Stock-Out Risk Warnings */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShieldAlert size={18} style={{ color: "var(--status-low-text)" }} />
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Stock-Out Probability Predictions
                </h3>
              </div>
              <span className="status-badge low">Demand estimate</span>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
              Estimates availability using stock, recent demand and supplier lead time.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "240px", overflowY: "auto" }}>
              {loadingMl ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  Calculating stock-out risk probabilities...
                </div>
              ) : stockOutRisks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  All inventory items have healthy stock runways.
                </div>
              ) : (
                stockOutRisks.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "0.625rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                        {item.brand_name}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                        Stock: {item.current_stock} units • Runway: {item.runway_days} days
                      </div>
                    </div>
                    <span className={`status-badge ${item.risk_level === "CRITICAL" || item.risk_level === "HIGH_RISK" ? "low" : "med"}`}>
                      {(item.stockout_probability_7d * 100).toFixed(0)}% Risk
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Explainable Smart Reorder Recommendations */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ShoppingCart size={18} style={{ color: "var(--brand-primary)" }} />
                <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Smart Reorder Recommendations
                </h3>
              </div>
              <span className="status-badge high">Reorder planning</span>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
              Forecasted Demand + Safety Stock + Lead Time - Current Inventory - Open POs.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "240px", overflowY: "auto" }}>
              {loadingMl ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  Computing reorder deficit models...
                </div>
              ) : reorderRecs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  No urgent supplier reorders required right now.
                </div>
              ) : (
                reorderRecs.map((rec, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "0.625rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                        {rec.brand_name}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                        Stock: {rec.current_stock} | Rec Order: <strong>{rec.recommended_order_quantity} units</strong>
                      </div>
                    </div>

                    <button
                      onClick={() => handleGenerateMlReorderPo(rec)}
                      disabled={isSubmitting}
                      className="btn btn-primary"
                      style={{ height: "28px", fontSize: "0.6875rem", padding: "0 0.5rem" }}
                    >
                      <span>Draft PO</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Operational Modules & Policy Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1.25rem" }}>
          {/* Section A: Core Operational Modules */}
          <div className="card">
            <div className="card-title">Core Operational Modules</div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
              Daily pharmacy workflows, from receiving stock to dispensing.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Link href="/inventory" className="module-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="module-icon">
                    <Package size={16} />
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
                    <FileText size={16} />
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

              <Link href="/returns" className="module-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="module-icon">
                    <CheckCircle2 size={16} />
                  </span>
                  <span className="module-title">Sales Returns</span>
                </div>
                <span className="module-desc">
                  Customer credit refunds & restocking audit
                </span>
              </Link>
            </div>
          </div>

          {/* Section B: Operating Policy & RAG Assistant */}
          <div className="card">
            <div className="card-title">Pharmacy AI & Compliance</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginTop: "0.75rem" }}>
              <div className="policy-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span style={{ color: "var(--brand-primary)", display: "inline-flex" }}>
                    <Bot size={16} />
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                    Grounded Pharmacy Copilot Active
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Use the floating Copilot button to query real-time database stock, expiring batches, and alternative medicines.
                </div>
              </div>

              <div className="policy-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span style={{ color: "var(--status-high-text)", display: "inline-flex" }}>
                    <CheckCircle2 size={15} />
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                    Human Verification Boundary
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  AI recommendations and camera scans require explicit pharmacist verification before altering database inventory.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
