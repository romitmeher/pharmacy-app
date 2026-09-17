"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  RotateCcw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  Trash2,
  Clock,
  ArrowLeft,
  DollarSign,
  ShieldCheck,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getEligibleReturnItems,
  processSaleReturn,
  getSaleReturns,
  EligibleReturnItemsData,
  EligibleReturnItem,
  ReturnData,
  CreateReturnItemInput,
} from "@/lib/api";

export default function SalesReturnsPage() {
  // Search state
  const [invoiceSearch, setInvoiceSearch] = useState<string>("");
  const [saleIdInput, setSaleIdInput] = useState<string>("");
  const [eligibleData, setEligibleData] = useState<EligibleReturnItemsData | null>(null);
  const [loadingEligible, setLoadingEligible] = useState<boolean>(false);

  // Return Form State
  const [selectedItems, setSelectedItems] = useState<
    Record<
      number,
      {
        quantity: number;
        restockCondition: "restocked_to_inventory" | "written_off_damaged" | "discarded_expired";
      }
    >
  >({});
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [returnReason, setReturnReason] = useState<string>("");

  // History State
  const [recentReturns, setRecentReturns] = useState<ReturnData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [selectedReturnDetail, setSelectedReturnDetail] = useState<ReturnData | null>(null);

  // Status & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Load returns history on mount
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await getSaleReturns(1, 20);
      setRecentReturns(res.data || []);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load recent return records.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Search invoice
  const handleSearchSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleIdInput.trim()) return;

    setLoadingEligible(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setEligibleData(null);
    setSelectedItems({});

    try {
      const saleId = parseInt(saleIdInput.trim(), 10);
      if (isNaN(saleId)) {
        throw new Error("Please enter a valid numerical Sale ID or Invoice ID.");
      }
      const data = await getEligibleReturnItems(saleId);
      setEligibleData(data);
      // Pre-fill quantities as 0
      const initial: Record<number, any> = {};
      data.items.forEach((item) => {
        initial[item.sale_item_id] = {
          quantity: 0,
          restockCondition: "restocked_to_inventory",
        };
      });
      setSelectedItems(initial);
    } catch (err: any) {
      setErrorMessage(err?.message || "Invoice not found or ineligible for return.");
    } finally {
      setLoadingEligible(false);
    }
  };

  // Toggle/update item return quantity
  const handleItemQtyChange = (saleItemId: number, qty: number, maxQty: number) => {
    const validQty = Math.max(0, Math.min(qty, maxQty));
    setSelectedItems((prev) => ({
      ...prev,
      [saleItemId]: {
        ...prev[saleItemId],
        quantity: validQty,
      },
    }));
  };

  const handleConditionChange = (
    saleItemId: number,
    condition: "restocked_to_inventory" | "written_off_damaged" | "discarded_expired"
  ) => {
    setSelectedItems((prev) => ({
      ...prev,
      [saleItemId]: {
        ...prev[saleItemId],
        restockCondition: condition,
      },
    }));
  };

  // Calculate refund summary
  const returnPayloadItems: CreateReturnItemInput[] = Object.entries(selectedItems)
    .filter(([_, value]) => value.quantity > 0)
    .map(([saleItemIdStr, value]) => ({
      sale_item_id: parseInt(saleItemIdStr, 10),
      quantity_returned: value.quantity,
      restock_condition: value.restockCondition,
    }));

  const estimatedRefund = eligibleData
    ? returnPayloadItems.reduce((acc, rItem) => {
        const line = eligibleData.items.find((i) => i.sale_item_id === rItem.sale_item_id);
        return acc + (line ? line.unit_price * rItem.quantity_returned : 0);
      }, 0)
    : 0;

  // Submit return
  const handleSubmitReturn = () => {
    if (!eligibleData) return;
    if (returnPayloadItems.length === 0) {
      setErrorMessage("Please select at least 1 item and quantity to return.");
      return;
    }
    if (!returnReason.trim()) {
      setErrorMessage("Return Reason is required for pharmacy audit compliance.");
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await processSaleReturn({
          sale_id: eligibleData.sale_id,
          refund_method: refundMethod,
          reason: returnReason.trim(),
          items: returnPayloadItems,
        });

        setSuccessMessage(`Return Invoice #${res.return_number} processed successfully! Restocking logged.`);
        setEligibleData(null);
        setSelectedItems({});
        setReturnReason("");
        setSaleIdInput("");
        loadHistory();
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to process return.");
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Page Header */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Sales Returns & Refunds</h1>
          <p className="page-subtitle">
            Customer Credit Processing • Physical Restock / Write-off • Audit Logging
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Body */}
      <div
        className="page-body"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 400px",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left Column: Search & Return Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Invoice Lookup Card */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              Lookup Sale Invoice
            </h3>

            <form onSubmit={handleSearchSale} style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ position: "relative", flex: 1 }}>
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
                  placeholder="Enter numerical Sale ID (e.g. 1)..."
                  value={saleIdInput}
                  onChange={(e) => setSaleIdInput(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: "2.5rem", height: "38px" }}
                />
              </div>
              <button
                type="submit"
                disabled={loadingEligible || !saleIdInput.trim()}
                className="btn btn-primary"
                style={{ height: "38px", padding: "0 1.25rem" }}
              >
                {loadingEligible ? "Finding..." : "Find Invoice"}
              </button>
            </form>
          </div>

          {/* Feedback Messages */}
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
                gap: "0.5rem",
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Eligible Line Items Matrix */}
          {eligibleData && (
            <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Invoice #{eligibleData.invoice_number}
                  </h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Customer: <strong>{eligibleData.customer_name}</strong> • Date: {new Date(eligibleData.sale_date).toLocaleDateString()}
                  </p>
                </div>
                <span className="status-badge high">
                  <CheckCircle2 size={12} />
                  <span>{eligibleData.total_remaining_units} units returnable</span>
                </span>
              </div>

              {/* Items Table */}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Medicine & Batch</th>
                      <th>Qty Sold</th>
                      <th>Already Returned</th>
                      <th>Qty to Return</th>
                      <th>Restock Disposition</th>
                      <th style={{ textAlign: "right" }}>Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleData.items.map((item) => {
                      const sel = selectedItems[item.sale_item_id] || {
                        quantity: 0,
                        restockCondition: "restocked_to_inventory",
                      };
                      const lineRefund = item.unit_price * sel.quantity;

                      return (
                        <tr key={item.sale_item_id}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                              {item.medicine_name}
                            </div>
                            <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                              Batch: {item.batch_number} • ₹{item.unit_price.toFixed(2)}/unit
                            </div>
                          </td>
                          <td>{item.quantity_sold}</td>
                          <td>{item.quantity_already_returned}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={item.quantity_eligible_for_return}
                              value={sel.quantity}
                              onChange={(e) =>
                                handleItemQtyChange(
                                  item.sale_item_id,
                                  parseInt(e.target.value, 10) || 0,
                                  item.quantity_eligible_for_return
                                )
                              }
                              className="form-input"
                              style={{ width: "64px", height: "30px", fontSize: "0.8125rem", textAlign: "center" }}
                              disabled={item.quantity_eligible_for_return === 0}
                            />
                          </td>
                          <td>
                            <select
                              value={sel.restockCondition}
                              onChange={(e) =>
                                handleConditionChange(
                                  item.sale_item_id,
                                  e.target.value as any
                                )
                              }
                              className="form-input"
                              style={{ height: "30px", fontSize: "0.75rem" }}
                              disabled={sel.quantity === 0}
                            >
                              <option value="restocked_to_inventory">Restock to Batch Inventory</option>
                              <option value="written_off_damaged">Write-off (Damaged Packaging)</option>
                              <option value="discarded_expired">Discard (Expired / Unusable)</option>
                            </select>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>
                            ₹{lineRefund.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Refund Summary & Action */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "0.75rem",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <div>
                    <label className="form-label" style={{ fontSize: "0.75rem" }}>Refund Mode</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                      className="form-input"
                      style={{ height: "32px", fontSize: "0.75rem" }}
                    >
                      <option value="cash">Cash Refund</option>
                      <option value="upi">UPI / Online Refund</option>
                      <option value="credit">Store Credit</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: "220px" }}>
                    <label className="form-label" style={{ fontSize: "0.75rem" }}>Audit Reason *</label>
                    <input
                      type="text"
                      placeholder="e.g. Wrong item purchased by customer"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="form-input"
                      style={{ height: "32px", fontSize: "0.75rem" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    Total Refund: <strong style={{ fontSize: "1.125rem", color: "var(--status-high-text)" }}>₹{estimatedRefund.toFixed(2)}</strong>
                  </div>
                  <button
                    onClick={handleSubmitReturn}
                    disabled={isSubmitting || returnPayloadItems.length === 0}
                    className="btn btn-primary"
                    style={{ height: "36px", padding: "0 1.25rem" }}
                  >
                    <RotateCcw size={15} />
                    <span>{isSubmitting ? "Processing Return..." : "Process Return & Restock"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Historical Returns Audit Log */}
        <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "0.75rem" }}>
            <Clock size={16} style={{ color: "var(--brand-primary)" }} />
            <strong style={{ fontSize: "0.9375rem" }}>Recent Returns Log</strong>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
            {loadingHistory ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                Loading return logs...
              </div>
            ) : recentReturns.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                No customer returns processed yet.
              </div>
            ) : (
              recentReturns.map((ret) => (
                <div
                  key={ret.id}
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-surface-elevated)",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                      Return #{ret.return_number}
                    </span>
                    <span style={{ fontWeight: 700, color: "var(--status-high-text)", fontSize: "0.8125rem" }}>
                      ₹{Number(ret.total_refund_amount).toFixed(2)}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    Orig Invoice: <strong>#{ret.sale_invoice_number}</strong> • Mode: {ret.refund_method.toUpperCase()}
                  </div>

                  <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    Reason: {ret.reason || "Customer Return"} • By: {ret.user_name}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
