import type { BatchItem, Medicine, OfflinePackData, OfflineQueueItem, SyncReplayResult } from "./api";

export interface OfflineIdentity { store_id: number; id: number }
export interface QueuedSale extends OfflineQueueItem {
  sync_status: "pending" | "conflict" | "failed" | "synced";
  sync_message?: string;
}

// Each account owns its ledger. Never adopt the old unscoped queue whose owner is unknown.
function key(kind: string, identity: OfflineIdentity): string {
  return `smartpharm_${kind}_v2:${identity.store_id}:${identity.id}`;
}

export function getPendingQueue(identity: OfflineIdentity): QueuedSale[] {
  const prefix = key("offline_sale", identity) + ":";
  const queue: QueuedSale[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const recordKey = localStorage.key(index);
    if (!recordKey?.startsWith(prefix)) continue;
    const raw = localStorage.getItem(recordKey);
    if (!raw) continue;
    const record = JSON.parse(raw) as QueuedSale;
    if (!record.client_tx_id || !Array.isArray(record.sale_data?.items)) throw new Error("The local sales ledger cannot be read. Keep this browser data and contact your manager.");
    queue.push(record);
  }
  return queue.sort((a, b) => a.client_timestamp.localeCompare(b.client_timestamp));
}

export function enqueueOfflineSale(identity: OfflineIdentity, item: OfflineQueueItem): void {
  const recordKey = key("offline_sale", identity) + ":" + item.client_tx_id;
  if (localStorage.getItem(recordKey)) return;
  // One key per transaction prevents another tab's new sale being lost in a queue rewrite.
  // Surface storage errors: checkout must never appear saved when disk storage failed.
  localStorage.setItem(recordKey, JSON.stringify({ ...item, sync_status: "pending" }));
}

export function recordSyncResults(identity: OfflineIdentity, results: SyncReplayResult[]): void {
  for (const result of results) {
    const recordKey = key("offline_sale", identity) + ":" + result.client_tx_id;
    const raw = localStorage.getItem(recordKey);
    if (!raw) continue;
    const item: QueuedSale = JSON.parse(raw);
    localStorage.setItem(recordKey, JSON.stringify({
      ...item,
      sync_status: result.status === "already_synced" ? "synced" : result.status,
      sync_message: result.conflict_reason || result.error || result.message,
    }));
  }
}

// Call only after refreshing the stock snapshot, otherwise a stale cache could resell synced stock.
export function clearSyncedQueue(identity: OfflineIdentity, acknowledgedIds: string[]): void {
  const acknowledged = new Set(acknowledgedIds);
  for (const item of getPendingQueue(identity)) {
    if (item.sync_status === "synced" && acknowledged.has(item.client_tx_id)) localStorage.removeItem(key("offline_sale", identity) + ":" + item.client_tx_id);
  }
}

// Catalogs can contain the full medicine registry and exceed localStorage's
// small string quota. IndexedDB stores structured data separately from sales.
function openCatalogDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline catalog storage is unavailable in this browser.")); return;
    }
    const request = indexedDB.open("smartpharm-offline-catalog", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("catalogs")) request.result.createObjectStore("catalogs");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new Error("Cannot open offline catalog storage. Saved bills are preserved."));
    request.onblocked = () => reject(new Error("Close other SmartPharm tabs and retry catalog storage."));
  });
}

async function catalogTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openCatalogDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction("catalogs", mode);
    const request = action(transaction.objectStore("catalogs"));
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onabort = () => {
      database.close();
      reject(new Error(transaction.error?.name === "QuotaExceededError"
        ? "Device storage is full. Free space and retry. Saved bills are preserved."
        : "Could not save or read the offline catalog. Saved bills are preserved."));
    };
    transaction.onerror = () => { /* onabort reports the transaction failure. */ };
  });
}

export async function saveCachedPack(identity: OfflineIdentity, pack: OfflinePackData): Promise<void> {
  if (pack.store_id !== identity.store_id) throw new Error("Catalog belongs to another pharmacy.");
  await catalogTransaction("readwrite", (store) => store.put(pack, key("offline_pack", identity)));
  // Remove only this superseded cache after the durable IndexedDB commit.
  // Never clear the queue or another account's records to make space.
  localStorage.removeItem(key("offline_pack", identity));
}

export async function getCachedPack(identity: OfflineIdentity): Promise<OfflinePackData | null> {
  let pack = await catalogTransaction<OfflinePackData | undefined>("readonly", (store) => store.get(key("offline_pack", identity)));
  if (!pack) {
    const legacy = localStorage.getItem(key("offline_pack", identity));
    if (legacy) {
      const legacyPack = JSON.parse(legacy) as OfflinePackData;
      if (legacyPack.store_id !== identity.store_id) throw new Error("Catalog belongs to another pharmacy.");
      // A concurrent tab may have installed a newer snapshot since our read.
      // Check and migrate in one serialized IndexedDB write transaction.
      const current = await catalogTransaction<OfflinePackData | undefined>("readwrite", (store) => {
        const request = store.get(key("offline_pack", identity));
        request.onsuccess = () => {
          if (!request.result) store.put(legacyPack, key("offline_pack", identity));
        };
        return request;
      });
      pack = current || legacyPack;
      localStorage.removeItem(key("offline_pack", identity));
    }
  }
  if (pack && pack.store_id !== identity.store_id) throw new Error("Catalog belongs to another pharmacy.");
  return pack || null;
}

export async function clearCachedPack(identity: OfflineIdentity): Promise<void> {
  await withLedgerLock(identity, async () => {
    await catalogTransaction("readwrite", (store) => store.delete(key("offline_pack", identity)));
    localStorage.removeItem(key("offline_pack", identity));
  });
}

export function catalogFromPack(pack: OfflinePackData, queue: QueuedSale[]): { medicines: Medicine[]; batches: BatchItem[] } {
  const reserved = new Map<number, number>();
  // Unresolved sales already left the counter, so reserve them locally until reconciled.
  for (const sale of queue) for (const item of sale.sale_data.items) {
    if (item.batch_id) reserved.set(item.batch_id, (reserved.get(item.batch_id) || 0) + item.quantity);
  }
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    medicines: pack.medicines.map((medicine) => ({
      ...medicine, store_id: pack.store_id, is_active: true,
      route: null, hsn_code: null, is_prescription_only: medicine.prescription_required,
    })),
    batches: pack.medicines.flatMap((medicine) => medicine.batches
      .filter((batch) => batch.expiry_date >= today)
      .map((batch) => ({
        ...batch, medicine_id: medicine.id, store_id: pack.store_id,
        total_available: Math.max(0, batch.quantity_available - (reserved.get(batch.id) || 0)), total_reserved: 0,
      }))),
  };
}

// Cache installation and reservation share one cross-tab lock. Hold it while
// downloading too: an older response must never overwrite a newer snapshot.
async function withLedgerLock<T>(identity: OfflineIdentity, action: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(key("offline_checkout", identity), action);
  }
  throw new Error("This browser does not support safe offline billing. Use a current browser with Web Locks support.");
}

export async function refreshOfflineCatalog(identity: OfflineIdentity, download: () => Promise<OfflinePackData>): Promise<void> {
  await withLedgerLock(identity, async () => {
    const acknowledged = getPendingQueue(identity).filter((item) => item.sync_status === "synced").map((item) => item.client_tx_id);
    const pack = await download();
    await saveCachedPack(identity, pack);
    clearSyncedQueue(identity, acknowledged);
  });
}

// Serialize stock reservation across tabs when the browser provides the Web Locks API.
export async function reserveOfflineSale(identity: OfflineIdentity, item: OfflineQueueItem): Promise<void> {
  const reserve = async () => {
    const pack = await getCachedPack(identity);
    if (!pack) throw new Error("Download a catalog before billing.");
    const catalog = catalogFromPack(pack, getPendingQueue(identity));
    const requested = new Map<number, number>();
    for (const line of item.sale_data.items) {
      if (!line.batch_id) throw new Error("Select a batch before offline billing.");
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("Sale quantities must be positive whole units.");
      requested.set(line.batch_id, (requested.get(line.batch_id) || 0) + line.quantity);
    }
    for (const [batchId, quantity] of requested) {
      const stock = catalog.batches.find((batch) => batch.id === batchId);
      if (!stock || stock.total_available < quantity) throw new Error("Stock changed. Refresh the cart before billing.");
    }
    enqueueOfflineSale(identity, item);
  };
  await withLedgerLock(identity, reserve);
}
