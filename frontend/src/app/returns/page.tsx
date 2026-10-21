"use client";
import "./presentation.css";
import { VirtualTableBody } from "@/components/ui/VirtualTableBody";

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
    } catch (err: unknown) {
      setErrorMessage((err instanceof Error ? err.message : "") || "Failed to load recent return records.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadHistory());
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
      const data = await getEligibleReturnItems(saleIdInput.trim());
      setEligibleData(data);
      // Pre-fill quantities as 0
      const initial: typeof selectedItems = {};
      data.items.forEach((item) => {
        initial[item.sale_item_id] = {
          quantity: 0,
          restockCondition: "restocked_to_inventory",
        };
      });
      setSelectedItems(initial);
    } catch (err: unknown) {
      setErrorMessage((err instanceof Error ? err.message : "") || "Invoice not found or ineligible for return.");
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
      } catch (err: unknown) {
        setErrorMessage((err instanceof Error ? err.message : "") || "Failed to process return.");
      }
    });
  };

  return (
    <div className="returns-1">
      {/* Page Header */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Sales Returns & Refunds</h1>
          <p className="page-subtitle">
            Customer Credit Processing • Physical Restock / Write-off • Audit Logging
          </p>
        </div>

        <div className="returns-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Body */}
      <div
        
        className="page-body returns-3"
      >
        {/* Left Column: Search & Return Form */}
        <div className="returns-4">
          {/* Invoice Lookup Card */}
          <div  className="card returns-5">
            <h3 className="returns-6">
              Lookup Sale Invoice
            </h3>

            <form onSubmit={handleSearchSale} className="returns-7">
              <div className="returns-8">
                <Search
                  size={16}
                  className="returns-9"
                />
                <input
                  type="text"
                  placeholder="Enter numerical Sale ID (e.g. 1)..."
                  value={saleIdInput}
                  onChange={(e) => setSaleIdInput(e.target.value)}
                  
                  className="form-input returns-10"
                />
              </div>
              <button
                type="submit"
                disabled={loadingEligible || !saleIdInput.trim()}
                
                className="btn btn-primary returns-11"
              >
                {loadingEligible ? "Finding..." : "Find Invoice"}
              </button>
            </form>
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <div
              className="returns-12"
            >
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              className="returns-13"
            >
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Eligible Line Items Matrix */}
          {eligibleData && (
            <div  className="card returns-14">
              <div className="returns-15">
                <div>
                  <h3 className="returns-16">
                    Invoice #{eligibleData.invoice_number}
                  </h3>
                  <p className="returns-17">
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
                      <th className="returns-18">Refund</th>
                    </tr>
                  </thead>
                  <VirtualTableBody>
                    {eligibleData.items.map((item) => {
                      const sel = selectedItems[item.sale_item_id] || {
                        quantity: 0,
                        restockCondition: "restocked_to_inventory",
                      };
                      const lineRefund = item.unit_price * sel.quantity;

                      return (
                        <tr key={item.sale_item_id}>
                          <td>
                            <div className="returns-19">
                              {item.medicine_name}
                            </div>
                            <div className="returns-20">
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
                              
                              className="form-input returns-21"
                              disabled={item.quantity_eligible_for_return === 0}
                            />
                          </td>
                          <td>
                            <select
                              value={sel.restockCondition}
                              onChange={(e) =>
                                handleConditionChange(
                                  item.sale_item_id,
                                  e.target.value as typeof sel.restockCondition
                                )
                              }
                              
                              className="form-input returns-22"
                              disabled={sel.quantity === 0}
                            >
                              <option value="restocked_to_inventory">Restock to Batch Inventory</option>
                              <option value="written_off_damaged">Write-off (Damaged Packaging)</option>
                              <option value="discarded_expired">Discard (Expired / Unusable)</option>
                            </select>
                          </td>
                          <td className="returns-23">
                            ₹{lineRefund.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </VirtualTableBody>
                </table>
              </div>

              {/* Refund Summary & Action */}
              <div
                className="returns-24"
              >
                <div className="returns-25">
                  <div>
                    <label  className="form-label returns-26" htmlFor="returns-field-1">Refund Mode</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                      
                      className="form-input returns-27" id="returns-field-1"
                    >
                      <option value="cash">Cash Refund</option>
                      <option value="upi">UPI / Online Refund</option>
                      <option value="credit">Store Credit</option>
                    </select>
                  </div>
                  <div className="returns-28">
                    <label  className="form-label returns-29" htmlFor="returns-field-2">Audit Reason *</label>
                    <input
                      type="text"
                      placeholder="e.g. Wrong item purchased by customer"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      
                      className="form-input returns-30" id="returns-field-2"
                    />
                  </div>
                </div>

                <div className="returns-31">
                  <div className="returns-32">
                    Total Refund: <strong className="returns-33">₹{estimatedRefund.toFixed(2)}</strong>
                  </div>
                  <button
                    onClick={handleSubmitReturn}
                    disabled={isSubmitting || returnPayloadItems.length === 0}
                    
                    className="btn btn-primary returns-34"
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
        <div  className="card returns-35">
          <div className="returns-36">
            <Clock size={16} className="returns-37" />
            <strong className="returns-38">Recent Returns Log</strong>
          </div>

          <div className="returns-39">
            {loadingHistory ? (
              <div className="returns-40">
                Loading return logs...
              </div>
            ) : recentReturns.length === 0 ? (
              <div className="returns-41">
                No customer returns processed yet.
              </div>
            ) : (
              recentReturns.map((ret) => (
                <div
                  key={ret.id}
                  className="returns-42"
                >
                  <div className="returns-43">
                    <span className="returns-44">
                      Return #{ret.return_number}
                    </span>
                    <span className="returns-45">
                      ₹{Number(ret.total_refund_amount).toFixed(2)}
                    </span>
                  </div>

                  <div className="returns-46">
                    Orig Invoice: <strong>#{ret.sale_invoice_number}</strong> • Mode: {ret.refund_method.toUpperCase()}
                  </div>

                  <div className="returns-47">
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
