"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Package,
  Bookmark,
  CheckCircle2,
  AlertTriangle,
  FileText,
  CreditCard,
  User,
  Percent,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Receipt,
  RotateCcw,
  X,
  History,
  Camera,
  Upload,
} from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";
import {
  getMedicines,
  getBatches,
  createSale,
  getSales,
  recognizeMedicine,
  Medicine,
  BatchItem,
  CreateSalePayload,
  SaleReceipt,
  RecognitionPipelineResponse,
} from "@/lib/api";

interface CartItem {
  medicine: Medicine;
  batch?: BatchItem;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  available_stock: number;
}

export default function POSTerminalPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // POS Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [doctorName, setDoctorName] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "card">("cash");
  const [cashTendered, setCashTendered] = useState<string>("");
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  // Post-sale / Receipt modal
  const [recentReceipt, setRecentReceipt] = useState<SaleReceipt | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [salesHistory, setSalesHistory] = useState<SaleReceipt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Camera packaging recognition state (Phase 2 Vision-First POS)
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [cvRecognizing, setCvRecognizing] = useState<boolean>(false);
  const [cvResult, setCvResult] = useState<RecognitionPipelineResponse | null>(null);
  const [cvImagePreview, setCvImagePreview] = useState<string | null>(null);

  const handleCvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      setCvImagePreview(reader.result as string);
      setCvRecognizing(true);
      setCvResult(null);
      try {
        const res = await recognizeMedicine(base64);
        setCvResult(res);
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to process packaging image.");
      } finally {
        setCvRecognizing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddCvMatchedMedicine = (medId: number) => {
    const med = medicines.find((m) => m.id === medId);
    if (med) {
      handleAddToCart(med);
      setSuccessMessage(`Verified & Added ${med.brand_name} to cart via Camera Recognition.`);
      setShowCameraModal(false);
    }
  };

  const [isSubmitting, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load medicines & stock batches
  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const [medRes, batchRes] = await Promise.all([
        getMedicines({ per_page: 100 }),
        getBatches({ has_stock: true }),
      ]);
      setMedicines(medRes.items || []);
      setBatches(batchRes.batches || []);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load medicine catalog.");
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Filter medicines based on search
  const filteredMedicines = medicines.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.brand_name.toLowerCase().includes(q) ||
      (m.generic_name && m.generic_name.toLowerCase().includes(q)) ||
      (m.manufacturer && m.manufacturer.toLowerCase().includes(q))
    );
  });

  // Calculate total stock for each medicine
  const getMedicineStock = (medId: number) => {
    const medBatches = batches.filter((b) => b.medicine_id === medId);
    return medBatches.reduce((acc, b) => acc + (b.total_available || 0), 0);
  };

  // Add item to cart (Automatic FEFO Batch candidate selection)
  const handleAddToCart = (medicine: Medicine) => {
    const totalStock = getMedicineStock(medicine.id);
    const existing = cart.find((item) => item.medicine.id === medicine.id);

    if (existing) {
      if (existing.quantity >= totalStock && totalStock > 0) {
        setErrorMessage(`Cannot exceed available physical stock (${totalStock} units) for ${medicine.brand_name}.`);
        return;
      }
      setCart(
        cart.map((item) =>
          item.medicine.id === medicine.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      // Find earliest expiring batch for this medicine
      const medBatches = batches
        .filter((b) => b.medicine_id === medicine.id && b.total_available > 0)
        .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

      const fefoBatch = medBatches[0];
      const unitPrice = fefoBatch?.mrp || medicine.selling_price || medicine.mrp || 0;

      setCart([
        ...cart,
        {
          medicine,
          batch: fefoBatch,
          quantity: 1,
          unit_price: Number(unitPrice),
          discount_pct: 0,
          available_stock: totalStock,
        },
      ]);
    }
    setErrorMessage(null);
  };

  // Update item quantity
  const handleUpdateQuantity = (index: number, delta: number) => {
    const updated = [...cart];
    const item = updated[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      if (item.available_stock > 0 && newQty > item.available_stock) {
        setErrorMessage(`Cannot exceed available stock of ${item.available_stock} units.`);
        return;
      }
      item.quantity = newQty;
    }
    setCart(updated);
    setErrorMessage(null);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  // Cart Calculations
  const grossSubtotal = cart.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  const itemDiscounts = cart.reduce(
    (sum, item) => sum + (item.unit_price * item.quantity * (item.discount_pct / 100)),
    0
  );

  const totalDiscount = itemDiscounts + (Number(orderDiscount) || 0);

  // Simplified tax calculation matching medicine GST or standard 12%
  const estimatedTax = cart.reduce((sum, item) => {
    const itemNet = (item.unit_price * item.quantity) * (1 - item.discount_pct / 100);
    const taxRate = item.medicine.gst_percentage || 12;
    return sum + (itemNet * (taxRate / 100));
  }, 0);

  const grandTotal = Math.max(0, grossSubtotal - totalDiscount + estimatedTax);

  // Check if any Rx medicines are present
  const hasRxMedicines = cart.some((item) => item.medicine.is_prescription_only);

  // Process Checkout
  const handleCheckout = () => {
    if (cart.length === 0) {
      setErrorMessage("Cart is empty. Please add items to bill.");
      return;
    }

    if (hasRxMedicines && !doctorName.trim()) {
      setErrorMessage(
        "Prescription Required: Cart contains Schedule H / Rx medicines. Prescribing Doctor Name is mandatory."
      );
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const payload: CreateSalePayload = {
          customer: {
            name: customerName.trim() || "Walk-in Customer",
            phone: customerPhone.trim() || undefined,
            doctor_name: doctorName.trim() || undefined,
          },
          items: cart.map((item) => ({
            medicine_id: item.medicine.id,
            quantity: item.quantity,
            batch_id: item.batch?.id,
            discount_percentage: item.discount_pct || 0,
          })),
          payments: [
            {
              payment_method: paymentMethod,
              amount: Number(grandTotal.toFixed(2)),
            },
          ],
          discount_amount: Number(orderDiscount) || 0,
          notes: notes.trim() || undefined,
        };

        const res = await createSale(payload);
        setRecentReceipt(res.sale);
        setSuccessMessage(`Invoice ${res.sale.invoice_number} generated successfully!`);

        // Reset cart
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setDoctorName("");
        setCashTendered("");
        setOrderDiscount(0);
        setNotes("");

        // Refresh stock in background
        loadCatalog();
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to complete transaction.");
      }
    });
  };

  const handleOpenHistory = async () => {
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await getSales({ per_page: 25 });
      setSalesHistory(res.items || []);
    } catch (err: any) {
      setErrorMessage("Failed to load invoice history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Cash change calculation
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, tenderedNum - grandTotal);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header — Aligned 64px height */}
      <header className="page-header">
        <div>
          <h1 className="page-title">POS Billing Terminal</h1>
          <p className="page-subtitle">
            FEFO Stock Dispensing • GST Compliance • Retail Pharmacy Counter
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
          <button
            onClick={() => {
              setCvResult(null);
              setCvImagePreview(null);
              setShowCameraModal(true);
            }}
            className="btn btn-primary"
            style={{ backgroundColor: "#1e6ee8" }}
          >
            <Camera size={15} />
            <span>Scan Packaging (CV)</span>
          </button>
          <button onClick={handleOpenHistory} className="btn btn-secondary">
            <History size={15} />
            <span>Recent Invoices</span>
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-subtle)",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            <span style={{ color: "var(--status-high-text)" }}>●</span>
            <span>Terminal 01</span>
          </div>
        </div>
      </header>

      {/* Main Terminal View */}
      <div
        className="page-body"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left: Medicine Search & Quick Catalog */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Barcode / Name Search input */}
          <div style={{ position: "relative", width: "100%" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Type medicine name, molecule, or scan product barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{
                paddingLeft: "2.75rem",
                height: "44px",
                fontSize: "0.9375rem",
                borderRadius: "var(--radius-md)",
              }}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Alert messages */}
          {errorMessage && (
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(255, 128, 128, 0.12)",
                border: "1px solid var(--status-low-border)",
                color: "var(--status-low-text)",
                fontSize: "0.8125rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
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
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
              </div>
              {recentReceipt && (
                <button
                  onClick={() => setRecentReceipt(recentReceipt)}
                  className="btn btn-secondary"
                  style={{ height: "26px", fontSize: "0.6875rem", padding: "0 0.5rem" }}
                >
                  <Printer size={12} />
                  <span>View Receipt</span>
                </button>
              )}
            </div>
          )}

          {/* Medicines Quick Catalog Table */}
          <div className="table-container" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medicine & Molecular Form</th>
                  <th>Stock Available</th>
                  <th>MRP</th>
                  <th>Schedule</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingCatalog ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                        Loading medicine catalog...
                      </span>
                    </td>
                  </tr>
                ) : filteredMedicines.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "3rem 1rem" }}>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                        No medicines match &quot;{searchQuery}&quot;
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredMedicines.map((med) => {
                    const totalStock = getMedicineStock(med.id);
                    const isOutOfStock = totalStock <= 0;

                    return (
                      <tr key={med.id}>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                            <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                              {med.brand_name}
                            </span>
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                              {med.generic_name || "—"} {med.strength ? `• ${med.strength}` : ""}
                            </span>
                          </div>
                        </td>

                        <td>
                          {isOutOfStock ? (
                            <span className="status-badge low">
                              <span className="badge-icon"><AlertTriangle size={11} /></span>
                              <span>Out of Stock</span>
                            </span>
                          ) : (
                            <span className="status-badge high">
                              <span className="badge-icon"><CheckCircle2 size={11} /></span>
                              <span>{totalStock} units</span>
                            </span>
                          )}
                        </td>

                        <td>
                          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                            ₹{med.selling_price || med.mrp ? Number(med.selling_price || med.mrp).toFixed(2) : "0.00"}
                          </span>
                        </td>

                        <td>
                          {med.is_prescription_only ? (
                            <span className="status-badge med" title="Doctor prescription required">
                              <span className="badge-icon"><AlertTriangle size={11} /></span>
                              <span>Rx Only</span>
                            </span>
                          ) : (
                            <span className="status-badge high" title="General sale permitted">
                              <span className="badge-icon"><CheckCircle2 size={11} /></span>
                              <span>OTC</span>
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => handleAddToCart(med)}
                            className="btn btn-primary"
                            style={{ height: "30px", fontSize: "0.75rem", padding: "0 0.75rem" }}
                            disabled={isOutOfStock}
                          >
                            <Plus size={14} />
                            <span>Add</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Active Cart & Checkout Panel */}
        <div
          className="card"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            backgroundColor: "var(--bg-card)",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--brand-primary)" }}>
                <ShoppingBag size={18} />
              </span>
              <strong style={{ fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                Current Bill
              </strong>
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {cart.length} {cart.length === 1 ? "item" : "items"}
            </span>
          </div>

          {/* Customer Metadata (Optional / Default Walk-in) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="form-input"
                style={{ fontSize: "0.75rem", height: "32px" }}
              />
              <input
                type="tel"
                placeholder="Mobile (WhatsApp)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="form-input"
                style={{ fontSize: "0.75rem", height: "32px" }}
              />
            </div>

            {hasRxMedicines && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <input
                  type="text"
                  required
                  placeholder="Prescribing Doctor Name * (Required for Rx)"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="form-input"
                  style={{
                    fontSize: "0.75rem",
                    height: "32px",
                    borderColor: !doctorName.trim() ? "var(--status-med-border)" : undefined,
                  }}
                />
                <span style={{ fontSize: "0.6875rem", color: "var(--status-med-text)" }}>
                  Schedule H requirement: Doctor verification recorded on receipt.
                </span>
              </div>
            )}
          </div>

          {/* Cart Line Items List */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              maxHeight: "260px",
              overflowY: "auto",
              paddingRight: "0.25rem",
            }}
          >
            {cart.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "2rem 1rem",
                  color: "var(--text-muted)",
                  fontSize: "0.8125rem",
                  border: "1px dashed var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                Cart is empty. Select medicines from catalog to dispense.
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                    padding: "0.625rem",
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                        {item.medicine.brand_name}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                        {item.batch ? `FEFO Batch: ${item.batch.batch_number}` : "Auto FEFO"} • ₹{item.unit_price.toFixed(2)}/unit
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="btn-icon"
                      style={{ width: "24px", height: "24px" }}
                      title="Remove Item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
                    {/* Quantity controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <button
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="btn-icon"
                        style={{ width: "24px", height: "24px" }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontWeight: 700, fontSize: "0.8125rem", minWidth: "20px", textAlign: "center" }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        className="btn-icon"
                        style={{ width: "24px", height: "24px" }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Total price */}
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                      ₹{(item.unit_price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method Selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Payment Mode
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`btn ${paymentMethod === "cash" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem" }}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("upi")}
                className={`btn ${paymentMethod === "upi" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem" }}
              >
                UPI / QR
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`btn ${paymentMethod === "card" ? "btn-primary" : "btn-secondary"}`}
                style={{ height: "34px", fontSize: "0.75rem" }}
              >
                Card
              </button>
            </div>
          </div>

          {/* Cash Change Calculator */}
          {paymentMethod === "cash" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div>
                <label className="form-label">Tendered (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="form-input"
                  style={{ height: "32px", fontSize: "0.8125rem" }}
                />
              </div>
              <div>
                <label className="form-label">Change Due</label>
                <div
                  style={{
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    fontWeight: 700,
                    color: "var(--status-high-text)",
                    fontSize: "0.875rem",
                  }}
                >
                  ₹{changeDue.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Financial Totals */}
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              fontSize: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
              <span>Subtotal:</span>
              <span>₹{grossSubtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
              <span>Estimated GST (Tax):</span>
              <span>₹{estimatedTax.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--status-high-text)" }}>
                <span>Discount:</span>
                <span>-₹{totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--text-primary)",
                fontWeight: 700,
                fontSize: "1.0625rem",
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "0.5rem",
                marginTop: "0.25rem",
              }}
            >
              <span>Total Payable:</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Complete Transaction Button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isSubmitting}
            className="btn btn-primary"
            style={{ height: "42px", fontSize: "0.875rem" }}
          >
            <Receipt size={16} />
            <span>{isSubmitting ? "Dispensing & Printing..." : `Charge ₹${grandTotal.toFixed(2)}`}</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          Modal: Printable Digital Receipt / Invoice
          ===================================================================== */}
      {recentReceipt && (
        <div className="modal-backdrop" onClick={() => setRecentReceipt(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <Receipt size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Tax Invoice #{recentReceipt.invoice_number}
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    {new Date(recentReceipt.sale_date).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <button onClick={() => setRecentReceipt(null)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: "1rem" }}>
              {/* Store & Regulatory Header */}
              <div style={{ textAlign: "center", borderBottom: "1px dashed var(--border-default)", paddingBottom: "0.75rem" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>
                  {recentReceipt.store?.name || "SmartPharm Store #1"}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {recentReceipt.store?.address || "Physical Pharmacy Terminal"} • Phone: {recentReceipt.store?.phone || "—"}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  GSTIN: <strong>{recentReceipt.store?.gstin || "N/A"}</strong> | DL: <strong>{recentReceipt.store?.drug_license_number || "N/A"}</strong>
                </div>
              </div>

              {/* Customer details */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Customer: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{recentReceipt.customer?.name || "Walk-in Customer"}</strong>
                  {recentReceipt.customer?.phone && (
                    <span style={{ color: "var(--text-muted)" }}> ({recentReceipt.customer.phone})</span>
                  )}
                </div>
                {recentReceipt.customer?.doctor_name && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Doctor: </span>
                    <strong style={{ color: "var(--text-primary)" }}>Dr. {recentReceipt.customer.doctor_name}</strong>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                    <th style={{ padding: "0.35rem 0", color: "var(--text-muted)" }}>Item</th>
                    <th style={{ padding: "0.35rem 0", color: "var(--text-muted)" }}>Batch</th>
                    <th style={{ padding: "0.35rem 0", color: "var(--text-muted)", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "0.35rem 0", color: "var(--text-muted)", textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentReceipt.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.5rem 0", color: "var(--text-primary)" }}>
                        <div style={{ fontWeight: 700 }}>{it.brand_name}</div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{it.generic_name}</div>
                      </td>
                      <td style={{ padding: "0.5rem 0", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {it.batch_number || "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0", textAlign: "center", fontWeight: 700 }}>
                        {it.quantity}
                      </td>
                      <td style={{ padding: "0.5rem 0", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>
                        ₹{it.total_price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Bill Totals */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", borderTop: "1px dashed var(--border-default)", paddingTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                  <span>Subtotal</span>
                  <span>₹{recentReceipt.subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                  <span>Tax (GST)</span>
                  <span>₹{recentReceipt.tax_amount.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-primary)", fontWeight: 700, fontSize: "0.9375rem" }}>
                  <span>Grand Total</span>
                  <span>₹{recentReceipt.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => window.print()} className="btn btn-primary" style={{ height: "34px" }}>
                <Printer size={15} />
                <span>Print Tax Invoice</span>
              </button>
              <button onClick={() => setRecentReceipt(null)} className="btn btn-secondary" style={{ height: "34px" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Recent Sales / Invoices History
          ===================================================================== */}
      {showHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ color: "var(--brand-primary)" }}>
                  <History size={18} />
                </span>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Recent Invoices & Transactions
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Store #1 POS dispensing logs
                  </p>
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "450px" }}>
              {loadingHistory ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                  Loading sales history...
                </div>
              ) : salesHistory.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                  No recent sales recorded yet.
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Date & Time</th>
                        <th>Customer</th>
                        <th>Total Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesHistory.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 700, fontFamily: "monospace" }}>{s.invoice_number}</td>
                          <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            {new Date(s.sale_date).toLocaleString("en-IN")}
                          </td>
                          <td>{s.customer?.name || "Walk-in"}</td>
                          <td style={{ fontWeight: 700 }}>₹{s.total_amount.toFixed(2)}</td>
                          <td>
                            <span className="status-badge high">
                              <span className="badge-icon"><CheckCircle2 size={10} /></span>
                              <span>{s.payment_status.toUpperCase()}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          Modal: Vision-First Camera Packaging Recognition (PRD Phase 2)
          ===================================================================== */}
      {showCameraModal && (
        <div className="modal-backdrop" onClick={() => !cvRecognizing && setShowCameraModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "640px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#1e3a5f",
                    border: "1px solid #1e6ee8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#87d1ff",
                  }}
                >
                  <Camera size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Camera Packaging Recognition (CV + OCR)
                  </h2>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    PRD Phase 2: Live Computer Vision Packaging Identification with Human Verification
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCameraModal(false)} className="btn-icon" disabled={cvRecognizing}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {/* File Upload / Camera Input */}
              <div
                style={{
                  border: "2px dashed var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.5rem",
                  textAlign: "center",
                  backgroundColor: "var(--bg-surface-elevated)",
                  cursor: "pointer",
                }}
                onClick={() => document.getElementById("cv-file-input")?.click()}
              >
                <input
                  id="cv-file-input"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleCvFileUpload}
                />

                {cvImagePreview ? (
                  <img
                    src={cvImagePreview}
                    alt="Packaging preview"
                    style={{ maxHeight: "180px", borderRadius: "var(--radius-sm)", margin: "0 auto", objectFit: "contain" }}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                    <Upload size={28} style={{ color: "var(--brand-primary)" }} />
                    <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)" }}>
                      Upload or Capture Packaging Image
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      Click to choose image file or capture photo via connected POS webcam
                    </div>
                  </div>
                )}
              </div>

              {/* Status / OCR Pipeline Output */}
              {cvRecognizing && (
                <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--brand-primary)", fontSize: "0.875rem" }}>
                  Running OpenCV packaging detection & PaddleOCR text extraction...
                </div>
              )}

              {cvResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                  {/* Quality Check Indicator */}
                  <div
                    style={{
                      padding: "0.625rem 0.875rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: cvResult.quality?.is_acceptable ? "rgba(125, 255, 149, 0.12)" : "rgba(255, 180, 80, 0.12)",
                      border: `1px solid ${cvResult.quality?.is_acceptable ? "var(--status-high-border)" : "var(--status-med-border)"}`,
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Image Quality Check: <strong>{cvResult.quality?.is_acceptable ? "Acceptable (Sharp)" : "Review Suggested"}</strong></span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                      Blur: {cvResult.quality?.blur_score?.toFixed(1) || "0"} | Glare: {cvResult.quality?.is_glare ? "Yes" : "No"}
                    </span>
                  </div>

                  {/* Recognition Match Candidate */}
                  {cvResult.match_result?.top_candidate ? (
                    <div
                      style={{
                        padding: "1rem",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.625rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            {cvResult.match_result.top_candidate.name}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            {cvResult.match_result.top_candidate.generic_name || "—"} • {cvResult.match_result.top_candidate.strength || ""}
                          </div>
                        </div>

                        <span
                          className={`status-badge ${
                            cvResult.match_result.top_candidate.confidence_level === "HIGH" ? "high" : "med"
                          }`}
                        >
                          {(cvResult.match_result.top_candidate.confidence_score * 100).toFixed(0)}% Confidence
                        </span>
                      </div>

                      {/* Human Verification Notice */}
                      <div
                        style={{
                          fontSize: "0.6875rem",
                          color: "var(--status-med-text)",
                          backgroundColor: "rgba(255, 180, 80, 0.08)",
                          padding: "0.5rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--status-med-border)",
                        }}
                      >
                        Human Verification Required: Pharmacist must confirm formulation match before adding to POS bill.
                      </div>

                      <button
                        onClick={() => handleAddCvMatchedMedicine(cvResult.match_result!.top_candidate!.medicine_id)}
                        className="btn btn-primary"
                        style={{ height: "36px", marginTop: "0.25rem" }}
                      >
                        <Plus size={15} />
                        <span>Verify & Add to Bill Cart</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "1rem", color: "var(--status-low-text)", fontSize: "0.8125rem" }}>
                      Unable to confidently identify this medicine. Capture another image or search manually.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowCameraModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
