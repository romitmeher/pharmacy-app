"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Clock,
  Bookmark,
  Box,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  File,
  Location,
} from "@duo-icons/react";
import {
  Search,
  X,
  RefreshCw,
  SlidersHorizontal,
  RotateCcw,
  ShieldAlert,
  Calendar,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getExpiryReport,
  adjustStock,
  ExpiryReportItem,
  ExpiryReportResponse,
} from "@/lib/api";

export default function ExpiryManagementPage() {
  const [report, setReport] = useState<ExpiryReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("all");

  // Write-off / adjust modal
  const [adjustingItem, setAdjustingItem] = useState<ExpiryReportItem | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>("");

  const [isSubmitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadExpiryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getExpiryReport();
      setReport(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load regulatory expiry audit report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpiryData();
  }, []);

  const items = report?.items || [];

  // Filtered items
  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const brand = (item.brand_name || "").toLowerCase();
    const generic = (item.generic_name || "").toLowerCase();
    const batch = item.batch_number.toLowerCase();

    const matchesSearch = !q || brand.includes(q) || generic.includes(q) || batch.includes(q);
    const matchesTier = selectedTier === "all" || item.status === selectedTier;

    return matchesSearch && matchesTier;
  });

  // Financial Exposure calculation
  const totalFinancialExposure = items
    .filter((it) => it.status === "critical" || it.status === "expired" || it.status === "warning")
    .reduce((sum, it) => sum + (it.quantity_available * (it.mrp || 0)), 0);

  const handleOpenWriteOff = (item: ExpiryReportItem) => {
    setActionError(null);
    setActionSuccess(null);
    setAdjustingItem(item);
    setAdjustQuantity(0); // Default to writing off / removing expired units
    setAdjustReason(
      item.status === "expired"
        ? "Statutory write-off: Batch expired. Removed from sellable inventory."
        : "Quarantined for distributor return / credit note request."
    );
  };

  const handleConfirmWriteOff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;
    if (!adjustReason.trim()) {
      setActionError("A mandatory audit reason is required for write-off / return.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        await adjustStock({
          inventory_id: adjustingItem.batch_id,
          new_quantity: Number(adjustQuantity),
          reason: adjustReason.trim(),
        });

        setActionSuccess(`Batch ${adjustingItem.batch_number} stock reconciled in audit ledger!`);
        setTimeout(() => {
          setAdjustingItem(null);
          loadExpiryData();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to adjust inventory.");
      }
    });
  };

  const summary = report?.summary || { expired: 0, critical: 0, warning: 0, good: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Expiry Management</h1>
          <p className="page-subtitle">
            Statutory Expiry Tiers • Loss Mitigation • Supplier Returns • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button onClick={loadExpiryData} className="btn btn-secondary">
            <RefreshCw size={15} />
            <span>Refresh Audit</span>
          </button>
          <Link href="/inventory" className="btn btn-primary">
            <Box size={15} />
            <span>Inventory Lots</span>
          </Link>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Regulatory Governance Notice */}
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
          <span style={{ color: "var(--status-med-text)", display: "inline-flex" }}>
            <Clock size={18} />
          </span>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              PRD Rule 15 Statutory Expiry Tiers:
            </strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              Physical lots expiring within 30 days are legally flagged <strong>CRITICAL</strong> and must be segregated
              or prioritized via FEFO; stock within 90 days is marked <strong>WARNING</strong> to trigger supplier return
              agreements.
            </span>
          </div>
        </div>

        {/* 4 Metrics Summary Cards Row */}
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
                Critical (≤ 30 Days)
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Immediate Action</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--status-med-text)" }}>
              {summary.critical}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Lots requiring immediate dispensing or return
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Warning (31 - 90 Days)
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><Clock size={12} /></span>
                <span>FEFO Window</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {summary.warning}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Lots to prioritize in POS dispensing
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Expired Lots
              </span>
              <span className="status-badge low">
                <span className="badge-icon"><AlertOctagon size={12} /></span>
                <span>Zero Sellable</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: summary.expired > 0 ? "var(--status-low-text)" : "var(--text-primary)" }}>
              {summary.expired}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Must be destroyed or returned for credit
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Near-Expiry Value Exposure
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Financial Risk</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              ₹{totalFinancialExposure.toFixed(2)}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Capital tied up in ≤ 90 day lots
            </div>
          </div>
        </div>

        {/* Toolbar with Tier Filters */}
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
                placeholder="Search by brand, generic, or batch code..."
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

            {/* Quick Filter Buttons */}
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <button
                type="button"
                onClick={() => setSelectedTier("all")}
                className={`btn ${selectedTier === "all" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem", padding: "0 0.75rem" }}
              >
                All Lots ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTier("critical")}
                className={`btn ${selectedTier === "critical" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem", padding: "0 0.75rem" }}
              >
                Critical ({summary.critical})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTier("warning")}
                className={`btn ${selectedTier === "warning" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem", padding: "0 0.75rem" }}
              >
                Warning ({summary.warning})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTier("expired")}
                className={`btn ${selectedTier === "expired" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem", padding: "0 0.75rem" }}
              >
                Expired ({summary.expired})
              </button>
            </div>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Showing <strong>{filteredItems.length}</strong> batches
          </div>
        </div>

        {/* Expiry Lots Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine & Generic Molecule</th>
                <th>Batch Number</th>
                <th>Expiry Date & Days Remaining</th>
                <th>Physical Storage Shelf</th>
                <th>Stock at Risk</th>
                <th>Capital Exposure</th>
                <th style={{ textAlign: "right" }}>Mitigation Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      Auditing pharmacy lots for expiration risks...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--status-low-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      {error}
                    </div>
                    <button onClick={loadExpiryData} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--status-high-text)" }}>
                        <CheckCircle size={32} />
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        No batches matching selected expiry tier
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        All tracked physical stock complies with healthy inventory runway metrics.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const exposure = item.quantity_available * (item.mrp || 0);

                  return (
                    <tr key={item.batch_id}>
                      {/* Medicine */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                            {item.brand_name || `Medicine #${item.medicine_id}`}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                            {item.generic_name || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Batch Code */}
                      <td>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                          {item.batch_number}
                        </span>
                      </td>

                      {/* Expiry Date & Days Left */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                            {item.expiry_date}
                          </span>
                          <div>
                            {item.status === "expired" && (
                              <span className="status-badge low">
                                <span className="badge-icon"><AlertOctagon size={11} /></span>
                                <span>Expired ({Math.abs(item.days_until_expiry)}d ago)</span>
                              </span>
                            )}
                            {item.status === "critical" && (
                              <span className="status-badge med">
                                <span className="badge-icon"><AlertTriangle size={11} /></span>
                                <span>Critical ({item.days_until_expiry}d left)</span>
                              </span>
                            )}
                            {item.status === "warning" && (
                              <span className="status-badge med">
                                <span className="badge-icon"><Clock size={11} /></span>
                                <span>Warning ({item.days_until_expiry}d left)</span>
                              </span>
                            )}
                            {item.status === "good" && (
                              <span className="status-badge high">
                                <span className="badge-icon"><CheckCircle size={11} /></span>
                                <span>Healthy ({item.days_until_expiry}d left)</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Location */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>
                            <Location size={14} />
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                            {item.location_name || "Unassigned"}
                          </span>
                        </div>
                      </td>

                      {/* Units */}
                      <td>
                        <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                          {item.quantity_available} units
                        </span>
                      </td>

                      {/* Capital Exposure */}
                      <td>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                          ₹{exposure.toFixed(2)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            onClick={() => handleOpenWriteOff(item)}
                            className="btn btn-secondary"
                            style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            title="Reconcile / Write-Off from active stock"
                          >
                            <SlidersHorizontal size={13} />
                            <span>Quarantine / Reconcile</span>
                          </button>
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
          Modal: Quarantine / Write-Off / Return Adjustment
          ===================================================================== */}
      {adjustingItem && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setAdjustingItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--status-med-text)" }}>
                  <ShieldAlert size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Quarantine / Write-Off Lot
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Batch #{adjustingItem.batch_number} • Reconciles physical count
                  </p>
                </div>
              </div>
              <button onClick={() => setAdjustingItem(null)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmWriteOff} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.8125rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {adjustingItem.brand_name}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                      Batch: {adjustingItem.batch_number} • Exp: {adjustingItem.expiry_date}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Current In Stock</div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      {adjustingItem.quantity_available} units
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">New Physical Quantity in Sellable Stock *</label>
                  <input
                    type="number"
                    min="0"
                    max={adjustingItem.quantity_available}
                    required
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 0)}
                    className="form-input"
                  />
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Setting to 0 removes all units from active POS dispensing.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Statutory Audit Justification *</label>
                  <textarea
                    rows={3}
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setAdjustingItem(null)} className="btn btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Reconciling..." : "Confirm & Write-Off"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
