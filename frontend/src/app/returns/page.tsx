"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getEligibleReturnItems,
  processSaleReturn,
  getSaleReturns,
  EligibleReturnItemsData,
  ReturnData,
  CreateReturnItemInput,
} from "@/lib/api";

type ReturnTab = "process" | "history";

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<ReturnTab>("process");

  // Lookup state
  const [lookupSaleId, setLookupSaleId] = useState<string>("1");
  const [saleData, setSaleData] = useState<EligibleReturnItemsData | null>(null);
  const [loadingSale, setLoadingSale] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Return form state
  const [selectedItems, setSelectedItems] = useState<
    Record<
      number,
      {
        quantity_returned: number;
        restock_condition: "restocked_to_inventory" | "written_off_damaged" | "discarded_expired";
      }
    >
  >({});
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completedReturn, setCompletedReturn] = useState<ReturnData | null>(null);

  // History state
  const [history, setHistory] = useState<ReturnData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab]);

  const handleLookupSale = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const id = parseInt(lookupSaleId.trim(), 10);
    if (isNaN(id) || id <= 0) {
      setLookupError("Please enter a valid numeric Sale ID.");
      return;
    }

    setLoadingSale(true);
    setLookupError(null);
    setSaleData(null);
    setCompletedReturn(null);
    setSelectedItems({});

    try {
      const data = await getEligibleReturnItems(id);
      setSaleData(data);

      // Initialize selected items with 0
      const initial: Record<number, any> = {};
      data.items.forEach((item) => {
        initial[item.sale_item_id] = {
          quantity_returned: 0,
          restock_condition: "restocked_to_inventory",
        };
      });
      setSelectedItems(initial);
    } catch (err: any) {
      setLookupError(err.message || "Failed to lookup sale invoice.");
    } finally {
      setLoadingSale(false);
    }
  };

  const handleQuantityChange = (saleItemId: number, maxEligible: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxEligible, val));
    setSelectedItems((prev) => ({
      ...prev,
      [saleItemId]: {
        ...prev[saleItemId],
        quantity_returned: clamped,
      },
    }));
  };

  const handleConditionChange = (
    saleItemId: number,
    cond: "restocked_to_inventory" | "written_off_damaged" | "discarded_expired"
  ) => {
    setSelectedItems((prev) => ({
      ...prev,
      [saleItemId]: {
        ...prev[saleItemId],
        restock_condition: cond,
      },
    }));
  };

  const calculateTotalRefund = (): number => {
    if (!saleData) return 0;
    return saleData.items.reduce((acc, item) => {
      const qty = selectedItems[item.sale_item_id]?.quantity_returned || 0;
      return acc + qty * item.unit_price;
    }, 0);
  };

  const handleSubmitReturn = async () => {
    if (!saleData) return;
    setSubmitError(null);

    const itemsToReturn: CreateReturnItemInput[] = [];
    Object.entries(selectedItems).forEach(([idStr, cfg]) => {
      const saleItemId = parseInt(idStr, 10);
      if (cfg.quantity_returned > 0) {
        itemsToReturn.push({
          sale_item_id: saleItemId,
          quantity_returned: cfg.quantity_returned,
          restock_condition: cfg.restock_condition,
        });
      }
    });

    if (itemsToReturn.length === 0) {
      setSubmitError("Please select at least one unit to return.");
      return;
    }

    if (!reason.trim()) {
      setSubmitError("An operational reason is required for compliance audit trails (PRD Rule 22).");
      return;
    }

    setSubmitting(true);
    try {
      const result = await processSaleReturn({
        sale_id: saleData.sale_id,
        refund_method: refundMethod,
        reason: reason.trim(),
        items: itemsToReturn,
      });
      setCompletedReturn(result);
      setSaleData(null);
      setReason("");
    } catch (err: any) {
      setSubmitError(err.message || "Failed to process return.");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await getSaleReturns(1, 50);
      setHistory(res.data);
    } catch (err: any) {
      console.error("Failed to fetch returns history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const totalRefund = calculateTotalRefund();

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs uppercase tracking-widest font-bold text-amber-400">
                POS & Inventory Reconciliation
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">PRD Rule 7, 8, 14 & 22</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Sales Returns & Refunds
              <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                Restock Safe
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Process customer medicine returns with physical restock vs damaged write-off controls, atomic tender refunds, and automatic audit trail logging.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition"
            >
              Back to Hub
            </Link>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("process")}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition ${
              activeTab === "process"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            ↺ Process New Return
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition ${
              activeTab === "history"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📜 Returns Ledger & Audit
          </button>
        </div>

        {/* TAB 1: Process New Return */}
        {activeTab === "process" && (
          <div className="space-y-6">
            {/* Sale Lookup Bar */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔍</span> Step 1: Lookup Original Sale Invoice
              </h2>
              <form onSubmit={handleLookupSale} className="flex gap-3 max-w-xl">
                <input
                  type="text"
                  placeholder="Enter numeric Sale ID (e.g. 1)..."
                  value={lookupSaleId}
                  onChange={(e) => setLookupSaleId(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={loadingSale}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition shadow-lg shadow-amber-600/20"
                >
                  {loadingSale ? "Looking up..." : "Find Invoice"}
                </button>
              </form>

              {lookupError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
                  {lookupError}
                </div>
              )}
            </div>

            {/* Sale & Eligible Items View */}
            {saleData && (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                      Invoice #{saleData.invoice_number}
                    </span>
                    <h3 className="text-xl font-bold text-white mt-0.5">
                      Customer: {saleData.customer_name}
                    </h3>
                    <span className="text-xs text-slate-500">
                      Sale Date: {new Date(saleData.sale_date).toLocaleDateString("en-IN")} • Status:{" "}
                      <span className="text-emerald-400 uppercase font-mono">{saleData.payment_status}</span>
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Original Sale Total</span>
                    <span className="text-2xl font-black text-white">₹{saleData.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                {saleData.is_fully_returned ? (
                  <div className="p-6 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-sm text-center">
                    All items from this sale invoice have already been fully returned.
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-200">
                        Step 2: Select Items to Return & Restock Conditions
                      </h4>

                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
                        <table className="w-full text-left text-sm text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="px-5 py-3">Medicine & Batch</th>
                              <th className="px-5 py-3">Unit Price</th>
                              <th className="px-5 py-3">Sold / Prev. Returned</th>
                              <th className="px-5 py-3">Eligible Remaining</th>
                              <th className="px-5 py-3">Quantity to Return</th>
                              <th className="px-5 py-3">Physical Restock Condition</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {saleData.items.map((item) => {
                              const sel = selectedItems[item.sale_item_id] || {
                                quantity_returned: 0,
                                restock_condition: "restocked_to_inventory",
                              };
                              return (
                                <tr key={item.sale_item_id} className="hover:bg-slate-900/40">
                                  <td className="px-5 py-4">
                                    <div className="font-bold text-white">{item.medicine_name}</div>
                                    <span className="text-xs font-mono text-slate-400">
                                      Batch: {item.batch_number}
                                    </span>
                                  </td>

                                  <td className="px-5 py-4 font-mono">
                                    ₹{item.unit_price.toFixed(2)}
                                  </td>

                                  <td className="px-5 py-4 text-xs font-mono text-slate-400">
                                    {item.quantity_sold} sold / {item.quantity_already_returned} returned
                                  </td>

                                  <td className="px-5 py-4 font-bold text-amber-400 font-mono">
                                    {item.quantity_eligible_for_return} units
                                  </td>

                                  <td className="px-5 py-4">
                                    <input
                                      type="number"
                                      min={0}
                                      max={item.quantity_eligible_for_return}
                                      value={sel.quantity_returned}
                                      onChange={(e) =>
                                        handleQuantityChange(
                                          item.sale_item_id,
                                          item.quantity_eligible_for_return,
                                          parseInt(e.target.value, 10) || 0
                                        )
                                      }
                                      className="w-24 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-center font-bold text-white focus:outline-none focus:border-amber-500"
                                    />
                                  </td>

                                  <td className="px-5 py-4">
                                    <select
                                      value={sel.restock_condition}
                                      onChange={(e: any) =>
                                        handleConditionChange(item.sale_item_id, e.target.value)
                                      }
                                      className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                                    >
                                      <option value="restocked_to_inventory">
                                        ✓ Restock to Shelf (Sealed)
                                      </option>
                                      <option value="written_off_damaged">
                                        ✗ Write-Off as Damaged (Loss)
                                      </option>
                                      <option value="discarded_expired">
                                        ✗ Discard as Expired
                                      </option>
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Step 3: Refund Method & Reason */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
                      <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                          Refund Tender Method
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {["cash", "upi", "credit", "card"].map((method) => (
                            <button
                              key={method}
                              type="button"
                              onClick={() => setRefundMethod(method)}
                              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                                refundMethod === method
                                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                                  : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
                              }`}
                            >
                              {method}
                            </button>
                          ))}
                        </div>

                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block pt-2">
                          Operational Reason (Audit Mandatory)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. 'Customer bought wrong dosage by mistake. Packaging verified sealed.'..."
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                        <div>
                          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400 block mb-1">
                            Calculated Total Refund
                          </span>
                          <div className="text-3xl font-black text-amber-400">
                            ₹{totalRefund.toFixed(2)}
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            Restocking changes and tender payouts are immediately committed to the transactional ledger with an audit trail.
                          </p>
                        </div>

                        {submitError && (
                          <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs mt-3">
                            {submitError}
                          </div>
                        )}

                        <button
                          onClick={handleSubmitReturn}
                          disabled={submitting || totalRefund <= 0}
                          className="w-full mt-4 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition shadow-lg shadow-amber-600/20"
                        >
                          {submitting ? "Processing Return..." : `Confirm Return & Refund ₹${totalRefund.toFixed(2)}`}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Return Success Confirmation Card */}
            {completedReturn && (
              <div className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✅</span>
                    <h3 className="text-lg font-bold text-emerald-300">
                      Return #{completedReturn.return_number} Processed Successfully
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 px-2 py-1 rounded bg-emerald-950 border border-emerald-800">
                    AUDIT LOGGED
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Refund Amount</span>
                    <div className="text-lg font-bold text-white">₹{completedReturn.total_refund_amount.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Refund Tender</span>
                    <div className="text-lg font-bold text-white uppercase">{completedReturn.refund_method}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Processed By</span>
                    <div className="text-lg font-bold text-white">{completedReturn.user_name || "Pharmacist"}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Items Returned</span>
                    <div className="text-lg font-bold text-white">{completedReturn.items.length} product(s)</div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 border-t border-emerald-900/60 pt-3">
                  <span className="font-semibold text-slate-300">Reason:</span> {completedReturn.reason}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Returns History & Audit */}
        {activeTab === "history" && (
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Historical Returns & Restock Ledger</h3>
              <button
                onClick={fetchHistory}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 border border-slate-700 transition"
              >
                ↻ Refresh
              </button>
            </div>

            {loadingHistory ? (
              <div className="p-12 text-center text-slate-400">
                <div className="inline-block animate-spin text-2xl mb-2">⚙</div>
                <p className="text-sm">Loading historical return records...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p className="text-sm">No return records found in this store.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Return #</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Sale Invoice</th>
                      <th className="px-6 py-3">Staff</th>
                      <th className="px-6 py-3">Refund Amount</th>
                      <th className="px-6 py-3">Tender</th>
                      <th className="px-6 py-3">Reason</th>
                      <th className="px-6 py-3">Items Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {history.map((ret) => (
                      <tr key={ret.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 font-mono font-bold text-amber-400">
                          {ret.return_number}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-slate-400">
                          {new Date(ret.return_date).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-300">
                          #{ret.sale_invoice_number || ret.sale_id}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-200">
                          {ret.user_name || "Pharmacist"}
                        </td>
                        <td className="px-6 py-4 font-bold text-white font-mono">
                          ₹{ret.total_refund_amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-xs uppercase font-semibold text-slate-300">
                          {ret.refund_method}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 max-w-xs truncate">
                          {ret.reason}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-slate-300">
                          {ret.items.length} line(s)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
