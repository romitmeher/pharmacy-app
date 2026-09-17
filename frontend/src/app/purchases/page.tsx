"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  File,
  Building,
  Box,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Location,
  AddCircle,
} from "@duo-icons/react";
import {
  Search,
  X,
  Eye,
  Check,
  Ban,
  PackageCheck,
  Calendar,
  Layers,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getPurchases,
  getPurchase,
  createPurchaseDraft,
  acceptPurchaseInvoice,
  cancelPurchaseInvoice,
  getSuppliers,
  getMedicines,
  getLocations,
  PurchaseInvoiceRecord,
  SupplierRecord,
  Medicine,
  PhysicalLocation,
  CreatePurchaseDraftPayload,
} from "@/lib/api";

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseInvoiceRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [locations, setLocations] = useState<PhysicalLocation[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceRecord | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState<boolean>(false);
  const [acceptLocationId, setAcceptLocationId] = useState<number>(0);

  // New Draft State
  const [draftSupplierId, setDraftSupplierId] = useState<number>(0);
  const [draftInvoiceNumber, setDraftInvoiceNumber] = useState<string>("");
  const [draftInvoiceDate, setDraftInvoiceDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [draftItems, setDraftItems] = useState<
    Array<{
      medicine_id: number;
      batch_number: string;
      expiry_date: string;
      quantity: number;
      purchase_rate: number;
      mrp: number;
    }>
  >([]);

  const [isSubmitting, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [purchasesRes, supRes, medRes, locRes] = await Promise.all([
        getPurchases({
          page,
          per_page: 20,
          status: statusFilter || undefined,
          supplier_id: supplierFilter ? Number(supplierFilter) : undefined,
        }),
        getSuppliers(),
        getMedicines({ per_page: 100 }),
        getLocations(),
      ]);

      setPurchases(purchasesRes.items || []);
      setTotalCount(purchasesRes.total || 0);
      setTotalPages(purchasesRes.pages || 1);
      setSuppliers(supRes.suppliers || []);
      setMedicines(medRes.items || []);
      setLocations(locRes.locations || []);

      if (locRes.locations && locRes.locations.length > 0) {
        setAcceptLocationId(locRes.locations[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load purchase invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, statusFilter, supplierFilter]);

  // Handle open create modal
  const handleOpenCreate = () => {
    setActionError(null);
    setActionSuccess(null);
    setDraftSupplierId(suppliers[0]?.id || 0);
    setDraftInvoiceNumber("");
    setDraftInvoiceDate(new Date().toISOString().split("T")[0]);
    setDraftItems([
      {
        medicine_id: medicines[0]?.id || 0,
        batch_number: "",
        expiry_date: "",
        quantity: 50,
        purchase_rate: 100,
        mrp: 150,
      },
    ]);
    setShowCreateModal(true);
  };

  const handleAddItemRow = () => {
    setDraftItems([
      ...draftItems,
      {
        medicine_id: medicines[0]?.id || 0,
        batch_number: "",
        expiry_date: "",
        quantity: 50,
        purchase_rate: 100,
        mrp: 150,
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    const updated = [...draftItems];
    updated.splice(index, 1);
    setDraftItems(updated);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...draftItems];
    updated[index] = { ...updated[index], [field]: value };
    setDraftItems(updated);
  };

  const handleSubmitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftSupplierId) {
      setActionError("Please select a distributor / supplier.");
      return;
    }
    if (!draftInvoiceNumber.trim()) {
      setActionError("Distributor Invoice Number is required.");
      return;
    }

    // Validate items
    for (const it of draftItems) {
      if (!it.batch_number.trim()) {
        setActionError("Batch Number is required for every line item.");
        return;
      }
      if (!it.expiry_date) {
        setActionError("Expiry Date is required for every line item.");
        return;
      }
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const payload: CreatePurchaseDraftPayload = {
          supplier_id: Number(draftSupplierId),
          invoice_number: draftInvoiceNumber.trim(),
          invoice_date: draftInvoiceDate,
          items: draftItems.map((it) => ({
            medicine_id: Number(it.medicine_id),
            batch_number: it.batch_number.trim().toUpperCase(),
            expiry_date: it.expiry_date,
            quantity: Number(it.quantity),
            purchase_rate: Number(it.purchase_rate),
            mrp: Number(it.mrp),
          })),
        };

        await createPurchaseDraft(payload);
        setActionSuccess("Distributor invoice draft created! Pending physical inward verification.");
        setTimeout(() => {
          setShowCreateModal(false);
          loadData();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to create invoice draft.");
      }
    });
  };

  // Open accept verification modal
  const handleOpenAccept = (invoice: PurchaseInvoiceRecord) => {
    setSelectedInvoice(invoice);
    setActionError(null);
    setActionSuccess(null);
    setShowAcceptModal(true);
  };

  // Confirm Physical Inward Acceptance (PRD Rule 11)
  const handleConfirmAccept = () => {
    if (!selectedInvoice) return;
    setActionError(null);
    startTransition(async () => {
      try {
        await acceptPurchaseInvoice(selectedInvoice.id, {
          location_id: Number(acceptLocationId) || undefined,
        });

        setActionSuccess(
          `Invoice ${selectedInvoice.invoice_number} accepted! Batches created and inventory incremented.`
        );
        setTimeout(() => {
          setShowAcceptModal(false);
          setSelectedInvoice(null);
          loadData();
        }, 800);
      } catch (err: any) {
        setActionError(err?.message || "Failed to accept purchase invoice.");
      }
    });
  };

  // Cancel draft invoice
  const handleCancelInvoice = (invoiceId: number) => {
    if (!confirm("Are you sure you want to cancel this purchase draft?")) return;
    startTransition(async () => {
      try {
        await cancelPurchaseInvoice(invoiceId, "Cancelled by Pharmacist");
        loadData();
      } catch (err: any) {
        alert(err?.message || "Failed to cancel invoice.");
      }
    });
  };

  // View full invoice detail
  const handleViewDetail = async (inv: PurchaseInvoiceRecord) => {
    setSelectedInvoice(inv);
    try {
      const res = await getPurchase(inv.id);
      setSelectedInvoice(res.invoice);
    } catch {
      // fallback to current
    }
  };

  // Metrics
  const pendingInwardCount = purchases.filter((p) => p.status === "draft").length;
  const acceptedCount = purchases.filter(
    (p) => p.status === "accepted" || p.status === "partial_accepted"
  ).length;
  const totalInwardValue = purchases
    .filter((p) => p.status === "accepted" || p.status === "partial_accepted")
    .reduce((sum, p) => sum + (p.total_amount || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Purchases & Invoices</h1>
          <p className="page-subtitle">
            Distributor Inward Verification • Two-Stage Inventory Booking • Store #1
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <AddCircle size={16} />
            <span>New Purchase Draft</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="page-body" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Two-Stage Protocol Notice */}
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
            <File size={18} />
          </span>
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              Two-Stage Procurement Protocol (PRD Rule 8 & 11):
            </strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              Wholesale invoices are saved in DRAFT status with zero stock mutation. Batches and physical units are only
              booked when a licensed pharmacist confirms physical quantities upon delivery.
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
                Total Invoices
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><File size={12} /></span>
                <span>Ledger</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {totalCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Total wholesale distributor invoices
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Pending Inward
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Drafts</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {pendingInwardCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Awaiting physical delivery count
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Accepted & Stocked
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Booked</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {acceptedCount}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Verified lots booked into inventory
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                Inward Inventory Value
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle size={12} /></span>
                <span>Cost</span>
              </span>
            </div>
            <div style={{ fontSize: "1.625rem", fontWeight: 700, color: "var(--text-primary)" }}>
              ₹{totalInwardValue.toFixed(2)}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              Cumulative wholesale acquisition cost
            </div>
          </div>
        </div>

        {/* Toolbar */}
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
                placeholder="Search invoice # or distributor..."
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

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-select"
              style={{ width: "180px" }}
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft (Pending Inward)</option>
              <option value="accepted">Accepted & Stocked</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="form-select"
              style={{ width: "200px" }}
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Showing <strong>{purchases.length}</strong> of <strong>{totalCount}</strong> records
          </div>
        </div>

        {/* Purchases Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice # & Date</th>
                <th>Supplier / Distributor</th>
                <th>Invoiced Items</th>
                <th>Total Value (₹)</th>
                <th>Inward Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                      Loading purchase invoices...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <div style={{ color: "var(--status-low-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      {error}
                    </div>
                    <button onClick={loadData} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        <File size={32} />
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        No purchase invoices found
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "360px" }}>
                        Record your first wholesale invoice draft to begin inward stock verification.
                      </div>
                      <button onClick={handleOpenCreate} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                        <AddCircle size={16} />
                        <span>Create First Purchase Draft</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                purchases.map((inv) => {
                  const isDraft = inv.status === "draft";
                  const isAccepted = inv.status === "accepted" || inv.status === "partial_accepted";
                  const isCancelled = inv.status === "cancelled";

                  return (
                    <tr key={inv.id}>
                      {/* Invoice # & Date */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                            {inv.invoice_number}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                            {inv.invoice_date}
                          </span>
                        </div>
                      </td>

                      {/* Supplier */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>
                            <Building size={14} />
                          </span>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                            {inv.supplier_name || `Supplier #${inv.supplier_id}`}
                          </span>
                        </div>
                      </td>

                      {/* Items */}
                      <td>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {(inv.items || []).length} line items
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                          ₹{inv.total_amount ? Number(inv.total_amount).toFixed(2) : "0.00"}
                        </span>
                      </td>

                      {/* Inward Status */}
                      <td>
                        {isDraft && (
                          <span className="status-badge med">
                            <span className="badge-icon"><AlertTriangle size={11} /></span>
                            <span>Pending Inward</span>
                          </span>
                        )}
                        {isAccepted && (
                          <span className="status-badge high">
                            <span className="badge-icon"><CheckCircle size={11} /></span>
                            <span>Stock Booked</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="status-badge low">
                            <span className="badge-icon"><AlertOctagon size={11} /></span>
                            <span>Cancelled</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            onClick={() => handleViewDetail(inv)}
                            className="btn btn-secondary"
                            style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                            title="View Invoice Details"
                          >
                            <Eye size={13} />
                            <span>Details</span>
                          </button>

                          {isDraft && (
                            <>
                              <button
                                onClick={() => handleOpenAccept(inv)}
                                className="btn btn-primary"
                                style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.625rem" }}
                              >
                                <PackageCheck size={13} />
                                <span>Verify Inward</span>
                              </button>
                              <button
                                onClick={() => handleCancelInvoice(inv.id)}
                                className="btn-icon"
                                title="Cancel Draft"
                                style={{ width: "30px", height: "30px" }}
                              >
                                <Ban size={14} />
                              </button>
                            </>
                          )}
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
          Modal: Create Purchase Draft (PRD Rule 8)
          ===================================================================== */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "720px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <File size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    New Distributor Purchase Draft
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    PRD Rule 8: Creates draft without mutating active inventory
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitDraft} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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

                {/* Supplier & Invoice metadata */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label className="form-label">Distributor / Supplier *</label>
                    <select
                      required
                      value={draftSupplierId}
                      onChange={(e) => setDraftSupplierId(Number(e.target.value))}
                      className="form-select"
                    >
                      <option value="">-- Choose Supplier --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Distributor Invoice # *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-DIST-9481"
                      value={draftInvoiceNumber}
                      onChange={(e) => setDraftInvoiceNumber(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Invoice Date</label>
                    <input
                      type="date"
                      value={draftInvoiceDate}
                      onChange={(e) => setDraftInvoiceDate(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Line items repeater */}
                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <label className="form-label">Inward Line Items</label>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--brand-primary)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Add Item
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "250px", overflowY: "auto" }}>
                    {draftItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 1.2fr 1.2fr 80px 90px 90px 30px",
                          gap: "0.5rem",
                          alignItems: "center",
                          padding: "0.5rem",
                          backgroundColor: "var(--bg-surface-elevated)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <select
                          value={item.medicine_id}
                          onChange={(e) => handleItemChange(idx, "medicine_id", Number(e.target.value))}
                          className="form-select"
                          style={{ fontSize: "0.75rem" }}
                        >
                          {medicines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.brand_name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          required
                          placeholder="Batch #"
                          value={item.batch_number}
                          onChange={(e) => handleItemChange(idx, "batch_number", e.target.value)}
                          className="form-input"
                          style={{ fontSize: "0.75rem" }}
                        />

                        <input
                          type="date"
                          required
                          value={item.expiry_date}
                          onChange={(e) => handleItemChange(idx, "expiry_date", e.target.value)}
                          className="form-input"
                          style={{ fontSize: "0.75rem" }}
                        />

                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value) || 0)}
                          className="form-input"
                          style={{ fontSize: "0.75rem" }}
                        />

                        <input
                          type="number"
                          step="0.01"
                          placeholder="Rate ₹"
                          value={item.purchase_rate}
                          onChange={(e) => handleItemChange(idx, "purchase_rate", parseFloat(e.target.value) || 0)}
                          className="form-input"
                          style={{ fontSize: "0.75rem" }}
                        />

                        <input
                          type="number"
                          step="0.01"
                          placeholder="MRP ₹"
                          value={item.mrp}
                          onChange={(e) => handleItemChange(idx, "mrp", parseFloat(e.target.value) || 0)}
                          className="form-input"
                          style={{ fontSize: "0.75rem" }}
                        />

                        {draftItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="btn-icon"
                            style={{ width: "24px", height: "24px" }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Creating Draft..." : "Save Invoice Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Inward Verification & Stock Acceptance (PRD Rule 11)
          ===================================================================== */}
      {showAcceptModal && selectedInvoice && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowAcceptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--status-high-text)" }}>
                  <PackageCheck size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Physical Inward Verification & Acceptance
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Books batches and physical stock into pharmacy shelves
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAcceptModal(false)} className="btn-icon" disabled={isSubmitting}>
                <X size={16} />
              </button>
            </div>

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
                  flexDirection: "column",
                  gap: "0.25rem",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Invoice: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedInvoice.invoice_number}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Distributor: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{selectedInvoice.supplier_name}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Invoiced Total: </span>
                  <strong style={{ color: "var(--text-primary)" }}>₹{Number(selectedInvoice.total_amount).toFixed(2)}</strong>
                </div>
              </div>

              {/* Destination Shelf Allocation */}
              <div className="form-group">
                <label className="form-label">Initial Storage Shelf / Rack Allocation *</label>
                <select
                  required
                  value={acceptLocationId}
                  onChange={(e) => setAcceptLocationId(Number(e.target.value))}
                  className="form-select"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.location_type ? `(${loc.location_type})` : ""}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                  All verified batches in this shipment will be initially placed on this shelf.
                </span>
              </div>

              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "rgba(30, 110, 232, 0.08)",
                  border: "1px solid var(--brand-border)",
                  fontSize: "0.6875rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                <strong>PRD Rule 11 Verification Gate:</strong> Confirming this physical inward will create immutable
                batch records and instantly increment physical stock counts available for POS dispensing.
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowAcceptModal(false)} className="btn btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirmAccept} className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? "Booking Stock..." : "Confirm & Accept into Inventory"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: View Detailed Purchase Invoice
          ===================================================================== */}
      {selectedInvoice && !showAcceptModal && (
        <div className="modal-backdrop" onClick={() => setSelectedInvoice(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "640px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <File size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Invoice #{selectedInvoice.invoice_number}
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    {selectedInvoice.supplier_name} • {selectedInvoice.invoice_date}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", padding: "0.75rem", backgroundColor: "var(--bg-surface-elevated)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem" }}>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Status</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    {selectedInvoice.status?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Total Value</div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                    ₹{Number(selectedInvoice.total_amount).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Verified At</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {selectedInvoice.verified_at ? new Date(selectedInvoice.verified_at).toLocaleDateString("en-IN") : "Pending"}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="table-container">
                <table className="data-table" style={{ fontSize: "0.75rem" }}>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Batch #</th>
                      <th>Expiry</th>
                      <th>Invoiced</th>
                      <th>Rate (₹)</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedInvoice.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700 }}>{it.medicine_name || it.raw_medicine_name}</td>
                        <td style={{ fontFamily: "monospace" }}>{it.batch_number}</td>
                        <td>{it.expiry_date}</td>
                        <td style={{ fontWeight: 700 }}>{it.quantity}</td>
                        <td>₹{Number(it.purchase_rate).toFixed(2)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>₹{Number(it.total_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setSelectedInvoice(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
