"use client";

import Image from "next/image";
import './pos.css';
import { Button, Field, StatusBadge, EmptyState, Skeleton } from '@/components/ui/primitives';
import { filterPOSMedicines, stockByMedicine as buildStockMap } from "@/lib/posCatalog";
import POSCatalog from '@/components/POSCatalog';
import { findBarcodeMedicine } from "@/lib/barcode";
import { defaultPosPreferences, readPosPreferences, barcodeBeep } from "@/lib/posPreferences";
import React, { useState, useEffect, useTransition, useCallback, useRef, useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Printer,
  Receipt,
  X,
  History,
  Camera,
  Upload,
  Mic,
} from "lucide-react";

import { startSpeechRecognition, isSpeechRecognitionSupported, SpeechController } from "@/lib/speechRecognition";
import { useAuth } from "@/context/AuthContext";
import { catalogFromPack, getCachedPack, getPendingQueue, refreshOfflineCatalog, reserveOfflineSale, recordSyncResults, QueuedSale } from "@/lib/offlineQueue";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getAuthToken,
  getOfflinePack,
  getSyncStatus,
  resolveSyncConflict,
  SyncConflictItem,
  replaySyncQueue,
  getSale,
  getSales,
  recognizeMedicine,
  decodeBarcodePhoto,
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
  const { user, token } = useAuth();
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncBusy = useRef(false);
  const checkoutBusy = useRef(false);
  const [serverConflicts, setServerConflicts] = useState<SyncConflictItem[]>([]);
  const [conflictNotes, setConflictNotes] = useState<Record<number, string>>({});
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const speech = useRef<SpeechController | null>(null);
  const canResolveConflicts = user?.role === "owner" || user?.role === "manager";


  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [catalogQuery, setCatalogQuery] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setCatalogQuery(searchQuery), 150); return () => window.clearTimeout(timer); }, [searchQuery]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodePhotoBusy, setBarcodePhotoBusy] = useState(false);
  const [posPreferences, setPosPreferences] = useState(defaultPosPreferences);
  const autoPrintPending = useRef(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLButtonElement>(null);
  const [selectedMedicine, setSelectedMedicine] = useState(0);
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const [undoRemoval, setUndoRemoval] = useState<{ before: CartItem[]; after: CartItem[] } | null>(null);
  useEffect(() => {
    const refresh = () => setPosPreferences(readPosPreferences(localStorage));
    queueMicrotask(refresh);
    window.addEventListener("focus", refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const barcodePhotoApply = useRef<((code: string) => void) | null>(null);

  const assertCurrentSession = useCallback(() => {
    if (!token || getAuthToken() !== token) throw new Error("The signed-in account changed in another tab. Reload before billing or syncing.");
  }, [token]);

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
  useEffect(() => {
    if (!recentReceipt || !autoPrintPending.current) return;
    autoPrintPending.current = false;
    if (!posPreferences.autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [recentReceipt, posPreferences.autoPrint]);
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
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to process packaging image.");
      } finally {
        setCvRecognizing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddCvMatchedMedicine = (medId: number) => {
    if (cvResult?.match_result?.low_confidence || cvResult?.match_result?.top_candidate?.medicine_id !== medId) return;
    const med = medicines.find((m) => m.id === medId);
    if (med) {
      handleAddToCart(med);
      setSuccessMessage(`Verified & Added ${med.brand_name} to cart via Camera Recognition.`);
      setShowCameraModal(false);
    } else {
      setErrorMessage("This medicine has no available stock in the current catalog. Refresh stock or select another medicine.");
      setShowCameraModal(false);
    }
  };

  const [isSubmitting, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showCachedCatalog = useCallback(async () => {
    if (!user) return;
    const records = getPendingQueue(user);
    setQueue(records);
    const pack = await getCachedPack(user);
    if (pack) {
      const catalog = catalogFromPack(pack, records);
      setMedicines(catalog.medicines);
      setBatches(catalog.batches);
      return true;
    }
    setMedicines([]);
    setBatches([]);
    return false;
  }, [user]);

  const loadCatalog = useCallback(async () => {
    if (!user) return;
    setLoadingCatalog(true);
    let downloadedCatalog: ReturnType<typeof catalogFromPack> | null = null;
    try {
      assertCurrentSession();
      if (!navigator.onLine) {
        if (!(await showCachedCatalog())) setErrorMessage("Connect once to download this account's medicine catalog before offline billing.");
        return;
      }
      await refreshOfflineCatalog(user, async () => {
        const response = await getOfflinePack();
        if (!response.data) throw new Error("No catalog snapshot was returned.");
        downloadedCatalog = catalogFromPack(response.data, getPendingQueue(user));
        return response.data;
      });
      await showCachedCatalog();
      setErrorMessage(null);
      setSyncError(null);
    } catch (error) {
      if (downloadedCatalog) {
        const loaded = downloadedCatalog as ReturnType<typeof catalogFromPack>;
        setMedicines(loaded.medicines);
        setBatches(loaded.batches);
        setErrorMessage("Catalog loaded online, but offline storage is unavailable. Retry sync before billing.");
        setSyncError(error instanceof Error ? error.message : "Offline catalog could not be saved.");
        return;
      }
      try {
        if (!(await showCachedCatalog())) setErrorMessage("Connect once to download this account's medicine catalog before offline billing.");
      } catch (cacheError) {
        setErrorMessage(cacheError instanceof Error ? cacheError.message : "Cannot read the offline catalog.");
      }
      if (!(error instanceof TypeError)) setSyncError(error instanceof Error ? error.message : "Catalog refresh failed.");
    } finally {
      setLoadingCatalog(false);
    }
  }, [user, showCachedCatalog, assertCurrentSession]);

  const syncQueuedSales = useCallback(async () => {
    if (!user || syncBusy.current || !navigator.onLine) return;
    syncBusy.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      assertCurrentSession();
      const pending = getPendingQueue(user).filter((item) => item.sync_status !== "synced");
      const summary = pending.length ? await replaySyncQueue(pending) : null;
      if (summary) {
        recordSyncResults(user, summary.results);
        const confirmed = summary.results.filter((result) => result.status === "synced" || result.status === "already_synced");
        if (confirmed.length) setSuccessMessage(`${confirmed.length} saved bill${confirmed.length === 1 ? "" : "s"} confirmed and synchronized.`);
      }
      await loadCatalog();
      try { setServerConflicts((await getSyncStatus()).recent_conflicts); }
      catch { /* Health refresh can retry separately; confirmed sale outcomes remain available. */ }
      return summary;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Sync failed. Local sales are preserved.");
    } finally {
      try { await showCachedCatalog(); }
      catch (error) { setSyncError(error instanceof Error ? error.message : "Cannot read the local sales ledger."); }
      syncBusy.current = false;
      setSyncing(false);
    }
  }, [user, loadCatalog, showCachedCatalog, assertCurrentSession]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); void syncQueuedSales(); };
    const onOffline = () => setOnline(false);
    const onStorage = () => { void showCachedCatalog().catch((error: unknown) => setSyncError(error instanceof Error ? error.message : "Cannot read catalog.")); };
    queueMicrotask(() => { setOnline(navigator.onLine); if (navigator.onLine) void syncQueuedSales(); else void loadCatalog(); });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadCatalog, syncQueuedSales, showCachedCatalog]);

  const handleResolveConflict = async (conflict: SyncConflictItem) => {
    const explanation = (conflictNotes[conflict.id] || "").trim();
    if (!explanation) { setSyncError("Enter manager notes explaining the stock correction before retrying."); return; }
    setResolvingId(conflict.id);
    setSyncError(null);
    try {
      assertCurrentSession();
      const result = await resolveSyncConflict(conflict.id, "MANUAL_INVENTORY_ADJUSTED", explanation);
      if (result.status !== "synced" && result.status !== "already_synced") setSyncError(result.message || "The sale still requires review.");
      await syncQueuedSales();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not reconcile the sale.");
    } finally { setResolvingId(null); }
  };

  const handleVoiceSearch = () => {
    if (speech.current) { speech.current.abort(); speech.current = null; setListening(false); return; }
    if (!isSpeechRecognitionSupported()) { setErrorMessage("Voice search is unavailable in this browser. Type the medicine name instead."); return; }
    setListening(true);
    speech.current = startSpeechRecognition(
      (transcript) => { setSearchQuery(transcript); setSuccessMessage(`Voice search: ${transcript}. Review the results and choose a medicine to add.`); },
      (message) => { setErrorMessage(message); setListening(false); speech.current = null; },
      () => { setListening(false); speech.current = null; },
    );
    if (!speech.current) setListening(false);
  };

  useEffect(() => () => { speech.current?.abort(); }, []);

  // Filter medicines based on search
  const filteredMedicines = useMemo(() => filterPOSMedicines(medicines, catalogQuery), [medicines, catalogQuery]);
  const stockByMedicine = useMemo(() => buildStockMap(batches), [batches]);

  // Add item to cart (Automatic FEFO Batch candidate selection)
  const handleAddToCart = useCallback((medicine: Medicine) => {
    if (checkoutBusy.current) {
      setErrorMessage("Wait for the current bill to finish before changing the cart.");
      return false;
    }
    const medBatches = batches
      .filter((batch) => batch.medicine_id === medicine.id && batch.total_available > 0)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    const fefoBatch = medBatches.find((batch) => {
      const inCart = cart.filter((item) => item.batch?.id === batch.id).reduce((sum, item) => sum + item.quantity, 0);
      return batch.total_available > inCart;
    });
    const totalStock = fefoBatch?.total_available || 0;
    if (!fefoBatch || totalStock <= 0) {
      setErrorMessage(`No unexpired stock is available for ${medicine.brand_name}.`);
      return false;
    }
    const existing = cart.find((item) => item.medicine.id === medicine.id && item.batch?.id === fefoBatch.id);

    if (existing) {
      if (existing.quantity >= totalStock && totalStock > 0) {
        setErrorMessage(`Cannot exceed available physical stock (${totalStock} units) for ${medicine.brand_name}.`);
        return false;
      }
      setCart(
        cart.map((item) =>
          item.medicine.id === medicine.id && item.batch?.id === fefoBatch.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
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
    setLastAdded(medicine.id);
    return true;
  }, [batches, cart]);

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutBusy.current || loadingCatalog) return;
    try {
      assertCurrentSession();
      const medicine = findBarcodeMedicine(medicines, barcodeInput);
      if (handleAddToCart(medicine)) {
        barcodeBeep(posPreferences.barcodeBeep);
        setSuccessMessage(`Barcode: added 1 stock unit of ${medicine.brand_name}. Review pack quantity before charging.`);
        setSearchQuery("");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Barcode scan failed.");
    }
    setBarcodeInput("");
  };

  const handleBarcodePhoto = async (file?: File) => {
    if (!file || barcodePhotoBusy || checkoutBusy.current || loadingCatalog) return;
    setBarcodePhotoBusy(true);
    try {
      const code = await decodeBarcodePhoto(file);
      assertCurrentSession();
      if (!checkoutBusy.current) barcodePhotoApply.current?.(code);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Could not scan barcode photo."); }
    finally { setBarcodePhotoBusy(false); }
  };

  useEffect(() => {
    barcodePhotoApply.current = code => {
      const medicine = findBarcodeMedicine(medicines, code);
      if (handleAddToCart(medicine)) {
        barcodeBeep(posPreferences.barcodeBeep);
        setSuccessMessage(`Barcode ${code}: added 1 stock unit of ${medicine.brand_name}.`);
      }
    };
    return () => { barcodePhotoApply.current = null; };
  }, [medicines, handleAddToCart, posPreferences.barcodeBeep]);

  // Update item quantity
  const handleUpdateQuantity = (index: number, delta: number) => {
    if (checkoutBusy.current) return;
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
    if (checkoutBusy.current) return;
    const updated = [...cart];
    updated.splice(index, 1);
    setUndoRemoval({ before: cart, after: updated });
    setCart(updated);
  };

  // Cart Calculations
  const grossSubtotal = cart.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  const itemDiscounts = cart.reduce(
    (sum, item) => sum + Math.round(item.unit_price * item.quantity * item.discount_pct) / 100,
    0
  );

  const totalDiscount = itemDiscounts + (Number(orderDiscount) || 0);

  // Simplified tax calculation matching medicine GST or standard 12%
  const estimatedTax = cart.reduce((sum, item) => {
    const gross = item.unit_price * item.quantity;
    const itemNet = gross - Math.round(gross * item.discount_pct) / 100;
    const taxRate = item.medicine.gst_percentage ?? 0;
    return sum + Math.round(itemNet * taxRate) / 100;
  }, 0);

  const grandTotal = Math.max(0, grossSubtotal - totalDiscount + estimatedTax);

  // Check if any Rx medicines are present
  const hasRxMedicines = cart.some((item) => item.medicine.is_prescription_only);

  // Process Checkout
  const handleCheckout = () => {
    if (checkoutBusy.current || !user) return;
    if (cart.length === 0) {
      setErrorMessage("Cart is empty. Please add items to bill.");
      return;
    }
    if (paymentMethod === "cash" && cashTendered.trim() &&
        (!Number.isFinite(Number(cashTendered)) || Number(cashTendered) < Number(grandTotal.toFixed(2)))) {
      setErrorMessage("Cash tendered is less than the amount payable.");
      return;
    }

    if (hasRxMedicines && posPreferences.requireDoctor && !doctorName.trim()) {
      setErrorMessage(
        "Prescription Required: Cart contains Schedule H / Rx medicines. Prescribing Doctor Name is mandatory."
      );
      return;
    }

    setErrorMessage(null);
    checkoutBusy.current = true;
    startTransition(async () => {
      try {
        assertCurrentSession();
        const currentCatalog = await getCachedPack(user);
        if (!currentCatalog) throw new Error("Download a catalog before billing.");
        const latest = catalogFromPack(currentCatalog, getPendingQueue(user));
        for (const item of cart) {
          const stock = latest.batches.find((batch) => batch.id === item.batch?.id);
          if (!stock || stock.total_available < item.quantity) throw new Error(`Stock changed for ${item.medicine.brand_name}. Refresh the cart.`);
        }
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

        const clientTxId = crypto.randomUUID();
        await reserveOfflineSale(user, {
          client_tx_id: clientTxId, client_timestamp: new Date().toISOString(),
          tx_type: "OFFLINE_SALE", sale_data: payload,
        });
        try { await showCachedCatalog(); }
        catch { setSyncError("Bill saved. Catalog refresh is unavailable; retry sync before the next bill."); }
        setSuccessMessage(`Sale ${clientTxId.slice(0, 8)} saved on this terminal, awaiting server confirmation. Keep browser data until synchronized.`);

        // Reset cart
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setDoctorName("");
        setCashTendered("");
        setOrderDiscount(0);
        setNotes("");

        const summary = await syncQueuedSales();
        const result = summary?.results.find((item) => item.client_tx_id === clientTxId);
        if (result?.status === "synced" || result?.status === "already_synced") {
          setSuccessMessage(`Invoice ${result.invoice_number || result.applied_sale_id} confirmed and synchronized.`);
          if (result.applied_sale_id) {
            try {
              const receipt = (await getSale(result.applied_sale_id)).sale;
              autoPrintPending.current = true;
              setRecentReceipt(receipt);
            }
            catch { /* Receipt fetch failure does not invalidate the confirmed sale. */ }
          }
        } else if (result) {
          setSuccessMessage(null);
          setErrorMessage(`Sale requires review: ${result.conflict_reason || result.error || result.message}. It remains in the terminal ledger below.`);
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to complete transaction.");
      } finally {
        checkoutBusy.current = false;
      }
    });
  };

  const handleOpenHistory = async () => {
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await getSales({ per_page: 25 });
      setSalesHistory(res.items || []);
    } catch {
      setErrorMessage("Failed to load invoice history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Cash change calculation
  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = Math.max(0, tenderedNum - grandTotal);

  const visibleSelection = Math.min(selectedMedicine, Math.max(0, filteredMedicines.length - 1));
  const blockingModal = showCameraModal || showHistoryModal || !!recentReceipt;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (recentReceipt && event.altKey && event.key.toLowerCase() === 'p') { event.preventDefault(); window.print(); return; }
      if (blockingModal) return;
      if (event.key === 'F2') { event.preventDefault(); barcodeRef.current?.focus(); }
      if (event.key === 'F8') { event.preventDefault(); paymentRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blockingModal, recentReceipt]);
  const undoRemovedItem = () => {
    if (!undoRemoval || checkoutBusy.current || cart !== undoRemoval.after) return;
    const valid = undoRemoval.before.every(item => {
      const batch = batches.find(batch => batch.id === item.batch?.id);
      return batch && batch.total_available >= item.quantity;
    });
    if (!valid) { setErrorMessage('Stock changed. Search the medicine again before adding it.'); return; }
    setCart(undoRemoval.before); setUndoRemoval(null);
  };

  return (
    <div className="pos-terminal">
      <header className="page-header pos-header">
        <div><p className="pos-eyebrow">COUNTER & DISPENSING</p><h1 className="page-title">POS Billing Terminal</h1><p className="page-subtitle">FEFO Stock Dispensing • GST Compliance • Retail Pharmacy Counter</p></div>
        <div className="pos-actions"><ThemeToggle /><Button variant="secondary" onClick={handleVoiceSearch} aria-pressed={listening}><Mic size={16} />{listening ? 'Stop listening' : 'Voice search'}</Button><Button variant="secondary" onClick={() => { setCvResult(null); setCvImagePreview(null); setShowCameraModal(true); }}><Camera size={16} />Scan barcode / packaging</Button><Button variant="secondary" onClick={handleOpenHistory}><History size={16} />Recent Invoices</Button></div>
      </header>
      <section className="pos-sync" aria-label="Terminal synchronization">
        <div className="pos-sync-line"><StatusBadge tone={online ? 'success' : 'warning'}>{online ? 'Online' : "Offline — using this account's saved catalog"}</StatusBadge><span role="status">{queue.length} local sale{queue.length === 1 ? '' : 's'} awaiting synchronization or review</span><Button variant="quiet" disabled={!online || syncing} onClick={() => void syncQueuedSales()}>{syncing ? 'Synchronizing…' : 'Sync now'}</Button></div>
        {syncError && <p role="alert" className="pos-warning">{syncError} Local records are preserved.</p>}
        {queue.length > 0 && <details><summary>Review local sales</summary><p>Pending sales retry automatically on reconnection. Conflicts require a manager to reconcile the server sync record; do not recreate the sale.</p><ul>{queue.map(item => <li key={item.client_tx_id}>{item.client_tx_id} · {new Date(item.client_timestamp).toLocaleString()} · {item.sync_status === 'synced' ? 'Confirmed; catalog refresh pending' : item.sync_status}{item.sync_message && ` — ${item.sync_message}`}</li>)}</ul></details>}
        {canResolveConflicts && serverConflicts.length > 0 && <details><summary>Manager review: {serverConflicts.length} recent server conflict{serverConflicts.length === 1 ? '' : 's'}</summary>{serverConflicts.map(conflict => <div className="pos-conflict" key={conflict.id}><p>{conflict.client_tx_id} — {conflict.conflict_reason}</p><p>Correct stock or catalog data in Inventory first, then retry the original sale. A new invoice is created only if the retry succeeds.</p><Field label="Manager reconciliation notes" value={conflictNotes[conflict.id] || ''} onChange={e => setConflictNotes(previous => ({ ...previous, [conflict.id]: e.target.value }))} /><Button variant="secondary" disabled={resolvingId !== null || syncing || !online || !(conflictNotes[conflict.id] || '').trim()} onClick={() => void handleResolveConflict(conflict)}>{resolvingId === conflict.id ? 'Retrying…' : 'Retry after stock correction'}</Button></div>)}</details>}
      </section>
      <div className="pos-workspace">
        <section className="pos-catalog" aria-label="Medicine catalog">
          <div className="ui-card pos-search-card">
            <form className="pos-barcode-form" onSubmit={handleBarcodeScan}><label className="ui-field pos-barcode-field">Barcode <span className="pos-key">F2</span><input ref={barcodeRef} aria-label="Barcode scanner input" className="form-input" type="text" autoComplete="off" spellCheck={false} autoFocus placeholder="Scan barcode, then press Enter" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} maxLength={64} disabled={loadingCatalog || isSubmitting} /></label><Button type="submit" disabled={loadingCatalog || isSubmitting}>Add barcode</Button></form>
            <div className="pos-search-row"><div className="ui-field pos-search-field"><label htmlFor="pos-medicine-search">Medicine name, molecule or barcode</label><input id="pos-medicine-search" ref={searchRef} className="form-input" type="search" value={searchQuery} placeholder="Search stocked medicines…" onChange={e => { setSearchQuery(e.target.value); setSelectedMedicine(0); }} disabled={isSubmitting} onKeyDown={e => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSelectedMedicine(Math.max(0, Math.min(filteredMedicines.length - 1, visibleSelection + (e.key === 'ArrowDown' ? 1 : -1)))); }
              if (e.key === 'Enter' && !loadingCatalog) { e.preventDefault(); const selected = catalogQuery === searchQuery ? filteredMedicines[visibleSelection] : filterPOSMedicines(medicines, searchQuery)[0]; setCatalogQuery(searchQuery); if (selected) handleAddToCart(selected); }
            }} aria-describedby="pos-search-help" /></div><label className="ui-button ui-button--secondary pos-photo-label"><Camera size={16} />{barcodePhotoBusy ? 'Reading barcode…' : 'Barcode photo / camera'}<input className="pos-file-input" type="file" aria-label="Scan barcode photo or camera" accept="image/*" capture="environment" disabled={loadingCatalog || barcodePhotoBusy || isSubmitting} onChange={e => { void handleBarcodePhoto(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
            <p id="pos-search-help" className="ui-hint">↑ ↓ Choose medicine · Enter Add selected medicine · Nearest expiry batch selected automatically</p>
          </div>
          {errorMessage && <div role="alert" className="pos-message pos-message--error"><AlertTriangle size={18} /><span>{errorMessage}</span></div>}
          {successMessage && <div role="status" className="pos-message pos-message--success"><CheckCircle2 size={18} /><span>{successMessage}</span></div>}
          <div className="pos-catalog-heading"><h2>Stocked medicines</h2><span>{filteredMedicines.length} results</span></div>
          {loadingCatalog ? <Skeleton label="Loading medicine catalog" rows={5} /> : <POSCatalog medicines={filteredMedicines} stock={stockByMedicine} selectedId={filteredMedicines[visibleSelection]?.id} onAdd={handleAddToCart} disabled={isSubmitting} empty={`No medicines match "${searchQuery}"`} />}
        </section>
        <aside className="ui-card pos-bill" aria-label="Current bill">
          <div className="pos-bill-heading"><h2>Current Bill</h2><span>{cart.length} {cart.length === 1 ? 'item' : 'items'}</span></div>
          <div className="pos-two-columns"><Field label="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} /><Field label="Mobile (WhatsApp)" type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
          {hasRxMedicines && <div><Field label={posPreferences.requireDoctor ? 'Prescribing Doctor Name * (Required for Rx)' : 'Prescribing Doctor Name (optional)'} required={posPreferences.requireDoctor} value={doctorName} onChange={e => setDoctorName(e.target.value)} /><p className="pos-warning">Schedule H requirement: Doctor verification recorded on receipt.</p></div>}
          <div className="pos-cart-list" aria-label="Bill items">
            {cart.length === 0 ? <EmptyState title="Your bill is empty" description="Scan a barcode or select medicines from the catalog to dispense." /> : cart.map((item, idx) => <article className={`pos-cart-item ${lastAdded === item.medicine.id ? 'pos-cart-item--recent' : ''}`} key={`${item.medicine.id}:${item.batch?.id}`}><div className="pos-cart-item-heading"><div><strong>{item.medicine.brand_name}</strong><p>{item.batch ? `FEFO Batch: ${item.batch.batch_number}` : 'Auto FEFO'} • ₹{item.unit_price.toFixed(2)}/unit</p></div><Button variant="quiet" aria-label={`Remove ${item.medicine.brand_name}`} disabled={isSubmitting} onClick={() => handleRemoveItem(idx)}><Trash2 size={16} /></Button></div><div className="pos-cart-item-footer"><div className="pos-quantity"><Button variant="quiet" aria-label={`Decrease quantity of ${item.medicine.brand_name}`} disabled={isSubmitting} onClick={() => handleUpdateQuantity(idx, -1)}>−</Button><span className="pos-number">{item.quantity}</span><Button variant="quiet" aria-label={`Increase quantity of ${item.medicine.brand_name}`} disabled={isSubmitting} onClick={() => handleUpdateQuantity(idx, 1)}>+</Button></div><strong className="pos-number">₹{(item.unit_price * item.quantity).toFixed(2)}</strong></div></article>)}
          </div>
          {undoRemoval && cart === undoRemoval.after && !isSubmitting && <Button variant="quiet" onClick={undoRemovedItem}>Undo removed item</Button>}
          <fieldset className="pos-payment"><legend>Payment Mode</legend><div className="pos-payment-options">{(['cash', 'upi', 'card'] as const).map(method => <Button key={method} variant={paymentMethod === method ? 'primary' : 'secondary'} aria-pressed={paymentMethod === method} disabled={isSubmitting} onClick={() => setPaymentMethod(method)}>{method === 'cash' ? 'Cash' : method === 'upi' ? 'UPI / QR' : 'Card'}</Button>)}</div></fieldset>
          {paymentMethod === 'cash' && <div className="pos-two-columns"><Field label="Tendered (₹)" type="number" placeholder="e.g. 500" value={cashTendered} onChange={e => setCashTendered(e.target.value)} /><div className="ui-field"><span className="ui-hint">Change Due</span><strong className="pos-change pos-number">₹{changeDue.toFixed(2)}</strong></div></div>}
          <div className="pos-totals"><div><span>Subtotal:</span><span className="pos-number">₹{grossSubtotal.toFixed(2)}</span></div>{posPreferences.showGst && <div><span>Estimated GST (Tax):</span><span className="pos-number">₹{estimatedTax.toFixed(2)}</span></div>}{totalDiscount > 0 && <div><span>Discount:</span><span className="pos-number">-₹{totalDiscount.toFixed(2)}</span></div>}<div className="pos-grand-total"><span>Total Payable:</span><strong className="pos-number">₹{grandTotal.toFixed(2)}</strong></div></div>
          <div className="pos-checkout"><Button ref={paymentRef} onClick={handleCheckout} disabled={cart.length === 0 || isSubmitting} busy={isSubmitting}><Receipt size={18} />{isSubmitting ? 'Dispensing & Printing...' : `Charge ₹${grandTotal.toFixed(2)}`}</Button><p className="ui-hint">F2 Barcode · F8 Focus payment</p></div>
        </aside>
      </div>

      {/* =====================================================================
          Modal: Printable Digital Receipt / Invoice
          ===================================================================== */}
      {recentReceipt && (
        <div className="modal-backdrop" data-receipt-backdrop onClick={() => setRecentReceipt(null)}>
          <style media="print">{`@page { size: ${posPreferences.receiptSize === "a4" ? "A4" : "80mm 297mm"}; margin: 4mm; } [data-pos-receipt] { width: ${posPreferences.receiptSize === "a4" ? "190mm" : "72mm"} !important; }`}</style>
          <div className="modal-content" data-pos-receipt onClick={(e) => e.stopPropagation()} style={{ maxWidth: posPreferences.receiptSize === "a4" ? "800px" : "520px" }}>
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
                  {posPreferences.showGst && <><span>Tax (GST)</span><span>₹{recentReceipt.tax_amount.toFixed(2)}</span></>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-primary)", fontWeight: 700, fontSize: "0.9375rem" }}>
                  <span>Grand Total</span>
                  <span>₹{recentReceipt.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button title="Print receipt (Alt+P)" onClick={() => window.print()} className="btn btn-primary" style={{ height: "34px" }}>
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
                    backgroundColor: "var(--brand-subtle)",
                    border: "1px solid #1e6ee8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--brand-primary)",
                  }}
                >
                  <Camera size={15} />
                </div>
                <div>
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Scan barcode or medicine packaging
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
                  <Image
                    width={360}
                    height={180}
                    unoptimized
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
                  Checking barcode first, then reading packaging text...
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
                  {cvResult.match_result?.top_candidate && !cvResult.match_result.low_confidence ? (
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
                          {cvResult.barcode ? "Exact barcode match" : `${Math.max(0, Math.min(100, cvResult.match_result.top_candidate.confidence_score)).toFixed(0)}% match score`}
                        </span>
                      </div>

                      {/* Human Verification Notice */}
                      {cvResult.extracted_entities?.strength_inferred && <p style={{ fontSize: "0.75rem", color: "var(--status-med-text)" }}>
                        Dose was inferred from the printed product name. Confirm the strength, formulation and pack before adding.
                      </p>}
                      {cvResult.photo_model && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {cvResult.photo_model.agrees_with_ocr
                            ? "Photo model supports the text match. Confirm the name and strength on the pack."
                            : "Photo model could not confirm this text match. Check the pack carefully."}
                        </div>
                      )}
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
                      {cvResult.barcode
                        ? `Barcode ${cvResult.barcode} is not linked to one active medicine. Link it in Medicines Catalog, then sync POS.`
                        : "Unable to confidently identify this medicine. Capture another image or search manually."}
                      {cvResult.ocr?.full_text && (
                        <div style={{ marginTop: "0.75rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", maxHeight: "120px", overflowY: "auto" }}>
                          Text read from packaging: {cvResult.ocr.full_text}
                        </div>
                      )}
                      <button className="btn btn-secondary" style={{ marginTop: "0.75rem" }} onClick={() => {
                        setSearchQuery(cvResult.extracted_entities?.brand_name || "");
                        setShowCameraModal(false);
                      }}>Search catalog manually</button>
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
