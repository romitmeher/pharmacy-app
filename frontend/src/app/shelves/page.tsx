"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getShelfLayout,
  locateMedicineOnShelves,
  getStorageComplianceAlerts,
  submitShelfCycleCount,
  PlanogramResponseData,
  ShelfLocationDetailData,
  DispensePickLocationData,
  StorageComplianceAlertData,
  ShelfAuditReportData,
} from "@/lib/api";

type ShelfTabMode = "planogram" | "dispense" | "compliance" | "cyclecount";

export default function ShelvesPage() {
  const [activeTab, setActiveTab] = useState<ShelfTabMode>("planogram");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Planogram state
  const [planogram, setPlanogram] = useState<PlanogramResponseData | null>(null);
  const [selectedShelf, setSelectedShelf] = useState<ShelfLocationDetailData | null>(null);

  // Fast Dispense Locator state
  const [searchMedId, setSearchMedId] = useState<number>(1);
  const [dispensePicks, setDispensePicks] = useState<DispensePickLocationData[]>([]);
  const [locating, setLocating] = useState<boolean>(false);

  // Compliance alerts state
  const [complianceAlerts, setComplianceAlerts] = useState<StorageComplianceAlertData[]>([]);

  // Cycle Count Audit Tool state
  const [auditLocationId, setAuditLocationId] = useState<number>(1);
  const [auditScannedQty, setAuditScannedQty] = useState<number>(50);
  const [auditReport, setAuditReport] = useState<ShelfAuditReportData | null>(null);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [reconcileSuccess, setReconcileSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAllShelfData();
  }, []);

  const loadAllShelfData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [layout, alerts] = await Promise.all([
        getShelfLayout(),
        getStorageComplianceAlerts(),
      ]);
      setPlanogram(layout);
      setComplianceAlerts(alerts.alerts);

      if (layout.shelves.length > 0) {
        setSelectedShelf(layout.shelves[0]);
        setAuditLocationId(layout.shelves[0].location_id);
      }

      // Initial fast locate for medicine #1
      handleLocateMedicine(1);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load shelf intelligence data.");
    } finally {
      setLoading(false);
    }
  };

  const handleLocateMedicine = async (medId: number) => {
    setLocating(true);
    try {
      const res = await locateMedicineOnShelves(medId);
      setDispensePicks(res.pick_locations);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLocating(false);
    }
  };

  const handleRunCycleCount = async (applyAdjustments: boolean) => {
    setAuditing(true);
    setReconcileSuccess(null);
    try {
      // Create count for first item on the selected shelf or placeholder
      const shelf = planogram?.shelves.find((s) => s.location_id === auditLocationId);
      const firstItem = shelf?.items[0];
      const medId = firstItem ? firstItem.medicine_id : 1;
      const bNum = firstItem ? firstItem.batch_number : "LIVE-B20260913-01";

      const report = await submitShelfCycleCount(
        auditLocationId,
        [
          {
            medicine_id: medId,
            batch_number: bNum,
            scanned_quantity: auditScannedQty,
          },
        ],
        applyAdjustments,
        applyAdjustments ? "Manager approved physical cycle count adjustment" : "Routine inspection"
      );

      setAuditReport(report);

      if (applyAdjustments) {
        setReconcileSuccess(
          `Reconciliation committed! Stock updated to ${auditScannedQty} units with audit reason logged.`
        );
        // Refresh planogram
        const updated = await getShelfLayout();
        setPlanogram(updated);
      }
    } catch (err: any) {
      alert("Cycle count audit failed: " + err.message);
    } finally {
      setAuditing(false);
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
                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "1.2rem",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
            >
              🗄️
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.15rem", letterSpacing: "-0.02em" }}>
                SmartPharm <span style={{ color: "#0284c7" }}>Shelves</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Phase 6: Shelf & Location Planogram Operating System
              </div>
            </div>
          </Link>
        </div>

        {/* Global Navigation Links */}
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
            Receiving
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
          <Link
            href="/intelligence"
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
            ML Engine
          </Link>
          <div
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "var(--radius-md)",
              background: "#e0f2fe",
              color: "#0369a1",
              border: "1px solid #bae6fd",
              fontSize: "0.8rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#0284c7" }} />
            Planogram Live
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main style={{ flex: 1, padding: "2rem 2.5rem", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Title & Summary */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-heading)", margin: "0 0 0.5rem 0" }}>
            Pharmacy Shelf & Location Operating System
          </h1>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Interactive 2D physical planograms, rapid dispense coordinate guidance, cold-chain temperature safeguarding, and physical cycle counting.
          </p>
        </div>

        {/* Global Storage KPI Bar */}
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
              Total Storage Capacity
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0284c7", marginTop: "0.4rem" }}>
              {planogram?.summary.total_capacity_units ?? 0} <span style={{ fontSize: "1rem" }}>units</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Across {planogram?.summary.total_locations ?? 0} physical racks and shelves
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
              Occupied Inventory
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#059669", marginTop: "0.4rem" }}>
              {planogram?.summary.total_occupied_units ?? 0} <span style={{ fontSize: "1rem" }}>units</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Store Utilization: <strong>{planogram?.summary.store_utilization_pct ?? 0}%</strong>
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
              Cold-Chain & Climate Alerts
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: complianceAlerts.length > 0 ? "#dc2626" : "#059669", marginTop: "0.4rem" }}>
              {complianceAlerts.length}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              {complianceAlerts.length > 0 ? "Storage discrepancies require transfer" : "All medicines in proper climate zones"}
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
              Fast Dispense Coordinate System
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-heading)", marginTop: "0.75rem" }}>
              Aisle • Rack • Tier • Bin
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Automated FEFO picking routing
            </div>
          </div>
        </div>

        {/* Tab Selector */}
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
            onClick={() => setActiveTab("planogram")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "planogram" ? "#0284c7" : "transparent",
              color: activeTab === "planogram" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            🗺️ Visual Planogram Map
          </button>
          <button
            onClick={() => setActiveTab("dispense")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "dispense" ? "#0284c7" : "transparent",
              color: activeTab === "dispense" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            ⚡ Fast Dispense Locator
          </button>
          <button
            onClick={() => setActiveTab("compliance")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "compliance" ? "#0284c7" : "transparent",
              color: activeTab === "compliance" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            ❄️ Cold-Chain Compliance ({complianceAlerts.length})
          </button>
          <button
            onClick={() => setActiveTab("cyclecount")}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: activeTab === "cyclecount" ? "#0284c7" : "transparent",
              color: activeTab === "cyclecount" ? "#ffffff" : "var(--text-muted)",
              transition: "all 0.15s ease",
            }}
          >
            📋 Shelf Cycle Count Tool
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
            Loading physical storage planogram...
          </div>
        )}

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

        {/* TAB 1: Visual Planogram Map */}
        {!loading && activeTab === "planogram" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
            {/* Shelf Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-heading)" }}>
                Physical Storage Units & Racks
              </div>

              {planogram?.shelves.map((shelf) => {
                const isSelected = selectedShelf?.location_id === shelf.location_id;
                const isFridge = shelf.climate_zone === "COLD_CHAIN_FRIDGE";
                const isDrawer = shelf.climate_zone === "SECURE_DRAWER";

                return (
                  <div
                    key={shelf.location_id}
                    onClick={() => setSelectedShelf(shelf)}
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-lg)",
                      padding: "1.25rem",
                      border: `2px solid ${isSelected ? "#0284c7" : "var(--border-subtle)"}`,
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 4px 12px rgba(2, 132, 199, 0.15)" : "var(--shadow-sm)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontSize: "1.2rem" }}>
                            {isFridge ? "❄️" : isDrawer ? "🔒" : "🗄️"}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-heading)" }}>
                            {shelf.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              background: isFridge ? "#e0f2fe" : isDrawer ? "#fef3c7" : "var(--bg-app)",
                              color: isFridge ? "#0369a1" : isDrawer ? "#92400e" : "var(--text-muted)",
                            }}
                          >
                            {shelf.climate_zone}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                          Coordinates: <code>{shelf.coordinate_code}</code> • Level: {shelf.shelf_level}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0284c7" }}>
                          {shelf.current_occupied_units} / {shelf.capacity_units}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {shelf.utilization_pct}% occupied
                        </div>
                      </div>
                    </div>

                    {/* Capacity Progress Bar */}
                    <div style={{ height: 6, background: "var(--bg-app)", borderRadius: 3, marginTop: "0.75rem", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, shelf.utilization_pct)}%`,
                          background: shelf.utilization_pct > 90 ? "#dc2626" : shelf.utilization_pct > 70 ? "#ea580c" : "#0284c7",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Shelf Details Drawer */}
            <div
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
              {selectedShelf ? (
                <>
                  <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "1rem" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      Physical Shelf Contents
                    </div>
                    <h3 style={{ margin: "0.25rem 0", fontSize: "1.3rem", fontWeight: 800, color: "var(--text-heading)" }}>
                      {selectedShelf.name}
                    </h3>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Coordinate Code: <strong>{selectedShelf.coordinate_code}</strong> | Zone: <strong>{selectedShelf.climate_zone}</strong>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {selectedShelf.items.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                        No batches currently stored on this shelf.
                      </div>
                    ) : (
                      selectedShelf.items.map((it) => (
                        <div
                          key={it.inventory_id}
                          style={{
                            background: "var(--bg-app)",
                            padding: "1rem",
                            borderRadius: "var(--radius-md)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, color: "var(--text-heading)" }}>
                              {it.brand_name} {it.strength ? `(${it.strength})` : ""}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                              Batch: {it.batch_number} • Exp: {it.expiry_date} ({it.days_to_expiry}d left)
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--primary)" }}>
                              {it.quantity_available} <span style={{ fontSize: "0.8rem" }}>units</span>
                            </div>
                            {it.days_to_expiry <= 30 && (
                              <span style={{ fontSize: "0.7rem", color: "#dc2626", fontWeight: 700 }}>
                                NEAR EXPIRY
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                  Select a shelf to inspect stored items.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Fast Dispense Locator */}
        {!loading && activeTab === "dispense" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Search Box */}
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                padding: "1.25rem",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                gap: "1rem",
                alignItems: "center",
              }}
            >
              <label style={{ fontWeight: 700, fontSize: "0.95rem" }}>Select Product to Locate:</label>
              <select
                value={searchMedId}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setSearchMedId(id);
                  handleLocateMedicine(id);
                }}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  minWidth: 280,
                }}
              >
                <option value={1}>Crocin 650 (Store #1)</option>
                <option value={2}>Dolo 650</option>
                <option value={3}>Lantus Solostar (Insulin)</option>
              </select>

              <button
                onClick={() => handleLocateMedicine(searchMedId)}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Find Physical Coordinates 🔍
              </button>
            </div>

            {/* Locator Guidance Cards */}
            {locating ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>Locating coordinates...</div>
            ) : dispensePicks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                No active stock found on physical shelves for this product.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {dispensePicks.map((pick, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-lg)",
                      padding: "1.5rem",
                      border: `2px solid ${pick.is_fefo_priority ? "#10b981" : "var(--border-subtle)"}`,
                      boxShadow: "var(--shadow-sm)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-heading)" }}>
                          {pick.brand_name} {pick.strength || ""}
                        </span>
                        {pick.is_fefo_priority && (
                          <span
                            style={{
                              background: "#ecfdf5",
                              color: "#059669",
                              border: "1px solid #a7f3d0",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              padding: "0.25rem 0.6rem",
                              borderRadius: "999px",
                            }}
                          >
                            ✓ PRIMARY FEFO PICK
                          </span>
                        )}
                        <span
                          style={{
                            background: pick.climate_zone === "COLD_CHAIN_FRIDGE" ? "#e0f2fe" : "var(--bg-app)",
                            color: pick.climate_zone === "COLD_CHAIN_FRIDGE" ? "#0369a1" : "var(--text-muted)",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                          }}
                        >
                          {pick.climate_zone}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          color: "#0284c7",
                          marginTop: "0.5rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span>🧭 Route:</span>
                        <span>{pick.directional_guide}</span>
                      </div>

                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        Shelf: <strong>{pick.location_name}</strong> • Coordinate: <code>{pick.coordinate_code}</code> • Batch: <code>{pick.batch_number}</code> (Exp: {pick.expiry_date})
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Available at this Slot
                      </div>
                      <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary)" }}>
                        {pick.quantity_available} <span style={{ fontSize: "0.9rem" }}>units</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Cold-Chain & Storage Compliance Alerts */}
        {!loading && activeTab === "compliance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {complianceAlerts.length === 0 ? (
              <div
                style={{
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-lg)",
                  padding: "3rem",
                  textAlign: "center",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>❄️</div>
                <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#059669" }}>
                  100% Cold-Chain & Storage Compliant
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
                  No refrigerated medicines detected on ambient shelving, and no capacity overflows detected.
                </div>
              </div>
            ) : (
              complianceAlerts.map((alert) => {
                const isCritical = alert.severity === "CRITICAL_VIOLATION";
                return (
                  <div
                    key={alert.alert_id}
                    style={{
                      background: "var(--bg-surface)",
                      borderRadius: "var(--radius-lg)",
                      padding: "1.5rem",
                      border: `1px solid ${isCritical ? "#fca5a5" : "#fed7aa"}`,
                      boxShadow: "var(--shadow-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "1.5rem" }}>{isCritical ? "🚨" : "⚠️"}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: "1.1rem", color: isCritical ? "#991b1b" : "#9a3412" }}>
                            {alert.issue_title}
                          </div>
                          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                            Location: <strong>{alert.location_name}</strong> • Units Affected: <strong>{alert.units_affected}</strong>
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          padding: "0.25rem 0.6rem",
                          borderRadius: "999px",
                          background: isCritical ? "#fee2e2" : "#ffedd5",
                          color: isCritical ? "#991b1b" : "#9a3412",
                        }}
                      >
                        {alert.severity}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {alert.description}
                    </div>

                    <div
                      style={{
                        padding: "0.75rem 1rem",
                        background: isCritical ? "#fef2f2" : "#fffbeb",
                        borderRadius: "var(--radius-md)",
                        fontSize: "0.85rem",
                        color: isCritical ? "#991b1b" : "#92400e",
                        fontWeight: 600,
                      }}
                    >
                      🎯 <strong>Required Action:</strong> {alert.action_required}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: Shelf Cycle Count Audit Tool */}
        {!loading && activeTab === "cyclecount" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-heading)" }}>
                Conduct Shelf Cycle Count Audit
              </div>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    Select Shelf Location:
                  </label>
                  <select
                    value={auditLocationId}
                    onChange={(e) => setAuditLocationId(parseInt(e.target.value, 10))}
                    style={{
                      padding: "0.6rem 1rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                      fontWeight: 600,
                      minWidth: 240,
                    }}
                  >
                    {planogram?.shelves.map((s) => (
                      <option key={s.location_id} value={s.location_id}>
                        {s.name} ({s.current_occupied_units} units)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    Physically Counted Units:
                  </label>
                  <input
                    type="number"
                    value={auditScannedQty}
                    onChange={(e) => setAuditScannedQty(parseInt(e.target.value, 10) || 0)}
                    style={{
                      padding: "0.6rem 1rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                      fontWeight: 600,
                      width: 160,
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.2rem" }}>
                  <button
                    disabled={auditing}
                    onClick={() => handleRunCycleCount(false)}
                    style={{
                      padding: "0.6rem 1.25rem",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                      background: "var(--bg-app)",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {auditing ? "Auditing..." : "Preview Discrepancies 🔍"}
                  </button>
                  <button
                    disabled={auditing}
                    onClick={() => handleRunCycleCount(true)}
                    style={{
                      padding: "0.6rem 1.5rem",
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      background: "#0284c7",
                      color: "#ffffff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {auditing ? "Reconciling..." : "Authorize Reconciliation & Log Audit 📝"}
                  </button>
                </div>
              </div>

              {reconcileSuccess && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  ✓ {reconcileSuccess}
                </div>
              )}
            </div>

            {/* Audit Results Table */}
            {auditReport && (
              <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
                      Audit Report: {auditReport.location_name}
                    </h3>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Status: {auditReport.is_committed ? "Committed & Reconciled" : "Non-destructive Preview"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem", color: auditReport.net_variance_units < 0 ? "#dc2626" : "#059669" }}>
                      Net Variance: {auditReport.net_variance_units > 0 ? "+" : ""}{auditReport.net_variance_units} units
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Financial Impact: ₹{auditReport.net_financial_variance}
                    </div>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-app)", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", color: "var(--text-muted)" }}>
                      <th style={{ padding: "1rem" }}>Medicine & Batch</th>
                      <th style={{ padding: "1rem" }}>Expected Units</th>
                      <th style={{ padding: "1rem" }}>Scanned Units</th>
                      <th style={{ padding: "1rem" }}>Variance</th>
                      <th style={{ padding: "1rem" }}>Variance State</th>
                      <th style={{ padding: "1rem" }}>Unit Cost</th>
                      <th style={{ padding: "1rem" }}>Financial Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditReport.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "1rem", fontWeight: 700 }}>
                          {it.brand_name}
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                            Batch: {it.batch_number}
                          </div>
                        </td>
                        <td style={{ padding: "1rem" }}>{it.expected_units}</td>
                        <td style={{ padding: "1rem", fontWeight: 700 }}>{it.scanned_units}</td>
                        <td style={{ padding: "1rem", fontWeight: 700, color: it.variance_units < 0 ? "#dc2626" : it.variance_units > 0 ? "#059669" : "inherit" }}>
                          {it.variance_units > 0 ? `+${it.variance_units}` : it.variance_units}
                        </td>
                        <td style={{ padding: "1rem" }}>
                          <span
                            style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: it.variance_state === "MATCHED" ? "#ecfdf5" : it.variance_state === "DEFICIT" ? "#fee2e2" : "#fef3c7",
                              color: it.variance_state === "MATCHED" ? "#059669" : it.variance_state === "DEFICIT" ? "#991b1b" : "#92400e",
                            }}
                          >
                            {it.variance_state}
                          </span>
                        </td>
                        <td style={{ padding: "1rem" }}>₹{it.unit_cost.toFixed(2)}</td>
                        <td style={{ padding: "1rem", fontWeight: 700 }}>₹{it.financial_impact.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
