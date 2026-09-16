"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getReorderRecommendations,
  getStockOutRisks,
  getExpiryPredictions,
  getDemandForecast,
  createReorderDraftPO,
  ReorderRecommendationItem,
  ReorderRecommendationsResponseData,
  StockOutPredictionItem,
  StockOutRisksResponseData,
  BatchExpiryPredictionItem,
  ExpiryPredictionsResponseData,
  DemandForecastData,
} from "@/lib/api";

type TabMode = "reorder" | "stockout" | "expiry" | "forecasting";

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<TabMode>("reorder");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [reorderData, setReorderData] = useState<ReorderRecommendationsResponseData | null>(null);
  const [stockoutData, setStockoutData] = useState<StockOutRisksResponseData | null>(null);
  const [expiryData, setExpiryData] = useState<ExpiryPredictionsResponseData | null>(null);

  // Forecasting state
  const [selectedMedId, setSelectedMedId] = useState<number>(1);
  const [forecastHorizon, setForecastHorizon] = useState<number>(14);
  const [forecastData, setForecastData] = useState<DemandForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState<boolean>(false);

  // 1-Click PO Draft Generation State
  const [poDraftModalItem, setPoDraftModalItem] = useState<ReorderRecommendationItem | null>(null);
  const [poGenerating, setPoGenerating] = useState<boolean>(false);
  const [poSuccessMessage, setPoSuccessMessage] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    loadAllIntelligence();
  }, []);

  const loadAllIntelligence = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reorders, stockouts, expiries] = await Promise.all([
        getReorderRecommendations(50),
        getStockOutRisks(50),
        getExpiryPredictions(180, 50),
      ]);
      setReorderData(reorders);
      setStockoutData(stockouts);
      setExpiryData(expiries);

      // Load initial forecast
      if (reorders.recommendations.length > 0) {
        const initialMedId = reorders.recommendations[0].medicine_id;
        setSelectedMedId(initialMedId);
        loadForecast(initialMedId, forecastHorizon);
      } else if (stockouts.predictions.length > 0) {
        const initialMedId = stockouts.predictions[0].medicine_id;
        setSelectedMedId(initialMedId);
        loadForecast(initialMedId, forecastHorizon);
      } else {
        loadForecast(1, forecastHorizon);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load ML intelligence data.");
    } finally {
      setLoading(false);
    }
  };

  const loadForecast = async (medId: number, horizon: number) => {
    setForecastLoading(true);
    try {
      const data = await getDemandForecast(medId, horizon);
      setForecastData(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setForecastLoading(false);
    }
  };

  const handleCreateDraftPO = async () => {
    if (!poDraftModalItem) return;
    setPoGenerating(true);
    setPoSuccessMessage(null);
    try {
      const supplierId = poDraftModalItem.preferred_supplier_id || 1;
      const res = await createReorderDraftPO(
        supplierId,
        [
          {
            medicine_id: poDraftModalItem.medicine_id,
            quantity: poDraftModalItem.recommended_order_quantity,
            purchase_rate: poDraftModalItem.estimated_purchase_rate,
          },
        ],
        `Automated ML Draft PO for ${poDraftModalItem.brand_name} (Urgency: ${poDraftModalItem.urgency})`
      );

      setPoSuccessMessage(
        `Draft PO #${res.invoice_number} created successfully! (Status: ${res.status.toUpperCase()}). Human review boundary maintained - no physical stock mutated.`
      );

      // Refresh reorders to show updated pipeline orders
      const updated = await getReorderRecommendations(50);
      setReorderData(updated);
    } catch (err: any) {
      alert("Failed to generate draft PO: " + err.message);
    } finally {
      setPoGenerating(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, #0d9488, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "1.2rem",
                boxShadow: "0 2px 6px rgba(13, 148, 136, 0.3)",
              }}
            >
              +
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.02em" }}>
                SmartPharm <span style={{ color: "var(--primary)" }}>Intelligence</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Phase 5: Predictive ML Engine (PRD Rules 15, 16, 17, 18)
              </div>
            </div>
          </Link>
        </div>

        {/* Global Nav Links */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link
            href="/"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            Overview
          </Link>
          <Link
            href="/vision"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            Vision POS
          </Link>
          <Link
            href="/distributor"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            Distributor
          </Link>
          <Link
            href="/copilot"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            AI Copilot
          </Link>
          <Link
            href="/prescriptions"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            Rx Scanner
          </Link>
          <div
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "var(--radius-md)",
              background: "#ecfdf5",
              color: "#059669",
              border: "1px solid #a7f3d0",
              fontSize: "0.8rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            ML Live
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main style={{ flex: 1, padding: "2rem 2.5rem", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Page Title & KPI Bar */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-heading)", margin: "0 0 0.5rem 0" }}>
            Pharmacy Machine Learning Operating System
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Real-time statistical & autoregressive intelligence powering demand forecasting, stock-out runway monitoring, unsold expiry risk, and explainable reorders.
          </p>
        </div>

        {/* Global ML KPI Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.25rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "1.25rem",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Actionable Reorders (Rule 18)
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#2563eb", marginTop: "0.4rem" }}>
              {reorderData?.summary.actionable_items_count ?? 0}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Est. Investment: <strong>₹{reorderData?.summary.estimated_total_investment.toLocaleString() ?? 0}</strong>
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "1.25rem",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Critical Stock-Outs (Rule 17)
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#dc2626", marginTop: "0.4rem" }}>
              {stockoutData?.summary.critical_risks ?? 0}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              High Risk: {stockoutData?.summary.high_risks ?? 0} | Monitored: {stockoutData?.summary.total_monitored ?? 0}
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "1.25rem",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Unsold Expiry Exposure (Rule 15)
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#d97706", marginTop: "0.4rem" }}>
              ₹{expiryData?.summary.total_financial_loss_exposure.toLocaleString() ?? 0}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              High Risk Batches: {expiryData?.summary.high_risk_count ?? 0}
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: "1.25rem",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              ML Forecasting Engine (Rule 16)
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#059669", marginTop: "0.75rem" }}>
              Autoregressive Ridge
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Adaptive baseline + 7/14/30d horizons
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            background: "var(--bg-surface)",
            padding: "0.5rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            marginBottom: "1.5rem",
          }}
        >
          <button
            onClick={() => setActiveTab("reorder")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "reorder" ? "var(--primary)" : "transparent",
              color: activeTab === "reorder" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            📦 Smart Reorder (Rule 18)
          </button>
          <button
            onClick={() => setActiveTab("stockout")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "stockout" ? "var(--primary)" : "transparent",
              color: activeTab === "stockout" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            ⚠️ Stock-Out Runway (Rule 17)
          </button>
          <button
            onClick={() => setActiveTab("expiry")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "expiry" ? "var(--primary)" : "transparent",
              color: activeTab === "expiry" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            ⏳ Expiry Risk & Loss (Rule 15)
          </button>
          <button
            onClick={() => setActiveTab("forecasting")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "forecasting" ? "var(--primary)" : "transparent",
              color: activeTab === "forecasting" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            📈 Demand Forecasting (Rule 16)
          </button>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-muted)" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 600 }}>Analyzing store inventory & training models...</div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "1rem",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.5rem",
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* TAB 1: Smart Reorder Recommendations (PRD Rule 18) */}
        {!loading && activeTab === "reorder" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "var(--radius-md)",
                padding: "1rem 1.25rem",
                color: "#1e40af",
                fontSize: "0.875rem",
                lineHeight: 1.5,
              }}
            >
              <strong>PRD Rule 18 Formula:</strong> Order Qty = max(0, (Daily Forecast × (Lead Time + Review Period)) + Safety Stock - Current Inventory - Open Orders).
              <br />
              <span style={{ color: "#3b82f6" }}>
                Strict Human-in-the-Loop boundary: Clicking "Generate PO Draft" creates a verified DRAFT invoice for review. It does NOT automatically mutate inventory or order from distributors.
              </span>
            </div>

            {reorderData?.recommendations.length === 0 ? (
              <div
                style={{
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-lg)",
                  padding: "3rem",
                  textAlign: "center",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>All Inventory Levels Optimal</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                  Current stock and pipeline purchase orders adequately satisfy lead time demand and safety buffers.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {reorderData?.recommendations.map((rec) => (
                  <div
                    key={rec.medicine_id}
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-lg)",
                      padding: "1.5rem",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-heading)" }}>
                            {rec.brand_name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.6rem",
                              borderRadius: "999px",
                              background:
                                rec.urgency === "CRITICAL"
                                  ? "#fee2e2"
                                  : rec.urgency === "HIGH"
                                  ? "#ffedd5"
                                  : "#fef9c3",
                              color:
                                rec.urgency === "CRITICAL"
                                  ? "#991b1b"
                                  : rec.urgency === "HIGH"
                                  ? "#9a3412"
                                  : "#854d0e",
                            }}
                          >
                            {rec.urgency} URGENCY
                          </span>
                          {rec.category && (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>({rec.category})</span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                          Preferred Supplier: <strong>{rec.preferred_supplier_name || "Unassigned Distributor"}</strong> • Est. Rate: ₹{rec.estimated_purchase_rate.toFixed(2)}/unit
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                          Recommended Order
                        </div>
                        <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary)" }}>
                          {rec.recommended_order_quantity} <span style={{ fontSize: "0.9rem" }}>units</span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Est. Total: ₹{rec.estimated_total_cost.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Mathematical Formula Breakdown Grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: "0.75rem",
                        background: "var(--bg-app)",
                        padding: "1rem",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Current Stock</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-heading)" }}>{rec.current_stock}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Open Draft POs</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>{rec.open_po_quantity}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Daily Velocity</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-heading)" }}>{rec.forecasted_daily_demand.toFixed(1)}/d</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Lead Time (L)</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-heading)" }}>{rec.supplier_lead_time_days} days</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Review Cycle (R)</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-heading)" }}>{rec.review_period_days} days</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Target Stock</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#059669" }}>{rec.target_stock_level}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Net Deficit</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#dc2626" }}>{rec.net_deficit.toFixed(0)}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic", maxWidth: "70%" }}>
                        💡 {rec.explanation}
                      </div>
                      <button
                        onClick={() => {
                          setPoDraftModalItem(rec);
                          setPoSuccessMessage(null);
                        }}
                        style={{
                          padding: "0.6rem 1.25rem",
                          borderRadius: "var(--radius-md)",
                          border: "none",
                          background: "var(--primary)",
                          color: "#ffffff",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          boxShadow: "0 2px 4px rgba(13, 148, 136, 0.2)",
                        }}
                      >
                        1-Click PO Draft 📝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Stock-Out Probability & Runway (PRD Rule 17) */}
        {!loading && activeTab === "stockout" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: "var(--radius-md)",
                padding: "1rem 1.25rem",
                color: "#92400e",
                fontSize: "0.875rem",
                lineHeight: 1.5,
              }}
            >
              <strong>PRD Rule 17 Runway Reasoning:</strong> Evaluates active on-hand inventory against current sales velocity and distributor replenishment lead times.
              Runway = Current Stock ÷ Daily Velocity.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem" }}>
              {stockoutData?.predictions.map((p) => {
                const isCritical = p.risk_level === "CRITICAL";
                const isHigh = p.risk_level === "HIGH_RISK";
                const isMedium = p.risk_level === "MEDIUM_RISK";

                const badgeColor = isCritical ? "#dc2626" : isHigh ? "#ea580c" : isMedium ? "#d97706" : "#059669";
                const badgeBg = isCritical ? "#fee2e2" : isHigh ? "#ffedd5" : isMedium ? "#fef3c7" : "#ecfdf5";

                return (
                  <div
                    key={p.medicine_id}
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-lg)",
                      padding: "1.5rem",
                      border: `1px solid ${isCritical ? "#fca5a5" : "var(--border-subtle)"}`,
                      boxShadow: "var(--shadow-sm)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "var(--text-heading)" }}>
                            {p.brand_name}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            Velocity: {p.predicted_daily_demand} units/day • Safety Buffer: {p.safety_stock_units}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            padding: "0.25rem 0.65rem",
                            borderRadius: "999px",
                            background: badgeBg,
                            color: badgeColor,
                          }}
                        >
                          {p.risk_level}
                        </span>
                      </div>

                      {/* Runway Progress Bar */}
                      <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                          <span>Stock Runway:</span>
                          <span style={{ color: badgeColor }}>
                            {p.runway_days > 100 ? "100+ days" : `${p.runway_days.toFixed(1)} days remaining`}
                          </span>
                        </div>
                        <div style={{ height: 8, background: "var(--bg-app)", borderRadius: 4, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(100, (p.runway_days / 14) * 100)}%`,
                              background: badgeColor,
                              borderRadius: 4,
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                          Lead Time Threshold: {p.supplier_lead_time_days} days | Current Stock: <strong>{p.current_stock} units</strong>
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--bg-app)",
                          padding: "0.75rem",
                          borderRadius: "var(--radius-md)",
                          fontSize: "0.8rem",
                          color: "var(--text-muted)",
                          marginBottom: "1rem",
                        }}
                      >
                        <strong>Explanation:</strong> {p.explanation}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "0.75rem",
                        background: isCritical ? "#fef2f2" : "#f0fdf4",
                        border: `1px solid ${isCritical ? "#fecaca" : "#bbf7d0"}`,
                        borderRadius: "var(--radius-md)",
                        fontSize: "0.8rem",
                        color: isCritical ? "#991b1b" : "#166534",
                        fontWeight: 600,
                      }}
                    >
                      🎯 <strong>Action:</strong> {p.recommended_action}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Expiry Risk & Unsold Loss Predictor (PRD Rule 15) */}
        {!loading && activeTab === "expiry" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "var(--radius-md)",
                padding: "1rem 1.25rem",
                color: "#991b1b",
                fontSize: "0.875rem",
                lineHeight: 1.5,
              }}
            >
              <strong>PRD Rule 15 Distinction:</strong> Passive Expiry Date Tracking ≠ Expiry Risk ML Prediction.
              <br />
              This engine computes whether inventory in earlier FEFO positions will sell through before expiration based on daily sales velocity. Financial loss reflects actual cost of projected unsold units.
            </div>

            <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "1rem" }}>Medicine & Batch</th>
                    <th style={{ padding: "1rem" }}>Expiry Date</th>
                    <th style={{ padding: "1rem" }}>On-Hand</th>
                    <th style={{ padding: "1rem" }}>Est. Sales Before Exp</th>
                    <th style={{ padding: "1rem" }}>Unsold Units at Risk</th>
                    <th style={{ padding: "1rem" }}>Loss Exposure</th>
                    <th style={{ padding: "1rem" }}>Sell-Through %</th>
                    <th style={{ padding: "1rem" }}>Action Suggestion</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryData?.predictions.map((p) => {
                    const isHigh = p.risk_category === "HIGH_RISK" || p.risk_category === "CRITICAL_EXPIRED";
                    return (
                      <tr
                        key={p.batch_id}
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                          background: isHigh ? "#fff7f7" : "transparent",
                        }}
                      >
                        <td style={{ padding: "1rem", fontWeight: 700, color: "var(--text-heading)" }}>
                          {p.brand_name}
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                            Batch: {p.batch_number}
                          </div>
                        </td>
                        <td style={{ padding: "1rem" }}>
                          <span style={{ fontWeight: 600 }}>{p.expiry_date}</span>
                          <div style={{ fontSize: "0.75rem", color: p.days_to_expiry <= 30 ? "#dc2626" : "var(--text-muted)" }}>
                            {p.days_to_expiry <= 0 ? "EXPIRED" : `in ${p.days_to_expiry} days`}
                          </div>
                        </td>
                        <td style={{ padding: "1rem", fontWeight: 600 }}>{p.quantity_in_stock}</td>
                        <td style={{ padding: "1rem", color: "#059669", fontWeight: 600 }}>
                          {p.projected_units_sold_before_expiry} units
                        </td>
                        <td style={{ padding: "1rem", color: isHigh ? "#dc2626" : "inherit", fontWeight: 700 }}>
                          {p.projected_unsold_units_at_expiry} units
                        </td>
                        <td style={{ padding: "1rem", fontWeight: 800, color: isHigh ? "#dc2626" : "inherit" }}>
                          ₹{p.financial_risk_amount.toLocaleString()}
                        </td>
                        <td style={{ padding: "1rem" }}>
                          <div style={{ fontWeight: 700, color: p.sell_through_probability_pct > 80 ? "#059669" : "#dc2626" }}>
                            {p.sell_through_probability_pct}%
                          </div>
                        </td>
                        <td style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: 220 }}>
                          {p.recommendation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Demand Forecasting Engine (PRD Rule 16) */}
        {!loading && activeTab === "forecasting" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Forecast Controls Bar */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "1.25rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <label style={{ fontWeight: 700, fontSize: "0.9rem" }}>Select Product:</label>
                <select
                  value={selectedMedId}
                  onChange={(e) => {
                    const id = parseInt(e.target.value, 10);
                    setSelectedMedId(id);
                    loadForecast(id, forecastHorizon);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                  }}
                >
                  <option value={1}>Crocin 650 (Store #1)</option>
                  {reorderData?.recommendations.map((r) => (
                    <option key={r.medicine_id} value={r.medicine_id}>
                      {r.brand_name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>Forecast Horizon:</span>
                {[7, 14, 30].map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setForecastHorizon(h);
                      loadForecast(selectedMedId, h);
                    }}
                    style={{
                      padding: "0.4rem 0.9rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                      background: forecastHorizon === h ? "var(--primary)" : "var(--bg-app)",
                      color: forecastHorizon === h ? "#ffffff" : "var(--text-heading)",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    {h} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Forecast Model Details Card */}
            {forecastLoading ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>Simulating time-series trajectories...</div>
            ) : forecastData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: "var(--radius-lg)",
                    padding: "1.5rem",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "var(--shadow-sm)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1.5rem",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Model Architecture</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--primary)" }}>{forecastData.model_family}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Historical Series: {forecastData.historical_sales_days_count} daily checkpoints
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Avg Daily Velocity</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-heading)" }}>
                      {forecastData.average_daily_demand.toFixed(2)} units/day
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Horizon Forecast Total</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#2563eb" }}>
                      {forecastData.total_forecasted_demand.toFixed(0)} units
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Evaluation Metrics</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-heading)" }}>
                      MAE: {forecastData.evaluation_metrics.mae} | RMSE: {forecastData.evaluation_metrics.rmse}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#059669" }}>Scikit-learn time-series validated</div>
                  </div>
                </div>

                {/* Day-by-Day Forecast Visual Matrix */}
                <div
                  style={{
                    background: "var(--bg-surface)",
                    borderRadius: "var(--radius-lg)",
                    padding: "1.5rem",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 800, color: "var(--text-heading)" }}>
                    Daily Demand Trajectory & 95% Confidence Intervals
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(auto-fit, minmax(80px, 1fr))`,
                      gap: "0.75rem",
                      alignItems: "flex-end",
                      minHeight: 180,
                      padding: "1rem 0",
                    }}
                  >
                    {forecastData.daily_forecasts.map((pt, idx) => {
                      const maxUnits = Math.max(...forecastData.daily_forecasts.map((f) => f.predicted_units), 5);
                      const barHeightPct = Math.min(100, Math.max(15, (pt.predicted_units / maxUnits) * 100));

                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "0.4rem",
                            height: "100%",
                            justifyContent: "flex-end",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--primary)" }}>
                            {pt.predicted_units.toFixed(1)}
                          </div>
                          <div
                            style={{
                              width: "100%",
                              maxWidth: 36,
                              height: `${barHeightPct}%`,
                              background: "linear-gradient(180deg, #0d9488, #0f766e)",
                              borderRadius: "4px 4px 0 0",
                              transition: "height 0.3s ease",
                            }}
                            title={`Date: ${pt.date} | Predicted: ${pt.predicted_units} units | Confidence: [${pt.lower_bound} - ${pt.upper_bound}]`}
                          />
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
                            <div style={{ fontWeight: 700 }}>{pt.day_of_week}</div>
                            <div>{pt.date.slice(5)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 1-Click Draft PO Generation Modal (Strict PRD Rule 18 Human Review Boundary) */}
        {poDraftModalItem && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "var(--radius-lg)",
                padding: "2rem",
                maxWidth: 540,
                width: "100%",
                boxShadow: "var(--shadow-lg)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--text-heading)" }}>
                  Create Distributor Draft PO
                </h3>
                <button
                  onClick={() => setPoDraftModalItem(null)}
                  style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--text-muted)" }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  background: "#eff6ff",
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.85rem",
                  color: "#1e40af",
                  marginBottom: "1.25rem",
                }}
              >
                🔒 <strong>Human-in-the-Loop Boundary:</strong> This action creates an official <strong>DRAFT</strong> purchase invoice. No batches are booked and no inventory is mutated until physical delivery verification is completed.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Medicine:</span>
                  <strong>{poDraftModalItem.brand_name}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Recommended Order Qty:</span>
                  <strong>{poDraftModalItem.recommended_order_quantity} units</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Supplier:</span>
                  <strong>{poDraftModalItem.preferred_supplier_name || "Apollo Pharma Distributors"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Est. Unit Rate:</span>
                  <strong>₹{poDraftModalItem.estimated_purchase_rate.toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                  <span style={{ fontWeight: 700 }}>Total Draft Investment:</span>
                  <strong style={{ color: "var(--primary)", fontSize: "1.1rem" }}>
                    ₹{poDraftModalItem.estimated_total_cost.toLocaleString()}
                  </strong>
                </div>
              </div>

              {poSuccessMessage && (
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    marginBottom: "1rem",
                  }}
                >
                  {poSuccessMessage}
                </div>
              )}

              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setPoDraftModalItem(null)}
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    background: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  disabled={poGenerating}
                  onClick={handleCreateDraftPO}
                  style={{
                    padding: "0.6rem 1.5rem",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "var(--primary)",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {poGenerating ? "Generating Draft..." : "Confirm & Create Draft PO 📝"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
