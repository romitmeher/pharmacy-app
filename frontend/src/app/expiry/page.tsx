"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  X,
  RefreshCw,
  SlidersHorizontal,
  RotateCcw,
  ShieldAlert,
  Calendar,
  Clock,
  Bookmark,
  Package,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  FileText,
  MapPin,
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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Failed to load regulatory expiry audit report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadExpiryData());
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
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to adjust inventory.");
      }
    });
  };

  const summary = report?.summary || { expired: 0, critical: 0, warning: 0, good: 0 };

  return (
    <div className="expiry-1">
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Expiry Management</h1>
          <p className="page-subtitle">
            Statutory Expiry Tiers • Loss Mitigation • Supplier Returns • Store #1
          </p>
        </div>

        <div className="expiry-2">
          <ThemeToggle />
          <button onClick={loadExpiryData} className="btn btn-secondary">
            <RefreshCw size={15} />
            <span>Refresh Audit</span>
          </button>
          <Link href="/inventory" className="btn btn-primary">
            <Package size={15} />
            <span>Inventory Lots</span>
          </Link>
        </div>
      </header>

      {/* Main Body */}
      <div  className="page-body expiry-3">
        {/* Regulatory Governance Notice */}
        <div
          className="expiry-4"
        >
          <span className="expiry-5">
            <Clock size={18} />
          </span>
          <div>
            <strong className="expiry-6">
              PRD Rule 15 Statutory Expiry Tiers:
            </strong>{" "}
            <span className="expiry-7">
              Physical lots expiring within 30 days are legally flagged <strong>CRITICAL</strong> and must be segregated
              or prioritized via FEFO; stock within 90 days is marked <strong>WARNING</strong> to trigger supplier return
              agreements.
            </span>
          </div>
        </div>

        {/* 4 Metrics Summary Cards Row */}
        <div
          className="expiry-8"
        >
          <div  className="card expiry-9">
            <div className="expiry-10">
              <span className="expiry-11">
                Critical (≤ 30 Days)
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Immediate Action</span>
              </span>
            </div>
            <div className="expiry-12">
              {summary.critical}
            </div>
            <div className="expiry-13">
              Lots requiring immediate dispensing or return
            </div>
          </div>

          <div  className="card expiry-14">
            <div className="expiry-15">
              <span className="expiry-16">
                Warning (31 - 90 Days)
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><Clock size={12} /></span>
                <span>FEFO Window</span>
              </span>
            </div>
            <div className="expiry-17">
              {summary.warning}
            </div>
            <div className="expiry-18">
              Lots to prioritize in POS dispensing
            </div>
          </div>

          <div  className="card expiry-19">
            <div className="expiry-20">
              <span className="expiry-21">
                Expired Lots
              </span>
              <span className="status-badge low">
                <span className="badge-icon"><OctagonAlert size={12} /></span>
                <span>Zero Sellable</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: summary.expired > 0 ? "var(--status-low-text)" : "var(--text-primary)" }}>
              {summary.expired}
            </div>
            <div className="expiry-22">
              Must be destroyed or returned for credit
            </div>
          </div>

          <div  className="card expiry-23">
            <div className="expiry-24">
              <span className="expiry-25">
                Near-Expiry Value Exposure
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Financial Risk</span>
              </span>
            </div>
            <div className="expiry-26">
              ₹{totalFinancialExposure.toFixed(2)}
            </div>
            <div className="expiry-27">
              Capital tied up in ≤ 90 day lots
            </div>
          </div>
        </div>

        {/* Toolbar with Tier Filters */}
        <div
          className="expiry-28"
        >
          <div className="expiry-29">
            <div className="expiry-30">
              <Search
                size={16}
                className="expiry-31"
              />
              <input
                type="text"
                placeholder="Search by brand, generic, or batch code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                
                className="form-input expiry-32"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="expiry-33" aria-label="Close dialog"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Filter Buttons */}
            <div className="expiry-34">
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

          <div className="expiry-39">
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
                <th className="expiry-40">Mitigation Actions</th>
              </tr>
            </thead>
            <VirtualTableBody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="expiry-41">
                    <div className="expiry-42">
                      Auditing pharmacy lots for expiration risks...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="expiry-43">
                    <div className="expiry-44">
                      {error}
                    </div>
                    <button onClick={loadExpiryData} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="expiry-45">
                    <div className="expiry-46">
                      <span className="expiry-47">
                        <CheckCircle2 size={32} />
                      </span>
                      <div className="expiry-48">
                        No batches matching selected expiry tier
                      </div>
                      <div className="expiry-49">
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
                        <div className="expiry-50">
                          <span className="expiry-51">
                            {item.brand_name || `Medicine #${item.medicine_id}`}
                          </span>
                          <span className="expiry-52">
                            {item.generic_name || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Batch Code */}
                      <td>
                        <span className="expiry-53">
                          {item.batch_number}
                        </span>
                      </td>

                      {/* Expiry Date & Days Left */}
                      <td>
                        <div className="expiry-54">
                          <span className="expiry-55">
                            {item.expiry_date}
                          </span>
                          <div>
                            {item.status === "expired" && (
                              <span className="status-badge low">
                                <span className="badge-icon"><OctagonAlert size={11} /></span>
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
                                <span className="badge-icon"><CheckCircle2 size={11} /></span>
                                <span>Healthy ({item.days_until_expiry}d left)</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Location */}
                      <td>
                        <div className="expiry-56">
                          <span className="expiry-57">
                            <MapPin size={14} />
                          </span>
                          <span className="expiry-58">
                            {item.location_name || "Unassigned"}
                          </span>
                        </div>
                      </td>

                      {/* Units */}
                      <td>
                        <span className="expiry-59">
                          {item.quantity_available} units
                        </span>
                      </td>

                      {/* Capital Exposure */}
                      <td>
                        <span className="expiry-60">
                          ₹{exposure.toFixed(2)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="expiry-61">
                        <div className="expiry-62">
                          <button
                            onClick={() => handleOpenWriteOff(item)}
                            
                            className="btn btn-secondary expiry-63"
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
            </VirtualTableBody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          Modal: Quarantine / Write-Off / Return Adjustment
          ===================================================================== */}
      {adjustingItem && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setAdjustingItem(null)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content expiry-64">
            <div className="modal-header">
              <div className="expiry-65">
                <span className="expiry-66">
                  <ShieldAlert size={18} />
                </span>
                <div>
                  <h2 className="expiry-67">
                    Quarantine / Write-Off Lot
                  </h2>
                  <p className="expiry-68">
                    Batch #{adjustingItem.batch_number} • Reconciles physical count
                  </p>
                </div>
              </div>
              <button onClick={() => setAdjustingItem(null)} className="btn-icon" disabled={isSubmitting} aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmWriteOff} className="expiry-69">
              <div className="modal-body">
                {actionError && (
                  <div
                    className="expiry-70"
                  >
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div
                    className="expiry-71"
                  >
                    {actionSuccess}
                  </div>
                )}

                <div
                  className="expiry-72"
                >
                  <div>
                    <div className="expiry-73">
                      {adjustingItem.brand_name}
                    </div>
                    <div className="expiry-74">
                      Batch: {adjustingItem.batch_number} • Exp: {adjustingItem.expiry_date}
                    </div>
                  </div>
                  <div className="expiry-75">
                    <div className="expiry-76">Current In Stock</div>
                    <div className="expiry-77">
                      {adjustingItem.quantity_available} units
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="expiry-field-1">New Physical Quantity in Sellable Stock *</label>
                  <input
                    type="number"
                    min="0"
                    max={adjustingItem.quantity_available}
                    required
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 0)}
                    className="form-input" id="expiry-field-1"
                  />
                  <span className="expiry-78">
                    Setting to 0 removes all units from active POS dispensing.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="expiry-field-2">Statutory Audit Justification *</label>
                  <textarea
                    rows={3}
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="form-textarea" id="expiry-field-2"
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
