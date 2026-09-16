"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getNetworkStores,
  getCrossStoreStock,
  getNetworkAnalytics,
  getSupplierPriceComparison,
  createStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  listStockTransfers,
  getMedicines,
  NetworkStore,
  CrossStoreStockResponse,
  NetworkPerformanceSummary,
  SupplierPriceDiscrepancy,
  StockTransferData,
  Medicine,
} from "@/lib/api";

export default function MultiBranchWorkstation() {
  const [activeTab, setActiveTab] = useState<"stock" | "transfers" | "analytics" | "prices">("stock");

  // Stores & Catalog
  const [stores, setStores] = useState<NetworkStore[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number | null>(null);

  // Stock Comparison
  const [stockComparison, setStockComparison] = useState<CrossStoreStockResponse | null>(null);
  const [stockLoading, setStockLoading] = useState<boolean>(false);

  // Transfers
  const [transfers, setTransfers] = useState<StockTransferData[]>([]);
  const [transferLoading, setTransferLoading] = useState<boolean>(false);

  // Transfer Modal / Form
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [sourceStoreId, setSourceStoreId] = useState<number>(1);
  const [destinationStoreId, setDestinationStoreId] = useState<number>(1);
  const [transferQty, setTransferQty] = useState<number>(10);
  const [transferBatchId, setTransferBatchId] = useState<number | null>(null);
  const [transferNotes, setTransferNotes] = useState<string>("");

  // Analytics & Supplier Prices
  const [analytics, setAnalytics] = useState<NetworkPerformanceSummary | null>(null);
  const [supplierPrices, setSupplierPrices] = useState<SupplierPriceDiscrepancy[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [storesData, medsData] = await Promise.all([
        getNetworkStores(),
        getMedicines(1, 50),
      ]);
      setStores(storesData);
      setMedicines(medsData.medicines || []);

      if (medsData.medicines && medsData.medicines.length > 0) {
        const firstMedId = medsData.medicines[0].id;
        setSelectedMedicineId(firstMedId);
        loadStockComparison(firstMedId);
      }

      loadTransfers();
      loadAnalyticsAndPrices();
    } catch (err) {
      console.error("Failed to load initial multi-branch data:", err);
    }
  }

  async function loadStockComparison(medId: number) {
    setStockLoading(true);
    try {
      const data = await getCrossStoreStock(medId);
      setStockComparison(data);
    } catch (err) {
      console.error("Failed to load cross-store stock:", err);
    } finally {
      setStockLoading(false);
    }
  }

  async function loadTransfers() {
    setTransferLoading(true);
    try {
      const data = await listStockTransfers();
      setTransfers(data);
    } catch (err) {
      console.error("Failed to load transfers:", err);
    } finally {
      setTransferLoading(false);
    }
  }

  async function loadAnalyticsAndPrices() {
    setAnalyticsLoading(true);
    try {
      const [anaData, priceData] = await Promise.all([
        getNetworkAnalytics(),
        getSupplierPriceComparison(),
      ]);
      setAnalytics(anaData);
      setSupplierPrices(priceData);
    } catch (err) {
      console.error("Failed to load analytics or supplier prices:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function handleCreateTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMedicineId || !transferBatchId) {
      alert("Please select a medicine and batch to transfer.");
      return;
    }
    if (sourceStoreId === destinationStoreId) {
      alert("Source and Destination branches cannot be the same.");
      return;
    }

    try {
      await createStockTransfer(
        sourceStoreId,
        destinationStoreId,
        [{ medicine_id: selectedMedicineId, batch_id: transferBatchId, quantity: transferQty }],
        transferNotes
      );
      setShowTransferModal(false);
      alert("Inter-store stock transfer request created in DRAFT state.");
      loadTransfers();
      setActiveTab("transfers");
    } catch (err: any) {
      alert(`Transfer failed: ${err.message}`);
    }
  }

  async function handleDispatch(transferId: number) {
    if (!confirm("Dispatch stock from source branch? Available stock will be decremented.")) return;
    try {
      await dispatchStockTransfer(transferId);
      alert("Transfer dispatched successfully! Status is now IN_TRANSIT.");
      loadTransfers();
      if (selectedMedicineId) loadStockComparison(selectedMedicineId);
    } catch (err: any) {
      alert(`Dispatch failed: ${err.message}`);
    }
  }

  async function handleReceive(transferId: number) {
    if (!confirm("Confirm physical arrival of stock at destination branch?")) return;
    try {
      await receiveStockTransfer(transferId);
      alert("Transfer received successfully! Physical stock has been booked into destination store.");
      loadTransfers();
      if (selectedMedicineId) loadStockComparison(selectedMedicineId);
    } catch (err: any) {
      alert(`Receipt failed: ${err.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏢</span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Multi-Branch Operations & Network Hub
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-950/80 text-blue-400 border border-blue-800">
              PRD Rule 25
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Cross-store stock lookup, inter-store transfers, consolidated owner financials, and supplier price benchmarks
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition"
          >
            ← Main Hub
          </Link>
          <Link
            href="/shelves"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-sky-800/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/50 transition"
          >
            🗄️ Shelves
          </Link>
          <Link
            href="/offline"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-cyan-800/60 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 transition"
          >
            📶 Offline POS
          </Link>
        </div>
      </header>

      {/* Network Stats Bar */}
      <div className="max-w-7xl mx-auto mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
          <span className="text-2xl p-2.5 rounded-xl bg-blue-950/60 text-blue-400 border border-blue-900">
            🏥
          </span>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Stores in Network</div>
            <div className="text-xl font-bold text-white">{stores.length} Branches</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
          <span className="text-2xl p-2.5 rounded-xl bg-emerald-950/60 text-emerald-400 border border-emerald-900">
            💵
          </span>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Network Revenue</div>
            <div className="text-xl font-bold text-emerald-400">
              ₹{analytics ? analytics.network_total_sales.toFixed(2) : "0.00"}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
          <span className="text-2xl p-2.5 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-900">
            🧾
          </span>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Consolidated Bills</div>
            <div className="text-xl font-bold text-purple-300">
              {analytics ? analytics.network_total_bills : 0} Bills
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
          <span className="text-2xl p-2.5 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-900">
            🚚
          </span>
          <div>
            <div className="text-xs text-slate-400 uppercase font-semibold">Active Transfers</div>
            <div className="text-xl font-bold text-amber-300">{transfers.length} Orders</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="max-w-7xl mx-auto mt-6 flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("stock")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "stock"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/50"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <span>🔍</span> Cross-Store Stock Finder
        </button>

        <button
          onClick={() => setActiveTab("transfers")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "transfers"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/50"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <span>🚚</span> Inter-Store Transfers ({transfers.length})
        </button>

        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "analytics"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/50"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <span>📊</span> Branch Performance
        </button>

        <button
          onClick={() => setActiveTab("prices")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "prices"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/50"
              : "bg-slate-900 text-slate-400 hover:text-white"
          }`}
        >
          <span>💰</span> Supplier Price Benchmarks ({supplierPrices.length})
        </button>
      </div>

      {/* Tab 1: Cross-Store Stock Finder */}
      {activeTab === "stock" && (
        <main className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Medicine Selector (4 cols) */}
          <section className="lg:col-span-4 flex flex-col gap-4">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                1. Select Medicine to Inspect
              </h3>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {medicines.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedMedicineId(m.id);
                      loadStockComparison(m.id);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                      selectedMedicineId === m.id
                        ? "bg-blue-950/60 border-blue-500 text-white"
                        : "bg-slate-950 border-slate-800/80 text-slate-300 hover:bg-slate-850"
                    }`}
                  >
                    <div className="font-bold text-white">
                      {m.brand_name} <span className="text-slate-400 font-normal">({m.strength})</span>
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{m.generic_name}</div>
                    <div className="text-emerald-400 font-semibold mt-1">MRP ₹{m.mrp}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Cross-Store Inventory Breakdown (8 cols) */}
          <section className="lg:col-span-8 flex flex-col gap-4">
            {stockLoading ? (
              <div className="p-12 text-center text-slate-400">Loading cross-store stock...</div>
            ) : stockComparison ? (
              <div className="space-y-4">
                {/* Summary Banner */}
                <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-blue-400 font-bold uppercase">Network Stock Availability</span>
                    <h2 className="text-xl font-extrabold text-white">
                      {stockComparison.brand_name} ({stockComparison.strength})
                    </h2>
                    <p className="text-xs text-slate-400">{stockComparison.generic_name}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">Total Across All Stores:</span>
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      {stockComparison.total_network_stock} Units
                    </div>
                    <span className="text-[11px] text-blue-300">
                      Available in {stockComparison.stores_with_stock_count} store(s)
                    </span>
                  </div>
                </div>

                {/* Branch-by-Branch Availability Cards */}
                <div className="space-y-3">
                  {stockComparison.stores.map((s) => (
                    <div
                      key={s.store_id}
                      className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-base">{s.store_name}</h4>
                          {s.is_current_store && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                              Current Store
                            </span>
                          )}
                        </div>

                        {/* Batch Details */}
                        {s.batches && s.batches.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {s.batches.map((b) => (
                              <span
                                key={b.batch_id}
                                className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono"
                              >
                                Batch {b.batch_number} • {b.quantity_available} units (Exp: {b.expiry_date})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-rose-400 mt-1">Out of stock at this branch.</div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="text-xs text-slate-400">Available</div>
                          <div
                            className={`text-xl font-bold font-mono ${
                              s.total_stock > 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {s.total_stock}
                          </div>
                        </div>

                        {/* Request Transfer Action */}
                        {s.total_stock > 0 && (
                          <button
                            onClick={() => {
                              setSourceStoreId(s.store_id);
                              if (s.batches.length > 0) setTransferBatchId(s.batches[0].batch_id);
                              setShowTransferModal(true);
                            }}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/40 transition whitespace-nowrap"
                          >
                            📦 Request Transfer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">Select a medicine to inspect branch stock.</div>
            )}
          </section>
        </main>
      )}

      {/* Tab 2: Inter-Store Transfers */}
      {activeTab === "transfers" && (
        <main className="max-w-7xl mx-auto mt-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Inter-Store Stock Transfers</h2>
                <p className="text-xs text-slate-400">
                  Manage transfer lifecycle: Draft Request → Source Dispatch → Destination Physical Receipt
                </p>
              </div>
              <button
                onClick={() => setShowTransferModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/40 transition"
              >
                + New Transfer Request
              </button>
            </div>

            {transferLoading ? (
              <div className="p-8 text-center text-slate-400">Loading transfers...</div>
            ) : transfers.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl">
                <span className="text-4xl">🚚</span>
                <div className="text-sm font-bold text-slate-300 mt-2">No Inter-Store Transfers</div>
                <div className="text-xs text-slate-500 mt-1">
                  Create a transfer request when one branch requires inventory from another branch.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {transfers.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-blue-400 text-sm">{t.transfer_number}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            t.status === "received"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : t.status === "in_transit"
                              ? "bg-amber-950 text-amber-300 border-amber-800 animate-pulse"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {t.status.replace("_", " ")}
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                        <span>From: <strong>{t.source_store_name || `Store #${t.source_store_id}`}</strong></span>
                        <span>➔</span>
                        <span>To: <strong>{t.destination_store_name || `Store #${t.destination_store_id}`}</strong></span>
                      </div>

                      {t.items && t.items.length > 0 && (
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          {t.items[0].medicine_name} • Batch {t.items[0].batch_number} • Qty: {t.items[0].quantity} units
                        </div>
                      )}
                      {t.notes && <p className="text-[11px] text-slate-500 italic mt-0.5">{t.notes}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      {t.status === "draft" && (
                        <button
                          onClick={() => handleDispatch(t.id)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition"
                        >
                          🚚 Confirm Dispatch
                        </button>
                      )}

                      {t.status === "in_transit" && (
                        <button
                          onClick={() => handleReceive(t.id)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                        >
                          📦 Confirm Receipt
                        </button>
                      )}

                      {t.status === "received" && (
                        <span className="text-xs text-emerald-400 font-bold">
                          ✓ Booked in Destination
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Tab 3: Branch Performance Analytics */}
      {activeTab === "analytics" && (
        <main className="max-w-7xl mx-auto mt-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-1">Executive Multi-Store Financials</h2>
            <p className="text-xs text-slate-400 mb-6">
              Aggregated sales volume, bill throughput, and gross margin comparison across branches (PRD Rule 25)
            </p>

            {analytics && analytics.branch_performance ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Branch Name</th>
                      <th className="py-3 px-4 text-right">Total Revenue</th>
                      <th className="py-3 px-4 text-right">Bills Count</th>
                      <th className="py-3 px-4 text-right">Gross Profit</th>
                      <th className="py-3 px-4 text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {analytics.branch_performance.map((b) => (
                      <tr key={b.store_id} className="hover:bg-slate-850/50">
                        <td className="py-3.5 px-4 font-sans font-bold text-white">{b.store_name}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                          ₹{b.total_sales.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-300">{b.total_bills}</td>
                        <td className="py-3.5 px-4 text-right text-purple-300">₹{b.gross_profit.toFixed(2)}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-blue-400">
                          {b.margin_percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500">Loading branch analytics...</div>
            )}
          </div>
        </main>
      )}

      {/* Tab 4: Supplier Price Benchmarks */}
      {activeTab === "prices" && (
        <main className="max-w-7xl mx-auto mt-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-1">Cross-Branch Supplier Rate Benchmarks</h2>
            <p className="text-xs text-slate-400 mb-6">
              Detects rate discrepancies where distributors charged different branches different purchase rates (PRD Rule 25)
            </p>

            {supplierPrices.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Zero supplier pricing discrepancies detected across stores.
              </div>
            ) : (
              <div className="space-y-4">
                {supplierPrices.map((sp, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-amber-400">Price Variance Detected</span>
                        <h3 className="text-base font-bold text-white">{sp.medicine_brand}</h3>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-rose-400 bg-rose-950/60 px-2.5 py-1 rounded-full border border-rose-900">
                          {sp.variance_percentage}% Variance
                        </span>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Savings opportunity: ₹{sp.potential_savings_per_unit} / unit
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                      {sp.store_rates.map((r, rIdx) => (
                        <div key={rIdx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 flex justify-between">
                          <span className="text-slate-300">{r.store_name} (Batch {r.batch_number}):</span>
                          <span className={`font-bold ${r.purchase_price === sp.min_purchase_rate ? "text-emerald-400" : "text-rose-400"}`}>
                            Purchase Rate: ₹{r.purchase_price.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Transfer Request Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create Inter-Store Transfer Request</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">Source Store (Dispatching Branch)</label>
                <select
                  value={sourceStoreId}
                  onChange={(e) => setSourceStoreId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Destination Store (Receiving Branch)</label>
                <select
                  value={destinationStoreId}
                  onChange={(e) => setDestinationStoreId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Transfer Quantity (Units)</label>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Transfer Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Reason for inter-store movement..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition"
                >
                  Create Transfer Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
