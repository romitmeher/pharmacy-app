"use client";

import React, { useState, useEffect, useTransition, useMemo, useCallback } from "react";
import '../operations.css';
import { Button, Field, StatCard, Skeleton, EmptyState } from '@/components/ui/primitives';
import dynamic from 'next/dynamic';
const Drawer = dynamic(() => import('@/components/ui/Drawer').then(module => module.Drawer), { ssr: false });
import { DataTable } from '@/components/ui/DataTable';
import { DensityToggle } from '@/components/ui/DensityToggle';
import type { ColumnDef } from '@tanstack/react-table';
import {
  X,
  SlidersHorizontal,
  ArrowRightLeft,
  Package,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  Clock,
  PlusCircle,
} from "lucide-react";

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
  const [expiryReference, setExpiryReference] = useState(() => Date.now());
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [detailBatch, setDetailBatch] = useState<BatchItem | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setCatalogQuery(searchQuery), 150); return () => window.clearTimeout(timer); }, [searchQuery]);

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
    setExpiryReference(Date.now());
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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Failed to load inventory batches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, []);

  // Filtered Batches
  const filteredBatches = useMemo(() => batches.filter((b) => {
    const q = catalogQuery.toLowerCase().trim();
    const brandName = b.medicine?.brand_name?.toLowerCase() || "";
    const genericName = b.medicine?.generic_name?.toLowerCase() || "";
    const batchNo = b.batch_number.toLowerCase();

    const matchesSearch = !q || brandName.includes(q) || genericName.includes(q) || batchNo.includes(q);

    const matchesStock =
      stockFilter === "all"
        ? true
        : stockFilter === "in_stock"
        ? b.total_available > 0
        : stockFilter === 'low_stock'
        ? b.total_available > 0 && b.total_available <= 10
        : b.total_available === 0;

    const matchesLocation =
      !locationFilter ||
      (b.inventory || []).some((inv) => String(inv.location_id) === locationFilter);

    const expiryDays = Math.ceil((new Date(b.expiry_date).getTime() - expiryReference) / 86400000);
    const matchesExpiry = expiryFilter === 'all' || (expiryFilter === 'expired' ? expiryDays < 0 : expiryDays >= 0 && expiryDays <= Number(expiryFilter));
    return matchesSearch && matchesStock && matchesLocation && matchesExpiry;
  }), [batches, catalogQuery, stockFilter, locationFilter, expiryFilter, expiryReference]);

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
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to create batch.");
      }
    });
  };

  // Handle Stock Adjustment (Audit Logged)
  const handleOpenAdjust = useCallback((batch: BatchItem) => {
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
  }, []);

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
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to adjust stock.");
      }
    });
  };

  // Handle Inter-Location Transfer
  const handleOpenTransfer = useCallback((batch: BatchItem) => {
    setActionError(null);
    setActionSuccess(null);
    setTransferBatch(batch);
    setTransferQuantity(1);
    setTransferTargetLocationId(locations[0]?.id || 0);
  }, [locations]);

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
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to transfer stock.");
      }
    });
  };

  // Helper for expiry pill status
  const getExpiryStatusBadge = useCallback((expiryStr: string) => {
    const today = new Date(expiryReference);
    const expiry = new Date(expiryStr);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="status-badge low">
          <span className="badge-icon"><OctagonAlert size={12} /></span>
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
        <span className="badge-icon"><CheckCircle2 size={12} /></span>
        <span>{diffDays}d (Good)</span>
      </span>
    );
  }, [expiryReference]);

  const columns = useMemo<ColumnDef<BatchItem, unknown>[]>(() => [
    { id: 'medicine', accessorFn: batch => batch.medicine?.brand_name || '', header: 'Medicine & Formulation', cell: ({ row }) => <div className="ops-cell"><button className="ops-text-button" onClick={() => setDetailBatch(row.original)}>{row.original.medicine?.brand_name || `Medicine #${row.original.medicine_id}`}</button><span>{row.original.medicine?.generic_name || '—'} {row.original.medicine?.strength ? `• ${row.original.medicine.strength}` : ''}</span></div> },
    { accessorKey: 'batch_number', header: 'Batch Number', cell: ({ row }) => <span className="ops-number">{row.original.batch_number}</span> },
    { accessorKey: 'expiry_date', header: 'Expiry Date & Status', cell: ({ row }) => <div className="ops-cell"><span className="ops-number">{row.original.expiry_date}</span>{getExpiryStatusBadge(row.original.expiry_date)}</div> },
    { id: 'shelf', accessorFn: batch => batch.inventory?.[0]?.location_name || 'Unassigned Shelf', header: 'Storage Shelf', cell: ({ getValue }) => String(getValue()) },
    { accessorKey: 'total_available', header: 'Available Units', cell: ({ row }) => <div className="ops-cell"><strong className="ops-number">{row.original.total_available} units</strong>{row.original.total_reserved > 0 && <span className="ops-warning">({row.original.total_reserved} reserved in cart)</span>}</div> },
    { accessorKey: 'mrp', header: 'MRP / Purchase Cost', cell: ({ row }) => <div className="ops-cell"><span className="ops-number">MRP: ₹{Number(row.original.mrp ?? 0).toFixed(2)}</span>{row.original.purchase_price != null && <span className="ops-number">Cost: ₹{Number(row.original.purchase_price).toFixed(2)}</span>}</div> },
    { id: 'actions', header: 'Inventory Operations', enableSorting: false, cell: ({ row }) => <div className="ops-actions"><Button variant="secondary" onClick={() => handleOpenTransfer(row.original)} disabled={row.original.total_available <= 0} title="Move units between shelves"><ArrowRightLeft size={14} />Transfer</Button><Button variant="secondary" onClick={() => handleOpenAdjust(row.original)} title="Adjust quantity with audit reason"><SlidersHorizontal size={14} />Adjust</Button></div> },
  ], [getExpiryStatusBadge, handleOpenAdjust, handleOpenTransfer]);
  const filterControls = <><div className="ui-field"><label htmlFor={filtersOpen ? 'sheet-stock-filter' : 'stock-filter'}>Stock status</label><select id={filtersOpen ? 'sheet-stock-filter' : 'stock-filter'} className="ui-select" value={stockFilter} onChange={e => setStockFilter(e.target.value)}><option value="all">All Batches</option><option value="in_stock">In Stock Only</option><option value="low_stock">Low Stock (≤ 10)</option><option value="depleted">Depleted / Zero</option></select></div><div className="ui-field"><label htmlFor={filtersOpen ? 'sheet-location-filter' : 'location-filter'}>Storage shelf</label><select id={filtersOpen ? 'sheet-location-filter' : 'location-filter'} className="ui-select" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}><option value="">All Storage Shelves</option>{locations.map(location => <option key={location.id} value={String(location.id)}>{location.name}</option>)}</select></div><div className="ui-field"><label htmlFor={filtersOpen ? 'sheet-expiry-filter' : 'expiry-filter'}>Expiry</label><select id={filtersOpen ? 'sheet-expiry-filter' : 'expiry-filter'} className="ui-select" value={expiryFilter} onChange={e => setExpiryFilter(e.target.value)}><option value="all">All Expiry Dates</option><option value="expired">Expired</option><option value="30">Expiring in 30 Days</option><option value="90">Expiring in 90 Days</option></select></div></>;
  return (
    <div className="ops-page inventory-page">
      <header className="page-header ops-header"><div><p className="ops-eyebrow">CATALOG & STOCK</p><h1 className="page-title">Inventory & Batches</h1><p className="page-subtitle">Physical Lot Tracking • FEFO Allocation • Storage Verification • Store #1</p></div><div className="ops-actions"><ThemeToggle /><Button onClick={handleOpenInward}><PlusCircle size={16} />Inward Physical Batch</Button></div></header>
      <div className="page-body ops-body">
        <div className="ops-stats"><StatCard label="Total Physical Units" value={loading ? '…' : totalAvailableUnits} detail="Available units across all storage locations" /><StatCard label="Active Batches" value={loading ? '…' : activeBatchesCount} detail="Batches with active sellable stock" /><StatCard label="Stocked Formulations" value={loading ? '…' : distinctMedicinesStocked} detail="Distinct medicine identities in stock" /><StatCard label="Physical Locations" value={loading ? '…' : locations.length} detail="Configured store storage zones" /></div>
        <section className="ui-card ops-inventory-section" aria-label="Batch inventory">
          <div className="ops-toolbar"><div className="ops-search"><Field label="Search stock" type="search" placeholder="Batch number, brand or generic…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div><div className="ops-desktop-filters">{!filtersOpen && filterControls}</div><div className="ops-mobile-filter-button"><Button variant="secondary" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={16} />Filters</Button></div><DensityToggle /></div>
          <div className="ops-section-heading"><h2>Physical batches</h2><span role="status">Showing {filteredBatches.length} of {batches.length} batches</span></div>
          {loading ? <Skeleton label="Loading physical inventory batches" rows={5} /> : error ? <div role="alert"><EmptyState title="Inventory could not load" description={error} action={<Button variant="secondary" onClick={loadData}>Retry</Button>} /></div> : filteredBatches.length === 0 ? <EmptyState title="No inventory batches found" description={searchQuery ? `No batches matching "${searchQuery}".` : 'Inward physical batches to start tracking stock across shelves.'} action={<Button onClick={handleOpenInward}>Inward First Batch</Button>} /> : <DataTable label="Physical batches" data={filteredBatches} columns={columns} getRowId={batch => String(batch.id)} />}
          <p className="ui-hint ops-footnote">Batches hold manufacturer dates, cost, and regulatory expiry. Inventory represents the physical units occupying specific pharmacy shelves, racks, and drawers.</p>
        </section>
      </div>
      {filtersOpen && <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} title="Inventory filters" description="Filter the loaded batches by stock, expiry and storage shelf."><div className="ops-form-stack">{filtersOpen && filterControls}</div></Drawer>}
      {detailBatch && <Drawer open={!!detailBatch} onOpenChange={open => { if (!open) setDetailBatch(null); }} title={detailBatch?.medicine?.brand_name || 'Batch detail'} description="Manufacturer batch details and current physical storage.">{detailBatch && <div className="ops-form-stack"><dl className="ops-detail-list"><div><dt>Batch Number</dt><dd className="ops-number">{detailBatch.batch_number}</dd></div><div><dt>Generic name</dt><dd>{detailBatch.medicine?.generic_name || '—'} {detailBatch.medicine?.strength || ''}</dd></div><div><dt>Expiry Date</dt><dd>{detailBatch.expiry_date} {getExpiryStatusBadge(detailBatch.expiry_date)}</dd></div><div><dt>Available Units</dt><dd className="ops-number">{detailBatch.total_available}</dd></div><div><dt>Reserved Units</dt><dd className="ops-number">{detailBatch.total_reserved}</dd></div><div><dt>MRP</dt><dd className="ops-number">₹{Number(detailBatch.mrp ?? 0).toFixed(2)}</dd></div>{detailBatch.purchase_price != null && <div><dt>Purchase Cost</dt><dd className="ops-number">₹{Number(detailBatch.purchase_price).toFixed(2)}</dd></div>}</dl><h3>Storage shelves</h3>{detailBatch.inventory?.length ? detailBatch.inventory.map(inv => <div className="ops-storage-row" key={inv.id}><span>{inv.location_name || 'Unassigned Shelf'}</span><strong className="ops-number">{inv.quantity_available} units</strong></div>) : <p>No physical storage assigned.</p>}<div className="ops-actions"><Button variant="secondary" onClick={() => { handleOpenTransfer(detailBatch); setDetailBatch(null); }} disabled={detailBatch.total_available <= 0}>Transfer</Button><Button variant="secondary" onClick={() => { handleOpenAdjust(detailBatch); setDetailBatch(null); }}>Adjust</Button></div></div>}</Drawer>}

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
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-default)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-primary)",
                  }}
                >
                  <Package size={15} />
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
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-default)",
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
                  <p className="ops-adjust-notice">Recording this adjustment replaces the physical count for batch {adjustItem.batch.batch_number} from {adjustItem.currentQty} to {adjustQuantity} units. The reason will be saved in the audit trail.</p>
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
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-default)",
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
