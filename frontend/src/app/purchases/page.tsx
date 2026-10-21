"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  X,
  Eye,
  Check,
  Ban,
  PackageCheck,
  Calendar,
  Layers,
  FileText,
  Building2,
  Package,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  Clock,
  MapPin,
  PlusCircle,
  Upload,
  Scan,
  ShieldAlert,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import StockingAssistant from "@/components/StockingAssistant";
import {
  getPurchases,
  getPurchase,
  createPurchaseDraft,
  acceptPurchaseInvoice,
  cancelPurchaseInvoice,
  scanDistributorInvoice,
  verifyPhysicalDelivery,
  confirmDelivery,
  getSuppliers,
  getMedicines,
  getLocations,
  PurchaseInvoiceRecord,
  SupplierRecord,
  Medicine,
  PhysicalLocation,
  CreatePurchaseDraftPayload,
  DeliveryDiscrepancyReport,
  ActualScanPayload,
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
  const [showStockingAssistant, setShowStockingAssistant] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceRecord | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState<boolean>(false);
  const [acceptLocationId, setAcceptLocationId] = useState<number>(0);

  // Distributor OCR Scan State (PRD Rule 11)
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false);
  const [ocrParsing, setOcrParsing] = useState<boolean>(false);
  const [rawOcrInputText, setRawOcrInputText] = useState<string>("");

  // Physical Delivery Verification Matrix State (PRD Rule 12)
  const [showVerifyDeliveryModal, setShowVerifyDeliveryModal] = useState<boolean>(false);
  const [discrepancyReport, setDiscrepancyReport] = useState<DeliveryDiscrepancyReport | null>(null);
  const [verifyingDelivery, setVerifyingDelivery] = useState<boolean>(false);
  const [deliveryCounts, setDeliveryCounts] = useState<ActualScanPayload[]>([]);
  const [verifiedDeliveryId, setVerifiedDeliveryId] = useState<number | null>(null);


  const handleScanOcrInvoice = async () => {
    if (!rawOcrInputText.trim()) {
      setActionError("Please paste raw invoice OCR text or upload invoice document.");
      return;
    }
    setOcrParsing(true);
    setActionError(null);
    try {
      const res = await scanDistributorInvoice(rawOcrInputText.trim());
      setActionSuccess(`Distributor Draft Invoice ${res.data.invoice_number} created via OCR!`);
      setShowOcrModal(false);
      setRawOcrInputText("");
      loadData();
    } catch (err: unknown) {
      setActionError((err instanceof Error ? err.message : "") || "Failed to parse distributor invoice OCR.");
    } finally {
      setOcrParsing(false);
    }
  };

  const handleRunDeliveryVerification = async (inv: PurchaseInvoiceRecord) => {
    setVerifyingDelivery(true);
    setDiscrepancyReport(null);
    setVerifiedDeliveryId(null);
    setActionError(null);
    try {
      const detail = (await getPurchase(inv.id)).invoice;
      setSelectedInvoice(detail);
      setDeliveryCounts((detail.items || []).map((item) => ({
        medicine_name: item.medicine_name || item.raw_medicine_name || "",
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        actual_quantity: 0,
        mrp: item.mrp || undefined,
        medicine_id: item.medicine_id,
      })));
      setShowVerifyDeliveryModal(true);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Cannot load invoice for counting.");
    } finally { setVerifyingDelivery(false); }
  };

  const compareDelivery = async () => {
    if (!selectedInvoice) return;
    if (deliveryCounts.some((line) => !Number.isInteger(line.actual_quantity) || line.actual_quantity < 0 || !line.batch_number.trim() || !line.expiry_date)) {
      setActionError("Enter a whole received quantity, batch and expiry for each line."); return;
    }
    setVerifyingDelivery(true);
    setActionError(null);
    try {
      const result = await verifyPhysicalDelivery(selectedInvoice.id, deliveryCounts);
      setDiscrepancyReport(result.report);
      setVerifiedDeliveryId(selectedInvoice.id);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Cannot compare delivery.");
    } finally { setVerifyingDelivery(false); }
  };

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
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : "") || "Failed to load purchase invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
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

  const handleItemChange = (index: number, field: string, value: string | number) => {
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
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to create invoice draft.");
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
          received_items: verifiedDeliveryId === selectedInvoice.id ? (selectedInvoice.items || []).map((item, index) => ({
            item_id: item.id,
            received_quantity: deliveryCounts[index].actual_quantity,
            batch_number: deliveryCounts[index].batch_number,
            expiry_date: deliveryCounts[index].expiry_date,
          })) : undefined,
        });

        setActionSuccess(
          `Invoice ${selectedInvoice.invoice_number} accepted! Batches created and inventory incremented.`
        );
        setTimeout(() => {
          setShowAcceptModal(false);
          setSelectedInvoice(null);
          loadData();
        }, 800);
      } catch (err: unknown) {
        setActionError((err instanceof Error ? err.message : "") || "Failed to accept purchase invoice.");
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
      } catch (err: unknown) {
        alert((err instanceof Error ? err.message : "") || "Failed to cancel invoice.");
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
    <div className="purchases-1">
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Purchases & Invoices</h1>
          <p className="page-subtitle">
            Distributor Inward Verification • Two-Stage Inventory Booking • Store #1
          </p>
        </div>

        <div className="purchases-2">
          <ThemeToggle />
          <button className="btn btn-secondary" onClick={() => setShowStockingAssistant(true)}><Scan size={16} />Stock medicine from photo</button>
          <button
            onClick={() => setShowOcrModal(true)}
            
            className="btn btn-secondary purchases-3"
          >
            <Scan size={16} />
            <span>Scan Distributor Invoice (OCR)</span>
          </button>
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <PlusCircle size={16} />
            <span>New Purchase Draft</span>
          </button>
        </div>
      </header>

      {showStockingAssistant && <StockingAssistant onClose={() => setShowStockingAssistant(false)} onUse={(medicine, extracted) => {
        setMedicines(previous => [medicine, ...previous.filter(item => item.id !== medicine.id)]);
        setDraftSupplierId(0); setDraftInvoiceNumber("");
        setDraftInvoiceDate(new Date().toISOString().split("T")[0]);
        setDraftItems([{ medicine_id: medicine.id, batch_number: extracted.batch_number || "",
          expiry_date: extracted.expiry_date || "", quantity: 1, purchase_rate: 0, mrp: extracted.mrp || 0 }]);
        setShowStockingAssistant(false); setShowCreateModal(true);
      }} />}
      {/* Main Body */}
      <div  className="page-body purchases-4">
        {/* Two-Stage Protocol Notice */}
        <div
          className="purchases-5"
        >
          <span className="purchases-6">
            <FileText size={18} />
          </span>
          <div>
            <strong className="purchases-7">
              Two-Stage Procurement Protocol (PRD Rule 8 & 11):
            </strong>{" "}
            <span className="purchases-8">
              Wholesale invoices are saved in DRAFT status with zero stock mutation. Batches and physical units are only
              booked when a licensed pharmacist confirms physical quantities upon delivery.
            </span>
          </div>
        </div>

        {/* Metrics Overview Row */}
        <div
          className="purchases-9"
        >
          <div  className="card purchases-10">
            <div className="purchases-11">
              <span className="purchases-12">
                Total Invoices
              </span>
              <span className="status-badge info">
                <span className="badge-icon"><FileText size={12} /></span>
                <span>Ledger</span>
              </span>
            </div>
            <div className="purchases-13">
              {totalCount}
            </div>
            <div className="purchases-14">
              Total wholesale distributor invoices
            </div>
          </div>

          <div  className="card purchases-15">
            <div className="purchases-16">
              <span className="purchases-17">
                Pending Inward
              </span>
              <span className="status-badge med">
                <span className="badge-icon"><AlertTriangle size={12} /></span>
                <span>Drafts</span>
              </span>
            </div>
            <div className="purchases-18">
              {pendingInwardCount}
            </div>
            <div className="purchases-19">
              Awaiting physical delivery count
            </div>
          </div>

          <div  className="card purchases-20">
            <div className="purchases-21">
              <span className="purchases-22">
                Accepted & Stocked
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Booked</span>
              </span>
            </div>
            <div className="purchases-23">
              {acceptedCount}
            </div>
            <div className="purchases-24">
              Verified lots booked into inventory
            </div>
          </div>

          <div  className="card purchases-25">
            <div className="purchases-26">
              <span className="purchases-27">
                Inward Inventory Value
              </span>
              <span className="status-badge high">
                <span className="badge-icon"><CheckCircle2 size={12} /></span>
                <span>Cost</span>
              </span>
            </div>
            <div className="purchases-28">
              ₹{totalInwardValue.toFixed(2)}
            </div>
            <div className="purchases-29">
              Cumulative wholesale acquisition cost
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="purchases-30"
        >
          <div className="purchases-31">
            <div className="purchases-32">
              <Search
                size={16}
                className="purchases-33"
              />
              <input
                type="text"
                placeholder="Search invoice # or distributor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                
                className="form-input purchases-34"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="purchases-35" aria-label="Close dialog"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              
              className="form-select purchases-36"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft (Pending Inward)</option>
              <option value="accepted">Accepted & Stocked</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              
              className="form-select purchases-37"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="purchases-38">
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
                <th className="purchases-39">Actions</th>
              </tr>
            </thead>
            <VirtualTableBody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="purchases-40">
                    <div className="purchases-41">
                      Loading purchase invoices...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="purchases-42">
                    <div className="purchases-43">
                      {error}
                    </div>
                    <button onClick={loadData} className="btn btn-secondary">
                      Retry
                    </button>
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="purchases-44">
                    <div className="purchases-45">
                      <span className="purchases-46">
                        <FileText size={32} />
                      </span>
                      <div className="purchases-47">
                        No purchase invoices found
                      </div>
                      <div className="purchases-48">
                        Record your first wholesale invoice draft to begin inward stock verification.
                      </div>
                      <button onClick={handleOpenCreate}  className="btn btn-primary purchases-49">
                        <PlusCircle size={16} />
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
                        <div className="purchases-50">
                          <span className="purchases-51">
                            {inv.invoice_number}
                          </span>
                          <span className="purchases-52">
                            {inv.invoice_date}
                          </span>
                        </div>
                      </td>

                      {/* Supplier */}
                      <td>
                        <div className="purchases-53">
                          <span className="purchases-54">
                            <Building2 size={14} />
                          </span>
                          <span className="purchases-55">
                            {inv.supplier_name || `Supplier #${inv.supplier_id}`}
                          </span>
                        </div>
                      </td>

                      {/* Items */}
                      <td>
                        <span className="purchases-56">
                          {(inv.items || []).length} line items
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td>
                        <span className="purchases-57">
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
                            <span className="badge-icon"><CheckCircle2 size={11} /></span>
                            <span>Stock Booked</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="status-badge low">
                            <span className="badge-icon"><OctagonAlert size={11} /></span>
                            <span>Cancelled</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="purchases-58">
                        <div className="purchases-59">
                          <button
                            onClick={() => handleViewDetail(inv)}
                            
                            className="btn btn-secondary purchases-60"
                            title="View Invoice Details"
                          >
                            <Eye size={13} />
                            <span>Details</span>
                          </button>

                          {isDraft && (
                            <>
                              <button
                                onClick={() => handleRunDeliveryVerification(inv)}
                                
                                className="btn btn-secondary purchases-61"
                                title="Run physical delivery discrepancy check"
                              >
                                <ShieldAlert size={13} />
                                <span>Verify Delivery (AI)</span>
                              </button>
                              <button
                                onClick={() => handleOpenAccept(inv)}
                                
                                className="btn btn-primary purchases-62"
                              >
                                <PackageCheck size={13} />
                                <span>Book Stock</span>
                              </button>
                              <button
                                onClick={() => handleCancelInvoice(inv.id)}
                                
                                title="Cancel Draft"
                                className="btn-icon purchases-63"
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
            </VirtualTableBody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          Modal: Create Purchase Draft (PRD Rule 8)
          ===================================================================== */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setShowCreateModal(false)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content purchases-64">
            <div className="modal-header">
              <div className="purchases-65">
                <span className="purchases-66">
                  <FileText size={18} />
                </span>
                <div>
                  <h2 className="purchases-67">
                    New Distributor Purchase Draft
                  </h2>
                  <p className="purchases-68">
                    PRD Rule 8: Creates draft without mutating active inventory
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="btn-icon" disabled={isSubmitting} aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitDraft} className="purchases-69">
              <div className="modal-body">
                {actionError && (
                  <div
                    className="purchases-70"
                  >
                    {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div
                    className="purchases-71"
                  >
                    {actionSuccess}
                  </div>
                )}

                {/* Supplier & Invoice metadata */}
                <div className="purchases-72">
                  <div className="form-group">
                    <label className="form-label" htmlFor="purchases-field-1">Distributor / Supplier *</label>
                    <select
                      required
                      value={draftSupplierId}
                      onChange={(e) => setDraftSupplierId(Number(e.target.value))}
                      className="form-select" id="purchases-field-1"
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
                    <label className="form-label" htmlFor="purchases-field-2">Distributor Invoice # *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-DIST-9481"
                      value={draftInvoiceNumber}
                      onChange={(e) => setDraftInvoiceNumber(e.target.value)}
                      className="form-input" id="purchases-field-2"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="purchases-field-3">Invoice Date</label>
                    <input
                      type="date"
                      value={draftInvoiceDate}
                      onChange={(e) => setDraftInvoiceDate(e.target.value)}
                      className="form-input" id="purchases-field-3"
                    />
                  </div>
                </div>

                {/* Line items repeater */}
                <div className="form-group">
                  <div className="purchases-73">
                    <label className="form-label">Inward Line Items</label>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="purchases-74"
                    >
                      + Add Item
                    </button>
                  </div>

                  <div className="purchases-75">
                    {draftItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="purchases-76"
                      >
                        <select
                          value={item.medicine_id}
                          onChange={(e) => handleItemChange(idx, "medicine_id", Number(e.target.value))}
                          
                          className="form-select purchases-77"
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
                          
                          className="form-input purchases-78"
                        />

                        <input
                          type="date"
                          required
                          value={item.expiry_date}
                          onChange={(e) => handleItemChange(idx, "expiry_date", e.target.value)}
                          
                          className="form-input purchases-79"
                        />

                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value) || 0)}
                          
                          className="form-input purchases-80"
                        />

                        <input
                          type="number"
                          step="0.01"
                          placeholder="Rate ₹"
                          value={item.purchase_rate}
                          onChange={(e) => handleItemChange(idx, "purchase_rate", parseFloat(e.target.value) || 0)}
                          
                          className="form-input purchases-81"
                        />

                        <input
                          type="number"
                          step="0.01"
                          placeholder="MRP ₹"
                          value={item.mrp}
                          onChange={(e) => handleItemChange(idx, "mrp", parseFloat(e.target.value) || 0)}
                          
                          className="form-input purchases-82"
                        />

                        {draftItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            
                            className="btn-icon purchases-83" aria-label="Close dialog"
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
          <div  onClick={(e) => e.stopPropagation()} className="modal-content purchases-84">
            <div className="modal-header">
              <div className="purchases-85">
                <span className="purchases-86">
                  <PackageCheck size={18} />
                </span>
                <div>
                  <h2 className="purchases-87">
                    Physical Inward Verification & Acceptance
                  </h2>
                  <p className="purchases-88">
                    Books batches and physical stock into pharmacy shelves
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAcceptModal(false)} className="btn-icon" disabled={isSubmitting} aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {actionError && (
                <div
                  className="purchases-89"
                >
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div
                  className="purchases-90"
                >
                  {actionSuccess}
                </div>
              )}

              <div
                className="purchases-91"
              >
                <div>
                  <span className="purchases-92">Invoice: </span>
                  <strong className="purchases-93">{selectedInvoice.invoice_number}</strong>
                </div>
                <div>
                  <span className="purchases-94">Distributor: </span>
                  <strong className="purchases-95">{selectedInvoice.supplier_name}</strong>
                </div>
                <div>
                  <span className="purchases-96">Invoiced Total: </span>
                  <strong className="purchases-97">₹{Number(selectedInvoice.total_amount).toFixed(2)}</strong>
                </div>
              </div>

              {/* Destination Shelf Allocation */}
              <div className="form-group">
                <label className="form-label" htmlFor="purchases-field-4">Initial Storage Shelf / Rack Allocation *</label>
                <select
                  required
                  value={acceptLocationId}
                  onChange={(e) => setAcceptLocationId(Number(e.target.value))}
                  className="form-select" id="purchases-field-4"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.location_type ? `(${loc.location_type})` : ""}
                    </option>
                  ))}
                </select>
                <span className="purchases-98">
                  All verified batches in this shipment will be initially placed on this shelf.
                </span>
              </div>

              <div
                className="purchases-99"
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
          <div  onClick={(e) => e.stopPropagation()} className="modal-content purchases-100">
            <div className="modal-header">
              <div className="purchases-101">
                <span className="purchases-102">
                  <FileText size={18} />
                </span>
                <div>
                  <h2 className="purchases-103">
                    Invoice #{selectedInvoice.invoice_number}
                  </h2>
                  <p className="purchases-104">
                    {selectedInvoice.supplier_name} • {selectedInvoice.invoice_date}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div  className="modal-body purchases-105">
              <div className="purchases-106">
                <div>
                  <div className="purchases-107">Status</div>
                  <div className="purchases-108">
                    {selectedInvoice.status?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="purchases-109">Total Value</div>
                  <div className="purchases-110">
                    ₹{Number(selectedInvoice.total_amount).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="purchases-111">Verified At</div>
                  <div className="purchases-112">
                    {selectedInvoice.verified_at ? new Date(selectedInvoice.verified_at).toLocaleDateString("en-IN") : "Pending"}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="table-container">
                <table  className="data-table purchases-113">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Batch #</th>
                      <th>Expiry</th>
                      <th>Invoiced</th>
                      <th>Rate (₹)</th>
                      <th className="purchases-114">Total</th>
                    </tr>
                  </thead>
                  <VirtualTableBody>
                    {(selectedInvoice.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td className="purchases-115">{it.medicine_name || it.raw_medicine_name}</td>
                        <td className="purchases-116">{it.batch_number}</td>
                        <td>{it.expiry_date}</td>
                        <td className="purchases-117">{it.quantity}</td>
                        <td>₹{Number(it.purchase_rate).toFixed(2)}</td>
                        <td className="purchases-118">₹{Number(it.total_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </VirtualTableBody>
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

      {/* =====================================================================
          Modal: Distributor Invoice OCR Scan (PRD Phase 3 & Rule 11)
          ===================================================================== */}
      {showOcrModal && (
        <div className="modal-backdrop" onClick={() => !ocrParsing && setShowOcrModal(false)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content purchases-119">
            <div className="modal-header">
              <div className="purchases-120">
                <span className="purchases-121">
                  <Scan size={18} />
                </span>
                <div>
                  <h2 className="purchases-122">
                    Distributor Invoice OCR Parsing
                  </h2>
                  <p className="purchases-123">
                    PRD Rule 11: Converts unstructured wholesale invoice OCR into a reviewable Purchase Draft
                  </p>
                </div>
              </div>
              <button onClick={() => setShowOcrModal(false)} className="btn-icon" disabled={ocrParsing} aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label" htmlFor="purchases-field-5">Paste Wholesale Invoice OCR Text / Table *</label>
                <textarea
                  rows={8}
                  placeholder={`Paste distributor invoice OCR text e.g.:
DISTRIBUTOR: MEDLIFE WHOLESALE PVT LTD
INVOICE NO: MW-9841
DATE: 2026-09-15
LINE 1: Paracetamol 500mg | BATCH: B-102 | EXP: 2027-11-30 | QTY: 100 | RATE: 12.50 | MRP: 22.00
LINE 2: Amoxicillin 250mg | BATCH: AMX-404 | EXP: 2027-08-31 | QTY: 50 | RATE: 45.00 | MRP: 78.00`}
                  value={rawOcrInputText}
                  onChange={(e) => setRawOcrInputText(e.target.value)}
                  
                  className="form-textarea purchases-124" id="purchases-field-5"
                />
              </div>

              <div
                className="purchases-125"
              >
                <strong>Human-in-the-Loop Protocol:</strong> Scanning creates a DRAFT purchase invoice. Physical stock will NOT be added to inventory until verified upon delivery.
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowOcrModal(false)} className="btn btn-secondary" disabled={ocrParsing}>
                Cancel
              </button>
              <button onClick={handleScanOcrInvoice} className="btn btn-primary" disabled={ocrParsing || !rawOcrInputText.trim()}>
                {ocrParsing ? "Parsing Table..." : "Extract Purchase Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Physical Delivery Verification Discrepancy Matrix (PRD Rule 12)
          ===================================================================== */}
      {showVerifyDeliveryModal && selectedInvoice && (
        <div className="modal-backdrop" onClick={() => !verifyingDelivery && setShowVerifyDeliveryModal(false)}>
          <div  onClick={(e) => e.stopPropagation()} className="modal-content purchases-126">
            <div className="modal-header">
              <div className="purchases-127">
                <span className="purchases-128">
                  <ShieldAlert size={18} />
                </span>
                <div>
                  <h2 className="purchases-129">
                    Physical Delivery Discrepancy Matrix
                  </h2>
                  <p className="purchases-130">
                    Enter the quantities, batch numbers and expiry dates physically received before booking stock.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowVerifyDeliveryModal(false)} className="btn-icon" aria-label="Close dialog">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {actionError && <p role="alert" className="purchases-131">{actionError}</p>}
              <p>Count every line independently. Quantities start at zero until you enter the received stock.</p>
              <div className="table-container"><table className="data-table">
                <thead><tr><th>Medicine</th><th>Expected</th><th>Received</th><th>Actual batch</th><th>Actual expiry</th></tr></thead>
                <VirtualTableBody>{deliveryCounts.map((line, index) => <tr key={index}>
                  <td>{line.medicine_name}</td><td>{selectedInvoice.items?.[index]?.quantity}</td>
                  <td><input aria-label={`Received quantity ${index + 1}`} className="form-input" type="number" min="0" step="1" value={line.actual_quantity} disabled={verifyingDelivery} onChange={(event) => { setDeliveryCounts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, actual_quantity: Number(event.target.value) } : row)); setVerifiedDeliveryId(null); setDiscrepancyReport(null); }} /></td>
                  <td><input aria-label={`Received batch ${index + 1}`} className="form-input" value={line.batch_number} disabled={verifyingDelivery} onChange={(event) => { setDeliveryCounts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, batch_number: event.target.value } : row)); setVerifiedDeliveryId(null); setDiscrepancyReport(null); }} /></td>
                  <td><input aria-label={`Received expiry ${index + 1}`} className="form-input" type="date" value={line.expiry_date} disabled={verifyingDelivery} onChange={(event) => { setDeliveryCounts((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, expiry_date: event.target.value } : row)); setVerifiedDeliveryId(null); setDiscrepancyReport(null); }} /></td>
                </tr>)}</VirtualTableBody>
              </table></div>
              <button type="button" className="btn btn-secondary" disabled={verifyingDelivery || !deliveryCounts.length} onClick={compareDelivery}>Compare received stock</button>

              {verifyingDelivery ? (
                <div className="purchases-132">
                  Analyzing physical delivery scans against invoice expected quantities...
                </div>
              ) : discrepancyReport ? (
                <div className="purchases-133">
                  {/* Summary Bar */}
                  <div
                    className="purchases-134"
                  >
                    <div>
                      <div className="purchases-135">Expected Items</div>
                      <div className="purchases-136">
                        {discrepancyReport.total_expected_items} ({discrepancyReport.total_expected_units} units)
                      </div>
                    </div>
                    <div>
                      <div className="purchases-137">Actual Scanned</div>
                      <div className="purchases-138">
                        {discrepancyReport.total_actual_items} ({discrepancyReport.total_actual_units} units)
                      </div>
                    </div>
                    <div>
                      <div className="purchases-139">Matched Count</div>
                      <div className="purchases-140">
                        {discrepancyReport.matched_items_count} lines
                      </div>
                    </div>
                    <div>
                      <div className="purchases-141">Discrepancies</div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.9375rem",
                          color: discrepancyReport.discrepancy_count > 0 ? "var(--status-low-text)" : "var(--status-high-text)",
                        }}
                      >
                        {discrepancyReport.discrepancy_count} flags
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy Lines Matrix */}
                  <div className="table-container">
                    <table  className="data-table purchases-142">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>Status Badge</th>
                          <th>Invoiced Qty</th>
                          <th>Actual Scanned</th>
                          <th>Batch (Exp vs Act)</th>
                          <th className="purchases-143">Diff</th>
                        </tr>
                      </thead>
                      <VirtualTableBody>
                        {discrepancyReport.lines.map((line, idx) => {
                          const isMatched = line.status === "MATCHED";
                          return (
                            <tr key={idx}>
                              <td className="purchases-144">{line.medicine_name}</td>
                              <td>
                                <span className={`status-badge ${isMatched ? "high" : "low"}`}>
                                  {line.status}
                                </span>
                              </td>
                              <td>{line.expected_quantity}</td>
                              <td className="purchases-145">{line.actual_quantity}</td>
                              <td className="purchases-146">
                                {line.expected_batch} {line.actual_batch !== line.expected_batch ? `-> ${line.actual_batch}` : ""}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: line.quantity_difference !== 0 ? "var(--status-low-text)" : "var(--status-high-text)" }}>
                                {line.quantity_difference > 0 ? `+${line.quantity_difference}` : line.quantity_difference}
                              </td>
                            </tr>
                          );
                        })}
                      </VirtualTableBody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowVerifyDeliveryModal(false)} className="btn btn-secondary">
                Close
              </button>
              <button
                onClick={() => {
                  setShowVerifyDeliveryModal(false);
                  handleOpenAccept(selectedInvoice);
                }}
                disabled={verifyingDelivery || verifiedDeliveryId !== selectedInvoice.id}
                className="btn btn-primary"
              >
                Proceed to Inward Stock Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
