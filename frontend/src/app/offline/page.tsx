"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getOfflinePack,
  replaySyncQueue,
  getSyncStatus,
  resolveSyncConflict,
  OfflinePackData,
  OfflinePackMedicine,
  OfflinePackBatch,
  OfflineQueueItem,
  SyncReplaySummary,
  SyncStatusSummary,
} from "@/lib/api";
import {
  getPendingQueue,
  enqueueOfflineSale,
  removeQueueItem,
  clearSyncedQueue,
  saveCachedPack,
  getCachedPack,
  searchCachedMedicines,
} from "@/lib/offlineQueue";

export default function OfflineSyncWorkstation() {
  // Connectivity & Pack state
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [cachedPack, setCachedPack] = useState<OfflinePackData | null>(null);
  const [packLoading, setPackLoading] = useState<boolean>(false);
  const [packMsg, setPackMsg] = useState<string | null>(null);

  // Queue state
  const [pendingQueue, setPendingQueue] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncSummary, setSyncSummary] = useState<SyncReplaySummary | null>(null);

  // Cloud Status & Conflicts state
  const [cloudStatus, setCloudStatus] = useState<SyncStatusSummary | null>(null);
  const [conflictLoading, setConflictLoading] = useState<boolean>(false);

  // Offline Billing Form state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<OfflinePackMedicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<OfflinePackMedicine | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<OfflinePackBatch | null>(null);
  const [sellQty, setSellQty] = useState<number>(1);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [billingNotes, setBillingNotes] = useState<string>("");
  const [offlineSaleReceipt, setOfflineSaleReceipt] = useState<OfflineQueueItem | null>(null);

  // Initial Load
  useEffect(() => {
    refreshQueueFromStorage();
    const existingPack = getCachedPack();
    if (existingPack) {
      setCachedPack(existingPack);
    }
    if (!isSimulatedOffline) {
      fetchCloudStatus();
      if (!existingPack) {
        downloadFreshPack();
      }
    }
  }, [isSimulatedOffline]);

  function refreshQueueFromStorage() {
    setPendingQueue(getPendingQueue());
  }

  async function downloadFreshPack() {
    setPackLoading(true);
    setPackMsg(null);
    try {
      const res = await getOfflinePack();
      if (res.data) {
        setCachedPack(res.data);
        saveCachedPack(res.data);
        setPackMsg(`Offline catalog refreshed (${res.data.total_medicines} medicines, version: ${res.data.version_hash})`);
      }
    } catch (err: any) {
      setPackMsg(`Could not download pack: ${err.message}`);
    } finally {
      setPackLoading(false);
    }
  }

  async function fetchCloudStatus() {
    try {
      const status = await getSyncStatus();
      setCloudStatus(status);
    } catch (err) {
      console.error("Failed to fetch cloud status:", err);
    }
  }

  // Handle Search in local cached pack
  useEffect(() => {
    if (!cachedPack) {
      setSearchResults([]);
      return;
    }
    const results = searchCachedMedicines(searchQuery);
    setSearchResults(results);
  }, [searchQuery, cachedPack]);

  function handleSelectMedicine(med: OfflinePackMedicine) {
    setSelectedMedicine(med);
    if (med.batches && med.batches.length > 0) {
      setSelectedBatch(med.batches[0]); // Auto-FEFO first expiring batch
    } else {
      setSelectedBatch(null);
    }
    setSellQty(1);
  }

  function handleCreateOfflineSale(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMedicine || !selectedBatch) {
      alert("Please select a medicine and active batch.");
      return;
    }

    if (sellQty <= 0) {
      alert("Quantity must be at least 1.");
      return;
    }

    if (sellQty > selectedBatch.quantity_available) {
      const proceed = confirm(
        `Warning: Selected quantity (${sellQty}) exceeds local batch stock (${selectedBatch.quantity_available}). Create offline sale anyway?`
      );
      if (!proceed) return;
    }

    const unitPrice = selectedBatch.mrp || selectedMedicine.selling_price || 0;
    const itemTotal = unitPrice * sellQty;
    const clientTxId = `OFFLINE-SALE-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const newSaleItem: OfflineQueueItem = {
      client_tx_id: clientTxId,
      client_timestamp: new Date().toISOString(),
      tx_type: "OFFLINE_SALE",
      sale_data: {
        items: [
          {
            medicine_id: selectedMedicine.id,
            batch_id: selectedBatch.id,
            medicine_name: selectedMedicine.brand_name,
            batch_number: selectedBatch.batch_number,
            quantity: sellQty,
            unit_price: unitPrice,
          },
        ],
        payments: [
          {
            payment_method: paymentMethod,
            amount: itemTotal,
          },
        ],
        customer: {
          name: customerName.trim() || undefined,
          phone: customerPhone.trim() || undefined,
        },
        notes: billingNotes.trim() || undefined,
      },
    };

    // Update local batch stock in cache to prevent cashier double-selling
    if (cachedPack) {
      const updatedPack = { ...cachedPack };
      const targetMed = updatedPack.medicines.find((m) => m.id === selectedMedicine.id);
      if (targetMed) {
        const targetB = targetMed.batches.find((b) => b.id === selectedBatch.id);
        if (targetB) {
          targetB.quantity_available = Math.max(0, targetB.quantity_available - sellQty);
          targetMed.total_stock = Math.max(0, targetMed.total_stock - sellQty);
        }
      }
      setCachedPack(updatedPack);
      saveCachedPack(updatedPack);
    }

    // Enqueue
    enqueueOfflineSale(newSaleItem);
    refreshQueueFromStorage();
    setOfflineSaleReceipt(newSaleItem);

    // Reset Form
    setSelectedMedicine(null);
    setSelectedBatch(null);
    setSearchQuery("");
    setSellQty(1);
    setCustomerName("");
    setCustomerPhone("");
    setBillingNotes("");
  }

  async function handleSyncReplay() {
    if (isSimulatedOffline) {
      alert("Cannot replay while Offline Simulation Mode is active. Switch to Online mode first.");
      return;
    }

    if (pendingQueue.length === 0) {
      alert("No pending transactions in offline queue.");
      return;
    }

    setIsSyncing(true);
    setSyncSummary(null);

    try {
      const summary = await replaySyncQueue(pendingQueue);
      setSyncSummary(summary);

      // Collect successfully synced IDs and remove them from local queue
      const syncedIds: string[] = [];
      summary.results.forEach((r) => {
        if (r.status === "synced" || r.status === "already_synced") {
          syncedIds.push(r.client_tx_id);
        }
      });

      if (syncedIds.length > 0) {
        clearSyncedQueue(syncedIds);
        refreshQueueFromStorage();
      }

      await fetchCloudStatus();
      await downloadFreshPack();
    } catch (err: any) {
      alert(`Sync Replay failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleResolveConflict(syncId: number, resolution: string) {
    const notes = prompt("Enter manager resolution notes for audit ledger:", "Approved discrepancy");
    if (!notes) return;

    setConflictLoading(true);
    try {
      await resolveSyncConflict(syncId, resolution, notes);
      await fetchCloudStatus();
    } catch (err: any) {
      alert(`Failed to resolve conflict: ${err.message}`);
    } finally {
      setConflictLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📶</span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Offline Synchronization & Local Store
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800">
              PRD Rule 24
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Uninterrupted counter dispensing during broadband outages with idempotent cloud replay
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connectivity Status Badge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
              isSimulatedOffline
                ? "bg-amber-950/60 border-amber-600 text-amber-300"
                : "bg-emerald-950/60 border-emerald-600 text-emerald-300"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isSimulatedOffline ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
            {isSimulatedOffline ? "OFFLINE (Simulated)" : "CLOUD CONNECTED (MySQL)"}
          </div>

          <button
            onClick={() => setIsSimulatedOffline(!isSimulatedOffline)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 transition"
          >
            {isSimulatedOffline ? "🔌 Reconnect Online" : "⚡ Simulate Network Drop"}
          </button>

          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition"
          >
            ← Main Hub
          </Link>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        {/* Left Column: Offline POS Counter Dispense (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          {/* Local Catalog Cache Info Card */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Local Catalog Pack</span>
                {cachedPack && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Hash: {cachedPack.version_hash}
                  </span>
                )}
              </div>
              <div className="text-sm font-medium text-slate-200 mt-1">
                {cachedPack ? (
                  <span>
                    📦 <strong>{cachedPack.total_medicines}</strong> medicines, <strong>{cachedPack.total_active_batches}</strong> active batches cached locally
                  </span>
                ) : (
                  <span className="text-amber-400">No local pack cached. Click download to enable offline billing.</span>
                )}
              </div>
              {packMsg && <div className="text-xs text-cyan-400 mt-1">{packMsg}</div>}
            </div>

            <button
              onClick={downloadFreshPack}
              disabled={packLoading || isSimulatedOffline}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30 disabled:opacity-40 transition whitespace-nowrap"
            >
              {packLoading ? "Downloading..." : "🔄 Refresh Pack"}
            </button>
          </div>

          {/* Offline Counter Dispensing Terminal */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>💊</span> Offline Counter Dispenser
                </h2>
                <p className="text-xs text-slate-400">
                  Bill medicines directly from local cache; generates instant offline receipt
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 font-mono">
                Terminal #01
              </span>
            </div>

            <form onSubmit={handleCreateOfflineSale} className="space-y-4">
              {/* Medicine Search Box */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  1. Search Medicine (Cached Catalog)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type brand name (e.g. Crocin, Dolo, Paracetamol)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {searchQuery.trim().length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-950 border border-slate-800 divide-y divide-slate-800/60 shadow-lg">
                    {searchResults.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 text-center">
                        No cached medicines match &ldquo;{searchQuery}&rdquo;
                      </div>
                    ) : (
                      searchResults.map((med) => (
                        <div
                          key={med.id}
                          onClick={() => handleSelectMedicine(med)}
                          className={`p-3 text-xs cursor-pointer hover:bg-slate-800/80 transition flex items-center justify-between ${
                            selectedMedicine?.id === med.id ? "bg-cyan-950/40 border-l-4 border-cyan-500" : ""
                          }`}
                        >
                          <div>
                            <div className="font-bold text-slate-200">
                              {med.brand_name} <span className="text-slate-400 font-normal">({med.strength})</span>
                            </div>
                            <div className="text-slate-400 text-[11px]">
                              {med.generic_name} • {med.dosage_form} • {med.manufacturer}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-white">₹{med.selling_price || med.mrp}</div>
                            <div className={`text-[11px] font-semibold ${med.total_stock > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {med.total_stock} in stock
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected Medicine Details & Batch Selection */}
              {selectedMedicine && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-cyan-400 font-semibold uppercase">Selected Product</span>
                      <h3 className="text-base font-bold text-white">
                        {selectedMedicine.brand_name} {selectedMedicine.strength}
                      </h3>
                      <p className="text-xs text-slate-400">{selectedMedicine.generic_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMedicine(null)}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      ✕ Remove
                    </button>
                  </div>

                  {/* Batch Selection (FEFO Aware) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      2. Available Batch (FEFO Prioritized)
                    </label>
                    {selectedMedicine.batches.length === 0 ? (
                      <div className="text-xs text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900">
                        No active stock for this medicine in local cache.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedMedicine.batches.map((b, idx) => (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBatch(b)}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                              selectedBatch?.id === b.id
                                ? "bg-cyan-950/60 border-cyan-500 text-white"
                                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850"
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>Batch {b.batch_number}</span>
                              {idx === 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  FEFO #1
                                </span>
                              )}
                            </div>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              Exp: {b.expiry_date} • Loc: {b.location_name}
                            </div>
                            <div className="flex items-center justify-between mt-1 text-[11px]">
                              <span className="font-semibold text-cyan-400">Stock: {b.quantity_available}</span>
                              <span className="text-white font-bold">₹{b.mrp}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quantity & Payment Method */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        3. Quantity (Units)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedBatch?.quantity_available || 100}
                        value={sellQty}
                        onChange={(e) => setSellQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        4. Payment Tender
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("cash")}
                          className={`py-2 text-xs font-bold rounded-lg border transition ${
                            paymentMethod === "cash"
                              ? "bg-emerald-950 border-emerald-500 text-emerald-300"
                              : "bg-slate-900 border-slate-700 text-slate-400"
                          }`}
                        >
                          💵 Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("upi")}
                          className={`py-2 text-xs font-bold rounded-lg border transition ${
                            paymentMethod === "upi"
                              ? "bg-purple-950 border-purple-500 text-purple-300"
                              : "bg-slate-900 border-slate-700 text-slate-400"
                          }`}
                        >
                          📱 UPI
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Customer Info (Optional) */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <input
                      type="text"
                      placeholder="Customer Name (Optional)"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                    <input
                      type="tel"
                      placeholder="Phone (Optional)"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Calculation Summary & Submit Button */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400">Total Offline Bill:</span>
                      <div className="text-xl font-black text-emerald-400">
                        ₹{((selectedBatch?.mrp || selectedMedicine.selling_price || 0) * sellQty).toFixed(2)}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!selectedBatch}
                      className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/40 disabled:opacity-40 transition"
                    >
                      ⚡ Bill & Enqueue Offline
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Last Offline Sale Printable Receipt Modal */}
          {offlineSaleReceipt && (
            <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-700/50 shadow-lg">
              <div className="flex items-center justify-between border-b border-emerald-800/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧾</span>
                  <h3 className="font-bold text-white text-sm">Offline Cash Receipt Generated</h3>
                </div>
                <button
                  onClick={() => setOfflineSaleReceipt(null)}
                  className="text-xs text-emerald-400 hover:text-emerald-200"
                >
                  ✕ Close
                </button>
              </div>

              <div className="mt-3 text-xs space-y-1.5 font-mono text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Receipt ID:</span>
                  <span className="font-bold text-cyan-300">{offlineSaleReceipt.client_tx_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span>{new Date(offlineSaleReceipt.client_timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Medicine:</span>
                  <span className="text-white font-bold">
                    {offlineSaleReceipt.sale_data.items[0]?.medicine_name} (Qty: {offlineSaleReceipt.sale_data.items[0]?.quantity})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tender:</span>
                  <span className="uppercase text-emerald-400 font-bold">
                    {offlineSaleReceipt.sale_data.payments[0]?.payment_method} ₹
                    {offlineSaleReceipt.sale_data.payments[0]?.amount.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-emerald-800/40">
                <span className="text-[11px] text-emerald-400">
                  ✓ Stock reserved locally. Transaction saved in local sync queue.
                </span>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-emerald-900/60 border border-emerald-600 rounded text-xs text-emerald-200 font-semibold hover:bg-emerald-800/60 transition"
                >
                  🖨️ Print Receipt
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Sync Queue & Conflict Resolution (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {/* Pending Queue Manager */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📤</span> Local Sync Queue
                </h2>
                <p className="text-xs text-slate-400">Pending upload to central MySQL database</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                {pendingQueue.length} Pending
              </span>
            </div>

            {/* Sync Action Button */}
            <div className="mb-4">
              <button
                onClick={handleSyncReplay}
                disabled={isSyncing || pendingQueue.length === 0 || isSimulatedOffline}
                className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/40 disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <span className="animate-spin text-lg">⏳</span> Replaying Queue to Cloud...
                  </>
                ) : (
                  <>
                    <span>🚀</span> Sync Queue to Cloud ({pendingQueue.length})
                  </>
                )}
              </button>
              {isSimulatedOffline && (
                <p className="text-[11px] text-amber-400 text-center mt-1.5">
                  Offline mode active. Reconnect to upload queue.
                </p>
              )}
            </div>

            {/* Sync Summary Result Banner */}
            {syncSummary && (
              <div className="p-3 mb-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <div className="font-bold text-slate-200">Replay Results:</div>
                <div className="grid grid-cols-4 gap-2 text-center text-[11px] pt-1">
                  <div className="bg-emerald-950/50 p-1.5 rounded border border-emerald-900 text-emerald-400">
                    <span className="font-bold">{syncSummary.synced}</span> Synced
                  </div>
                  <div className="bg-cyan-950/50 p-1.5 rounded border border-cyan-900 text-cyan-400">
                    <span className="font-bold">{syncSummary.already_synced}</span> Duplicate
                  </div>
                  <div className="bg-amber-950/50 p-1.5 rounded border border-amber-900 text-amber-400">
                    <span className="font-bold">{syncSummary.conflicts}</span> Conflict
                  </div>
                  <div className="bg-rose-950/50 p-1.5 rounded border border-rose-900 text-rose-400">
                    <span className="font-bold">{syncSummary.failed}</span> Failed
                  </div>
                </div>
              </div>
            )}

            {/* Queue Items List */}
            <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2.5 pr-1">
              {pendingQueue.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl">
                  <span className="text-3xl">🎉</span>
                  <div className="text-sm font-semibold text-slate-300 mt-2">Queue is Empty</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    All counter sales are synchronized with the central database.
                  </div>
                </div>
              ) : (
                pendingQueue.map((item) => (
                  <div
                    key={item.client_tx_id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="font-mono text-cyan-300 font-bold text-[11px]">
                        {item.client_tx_id}
                      </div>
                      <div className="text-white font-semibold mt-0.5">
                        {item.sale_data.items[0]?.medicine_name || "Medicine"} (x
                        {item.sale_data.items[0]?.quantity})
                      </div>
                      <div className="text-slate-500 text-[10px]">
                        {new Date(item.client_timestamp).toLocaleTimeString()} • {item.sale_data.payments[0]?.payment_method.toUpperCase()}
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="font-bold text-emerald-400 text-sm">
                        ₹{item.sale_data.payments[0]?.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Remove transaction from queue?")) {
                            removeQueueItem(item.client_tx_id);
                            refreshQueueFromStorage();
                          }
                        }}
                        className="text-[10px] text-rose-400 hover:text-rose-300"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cloud Health & Conflict Ledger */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🛡️</span> Cloud Ledger & Conflicts
              </h2>
              <span className="text-xs text-slate-400">
                {cloudStatus ? `Last sync: ${cloudStatus.last_synced_at ? new Date(cloudStatus.last_synced_at).toLocaleTimeString() : 'None'}` : 'Syncing...'}
              </span>
            </div>

            {cloudStatus && (
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Cloud Synced</div>
                  <div className="text-base font-bold text-emerald-400">{cloudStatus.total_synced}</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Active Conflicts</div>
                  <div className="text-base font-bold text-amber-400">{cloudStatus.total_conflicts}</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Failed</div>
                  <div className="text-base font-bold text-rose-400">{cloudStatus.total_failed}</div>
                </div>
              </div>
            )}

            {/* Recent Conflicts Table */}
            {cloudStatus && cloudStatus.recent_conflicts && cloudStatus.recent_conflicts.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  ⚠️ Unresolved Stock Conflicts (Manager Action)
                </span>
                {cloudStatus.recent_conflicts.map((c) => (
                  <div key={c.id} className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/60 text-xs">
                    <div className="flex justify-between font-mono text-[11px] text-amber-300">
                      <span>{c.client_tx_id}</span>
                      <span className="uppercase font-bold">{c.status}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1">{c.conflict_reason}</p>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleResolveConflict(c.id, "WRITE_OFF")}
                        disabled={conflictLoading}
                        className="px-2 py-1 rounded bg-amber-900/60 border border-amber-600 text-amber-200 text-[10px] font-semibold hover:bg-amber-800 transition"
                      >
                        ✍️ Write Off Discrepancy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 text-center py-2">
                Zero open synchronization conflicts. Inventory matches central MySQL ledger.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
