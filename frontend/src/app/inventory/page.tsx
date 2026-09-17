"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Box,
  Bookmark,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Location,
  AddCircle,
} from "@duo-icons/react";
import { Search, X, SlidersHorizontal, ArrowRightLeft } from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getBatches,
  createBatch,
  adjustStock,
  transferStock,
  getMedicines,
  getLocations,
  BatchItem,
  Medicine,
  PhysicalLocation,
  CreateBatchPayload,
  AdjustStockPayload,
  TransferStockPayload,
} from "@/lib/api";

export default function InventoryPage() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<string>("all");

  // Modals state
  const [showInwardModal, setShowInwardModal] = useState<boolean>(false);
  const [adjustItem, setAdjustItem] = useState<{ batch: BatchItem; inventoryId: number; currentQty: number } | null>(null);
  const [transferBatch, setTransferBatch] = useState<BatchItem | null>(null);

  // Inward Form State
  const [inwardForm, setInwardForm] = useState<CreateBatchPayload>({
    medicine_id: 0,
    batch_number: "",
    expiry_date: "",
    manufacturing_date: "",
    purchase_price: undefined,
    mrp: undefined,
    initial_quantity: 50,
    location_id: undefined,
  });

  // Adjust Form State
  const [adjustQuantity, setAdjustQuantity] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>("");

  // Transfer Form State
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [transferTargetLocationId, setTransferTargetLocationId] = useState<number>(0);

  const [isSubmitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, medRes, locRes] = await Promise.all([
        getBatches(),
        getMedicines({ per_page: 100 }),
        getLocations(),
      ]);

      setBatches(batchRes.batches || []);
      setMedicines(medRes.items || []);
      setLocations(locRes.locations || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load inventory batches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Batches
  const filteredBatches = batches.filter((b) => {
    const q = searchQuery.toLowerCase().trim();
    const brandName = b.medicine?.brand_name?.toLowerCase() || "";
    const genericName = b.medicine?.generic_name?.toLowerCase() || "";
    const batchNo = b.batch_number.toLowerCase();

    const matchesSearch = !q || brandName.includes(q) || genericName.includes(q) || batchNo.includes(q);

    const matchesStock =
      stockFilter === "all"
        ? true
        : stockFilter === "in_stock"
        ? b.total_available > 0
        : b.total_available === 0;

    const matchesLocation =
      !locationFilter ||
      (b.inventory || []).some((inv) => String(inv.location_id) === locationFilter);

    return matchesSearch && matchesStock && matchesLocation;
  });

  // Metrics
  const totalAvailableUnits = batches.reduce((sum, b) => sum + (b.total_available || 0), 0);
  const activeBatchesCount = batches.filter((b) => b.total_available > 0).length;
  const distinctMedicinesStocked = new Set(batches.filter((b) => b.total_available > 0).map((b) => b.medicine_id)).size;

  // Handle Inward Batch
  const handleOpenInward = () => {
    setActionError(null);
    setActionSuccess(null);
    setInwardForm({
      medicine_id: medicines[0]?.id || 0,
      batch_number: "",
      expiry_date: "",
      manufacturing_date: "",
      purchase_price: undefined,
      mrp: undefined,
      initial_quantity: 50,
      location_id: locations[0]?.id || undefined,
    });
    setShowInwardModal(true);
  };

  const handleSubmitInward = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inwardForm.medicine_id) {
      setActionError("Please select a valid medicine.");
      return;
    }
    if (!inwardForm.batch_number.trim()) {
      setActionError("Batch Number is required.");
      return;
    }
    if (!inwardForm.expiry_date) {
      setActionError("Expiry Date is required.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        await createBatch({
          ...inwardForm,
          batch_number: inwardForm.batch_number.trim().toUpperCase(),
          initial_quantity: Number(inwardForm.initial_quantity) || 0,
          purchase_price: inwardForm.purchase_price ? Number(inwardForm.purchase_price) : undefined,
          mrp: inwardForm.mrp ? Number(inwardForm.mrp) : undefined,
          location_id: inwardForm.location_id ? Number(inwardForm.location_id) : undefined,
        });

        setActionSuccess(`Batch "${inwardForm.batch_number}" inwarded into stock successfully!`);
        setTimeout(() => {
          setShowInwardModal(false);
          loadData();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to create batch.");
      }
    });
  };

  // Handle Stock Adjustment (Audit Logged)
  const handleOpenAdjust = (batch: BatchItem) => {
    const inv = (batch.inventory || [])[0];
    if (!inv) return;
    setActionError(null);
    setActionSuccess(null);
    setAdjustItem({
      batch,
      inventoryId: inv.id,
      currentQty: inv.quantity_available,
    });
    setAdjustQuantity(inv.quantity_available);
    setAdjustReason("");
  };

  const handleSubmitAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;
    if (!adjustReason.trim()) {
      setActionError("A valid audit reason is strictly mandatory for stock adjustments (PRD Rule 7).");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const payload: AdjustStockPayload = {
          inventory_id: adjustItem.inventoryId,
          new_quantity: Number(adjustQuantity),
          reason: adjustReason.trim(),
        };
        await adjustStock(payload);
        setActionSuccess("Stock level adjusted and recorded in central audit trail!");
        setTimeout(() => {
          setAdjustItem(null);
          loadData();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to adjust stock.");
      }
    });
  };

  // Handle Inter-Location Transfer
  const handleOpenTransfer = (batch: BatchItem) => {
    setActionError(null);
    setActionSuccess(null);
    setTransferBatch(batch);
    setTransferQuantity(1);
    setTransferTargetLocationId(locations[0]?.id || 0);
  };

  const handleSubmitTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferBatch) return;
    if (!transferTargetLocationId) {
      setActionError("Please select a target destination shelf/location.");
      return;
    }
    if (transferQuantity <= 0 || transferQuantity > transferBatch.total_available) {
      setActionError(`Transfer quantity must be between 1 and ${transferBatch.total_available} units.`);
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const sourceLoc = (transferBatch.inventory || [])[0]?.location_id;
        const payload: TransferStockPayload = {
          batch_id: transferBatch.id,
          source_location_id: sourceLoc,
          target_location_id: Number(transferTargetLocationId),
          quantity: Number(transferQuantity),
        };
        await transferStock(payload);
        setActionSuccess(`Transferred ${transferQuantity} units to target shelf!`);
        setTimeout(() => {
          setTransferBatch(null);
          loadData();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to transfer stock.");
      }
    });
  };

  // Helper for expiry pill status
  const getExpiryStatusBadge = (expiryStr: string) => {
    const today = new Date();
    const expiry = new Date(expiryStr);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="status-badge low">
          <span className="badge-icon"><AlertOctagon size={12} /></span>
          <span>Expired</span>
        </span>
      );
    } else if (diffDays <= 30) {
      return (
        <span className="status-badge med">
          <span className="badge-icon"><AlertTriangle size={12} /></span>
          <span>{diffDays}d (Critical)</span>
        </span>
      );
    } else if (diffDays <= 90) {
      return (
        <span className="status-badge med">
          <span className="badge-icon"><Clock size={12} /></span>
          <span>{diffDays}d (Warning)</span>
        </span>
      );
    }
    return (
      <span className="status-badge high">
        <span className="badge-icon"><CheckCircle size={12} /></span>
        <span>{diffDays}d (Good)</span>
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Inventory & Batches</h1>
          <p className="page-subtitle">
            Physical Lot Tracking • FEFO Allocation • Storage Verification • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button onClick={handleOpenInward} className="btn btn-primary">
            <AddCircle size={16} />
            <span>Inward Physical Batch</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Cardinal Hierarchy Notice */}
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
          <span style={{ color: "var(--brand-primary)", display: "inline-flex" }}>
            <Box size={18} />
          </span>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              Cardinal Principle (MEDICINE != BATCH != INVENTORY):
            </strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              Batches hold manufacturer dates, cost, and regulatory expiry. Inventory represents the physical units
              occupying specific pharmacy shelves, racks, and drawers.
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
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
                Total Physical Units
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Box size={12} /></span>
                <span>Stock</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {totalAvailableUnits}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Available units across all storage locations
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Active Batches
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Monitored</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {activeBatchesCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Batches with active sellable stock
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Stocked Formulations
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Bookmark size={12} /></span>
                <span>Molecules</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {distinctMedicinesStocked}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Distinct medicine identities in stock
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Physical Locations
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><Location size={12} /></span>
                <span>Racks</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {locations.length}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Configured store storage zones
            </div>
          </div>
        </div>

        {/* Search, Filter Bar */}
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
            {/* Search */}
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
                placeholder="Search batch number, brand, or generic..."
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

            {/* Stock status filter */}
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="form-select"
              style={{ width: "160px" }}
            >
              <option value="all">All Batches</option>
              <option value="in_stock">In Stock Only</option>
              <option value="depleted">Depleted / Zero</option>
            </select>

            {/* Location filter */}
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="form-select"
              style={{ width: "180px" }}
            >
              <option value="">All Storage Shelves</option>
              {locations.map((loc) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Showing <strong>{filteredBatches.length}</strong> of <strong>{batches.length}</strong> batches
          </div>
        </div>

        {/* Batches Data Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine & Formulation</th>
                <th>Batch Number</th>
                <th>Expiry Date & Status</th>
                <th>Storage Shelf</th>
                <th>Available Units</th>
                <th>MRP / Purchase Cost</th>
                <th style={{ textAlign: "right" }}>Inventory Operations</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      Loading physical inventory batches...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--status-low-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      {error}
                    </div>
                    <button onClick={loadData} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        <Box size={32} />
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        No inventory batches found
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "340px" }}>
                        {searchQuery
                          ? `No batches matching "${searchQuery}".`
                          : "Inward physical batches to start tracking stock across shelves."}
                      </div>
                      <button onClick={handleOpenInward} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                        <AddCircle size={16} />
                        <span>Inward First Batch</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const locationName =
                    (batch.inventory || [])[0]?.location_name || "Unassigned Shelf";

                  return (
                    <tr key={batch.id}>
                      {/* Medicine details */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                            {batch.medicine?.brand_name || `Medicine #${batch.medicine_id}`}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                            {batch.medicine?.generic_name || "—"} {batch.medicine?.strength ? `• ${batch.medicine.strength}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Batch Number */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span style={{ color: "var(--brand-primary)" }}>
                            <Box size={14} />
                          </span>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                            {batch.batch_number}
                          </span>
                        </div>
                      </td>

                      {/* Expiry Date & Status */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                            {batch.expiry_date}
                          </span>
                          <div>{getExpiryStatusBadge(batch.expiry_date)}</div>
                        </div>
                      </td>

                      {/* Storage Shelf */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>
                            <Location size={14} />
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                            {locationName}
                          </span>
                        </div>
                      </td>

                      {/* Available Units */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                          <span
                            style={{
                              fontSize: "0.9375rem",
                              fontWeight: 700,
                              color: batch.total_available > 0 ? "var(--text-primary)" : "var(--status-low-text)",
                            }}
                          >
                            {batch.total_available} units
                          </span>
                          {batch.total_reserved > 0 && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--status-med-text)" }}>
                              ({batch.total_reserved} reserved in cart)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Pricing */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                            MRP: ₹{batch.mrp !== null && batch.mrp !== undefined ? Number(batch.mrp).toFixed(2) : "0.00"}
                          </span>
                          {batch.purchase_price !== null && batch.purchase_price !== undefined && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                              Cost: ₹{Number(batch.purchase_price).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Operations */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            onClick={() => handleOpenTransfer(batch)}
                            className="btn btn-secondary"
                            style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            title="Move units between shelves"
                            disabled={batch.total_available <= 0}
                          >
                            <ArrowRightLeft size={13} />
                            <span>Transfer</span>
                          </button>
                          <button
                            onClick={() => handleOpenAdjust(batch)}
                            className="btn btn-secondary"
                            style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            title="Adjust quantity with audit reason"
                          >
                            <SlidersHorizontal size={13} />
                            <span>Adjust</span>
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
          Modal: Inward Physical Batch
          ===================================================================== */}
      {showInwardModal && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowInwardModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#252525",
                    border: "1px solid #393939",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-primary)",
                  }}
                >
                  <Box size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Inward Physical Batch
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Allocates new manufacturer lot to pharmacy shelf
                  </p>
                </div>
              </div>
              <button onClick={() => setShowInwardModal(false)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitInward} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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

                {/* Medicine Selection */}
                <div className="form-group">
                  <label className="form-label">Select Master Medicine Formulation *</label>
                  <select
                    value={inwardForm.medicine_id}
                    onChange={(e) => setInwardForm({ ...inwardForm, medicine_id: Number(e.target.value) })}
                    className="form-select"
                    required
                  >
                    <option value="">-- Choose Medicine --</option>
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.brand_name} {m.strength ? `(${m.strength})` : ""} — {m.generic_name || ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Number & Shelf Location */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Batch Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AUG-2026-09"
                      value={inwardForm.batch_number}
                      onChange={(e) => setInwardForm({ ...inwardForm, batch_number: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Storage Shelf / Rack</label>
                    <select
                      value={inwardForm.location_id || ""}
                      onChange={(e) => setInwardForm({ ...inwardForm, location_id: e.target.value ? Number(e.target.value) : undefined })}
                      className="form-select"
                    >
                      <option value="">-- Choose Shelf --</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Expiry & Mfg Dates */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Expiry Date * (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      required
                      value={inwardForm.expiry_date}
                      onChange={(e) => setInwardForm({ ...inwardForm, expiry_date: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Manufacturing Date (Optional)</label>
                    <input
                      type="date"
                      value={inwardForm.manufacturing_date || ""}
                      onChange={(e) => setInwardForm({ ...inwardForm, manufacturing_date: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Quantity & Pricing */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Inward Quantity *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={inwardForm.initial_quantity}
                      onChange={(e) => setInwardForm({ ...inwardForm, initial_quantity: parseInt(e.target.value) || 0 })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Purchase Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="140.00"
                      value={inwardForm.purchase_price || ""}
                      onChange={(e) => setInwardForm({ ...inwardForm, purchase_price: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">MRP (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="204.50"
                      value={inwardForm.mrp || ""}
                      onChange={(e) => setInwardForm({ ...inwardForm, mrp: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowInwardModal(false)} className="btn btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Allocating Stock..." : "Confirm & Inward Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Audit-Logged Stock Adjustment (PRD Rule 7 & 22)
          ===================================================================== */}
      {adjustItem && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setAdjustItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#252525",
                    border: "1px solid #393939",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--status-med-text)",
                  }}
                >
                  <SlidersHorizontal size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Stock Level Adjustment
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Strict compliance: Requires mandatory audit justification
                  </p>
                </div>
              </div>
              <button onClick={() => setAdjustItem(null)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitAdjust} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
                    padding: "0.75rem 1rem",
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                      {adjustItem.batch.medicine?.brand_name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      Batch: {adjustItem.batch.batch_number} • Exp: {adjustItem.batch.expiry_date}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Current Stock</div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.9375rem" }}>
                      {adjustItem.currentQty} units
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">New Physical Unit Count *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 0)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Audit Justification / Reason * (Mandatory)</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Damaged strip discovered during shelf audit; discarded per store protocol."
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="form-textarea"
                  />
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    This adjustment will be permanently signed and logged under your Pharmacist credentials.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setAdjustItem(null)} className="btn btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Signing Audit..." : "Record Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Inter-Location Stock Transfer
          ===================================================================== */}
      {transferBatch && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setTransferBatch(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#252525",
                    border: "1px solid #393939",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-primary)",
                  }}
                >
                  <ArrowRightLeft size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Transfer Units Between Shelves
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Moves physical stock between storage zones
                  </p>
                </div>
              </div>
              <button onClick={() => setTransferBatch(null)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitTransfer} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
                    padding: "0.75rem 1rem",
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    {transferBatch.medicine?.brand_name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Batch {transferBatch.batch_number} • Current Total: {transferBatch.total_available} units
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Units to Transfer *</label>
                  <input
                    type="number"
                    min="1"
                    max={transferBatch.total_available}
                    required
                    value={transferQuantity}
                    onChange={(e) => setTransferQuantity(parseInt(e.target.value) || 1)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Target Shelf / Location *</label>
                  <select
                    required
                    value={transferTargetLocationId}
                    onChange={(e) => setTransferTargetLocationId(Number(e.target.value))}
                    className="form-select"
                  >
                    <option value="">-- Choose Target Shelf --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.location_type ? `(${loc.location_type})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setTransferBatch(null)} className="btn btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Moving..." : "Transfer Units"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
