/**
 * SmartPharm Client-Side Offline Queue & Cache Manager
 * Implements PRD Rule 24:
 * Local Store (POS Terminal) -> Local Sync Queue -> Cloud Backend -> Central Database
 */

import { OfflinePackData, OfflineQueueItem } from "./api";

const OFFLINE_QUEUE_KEY = "smartpharm_offline_queue";
const OFFLINE_PACK_KEY = "smartpharm_offline_pack";

export function getPendingQueue(): OfflineQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read offline queue:", err);
    return [];
  }
}

export function enqueueOfflineSale(item: OfflineQueueItem): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getPendingQueue();
    queue.push(item);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("Failed to enqueue offline sale:", err);
  }
}

export function removeQueueItem(clientTxId: string): void {
  if (typeof window === "undefined") return;
  try {
    const queue = getPendingQueue().filter((item) => item.client_tx_id !== clientTxId);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("Failed to remove item from offline queue:", err);
  }
}

export function clearSyncedQueue(syncedTxIds: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const set = new Set(syncedTxIds);
    const queue = getPendingQueue().filter((item) => !set.has(item.client_tx_id));
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("Failed to clear synced queue:", err);
  }
}

export function saveCachedPack(pack: OfflinePackData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OFFLINE_PACK_KEY, JSON.stringify(pack));
  } catch (err) {
    console.error("Failed to cache offline pack:", err);
  }
}

export function getCachedPack(): OfflinePackData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFFLINE_PACK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to read cached offline pack:", err);
    return null;
  }
}

export function searchCachedMedicines(query: string) {
  const pack = getCachedPack();
  if (!pack || !pack.medicines) return [];
  if (!query || query.trim().length === 0) return pack.medicines.slice(0, 20);

  const q = query.toLowerCase().trim();
  return pack.medicines.filter(
    (m) =>
      m.brand_name.toLowerCase().includes(q) ||
      m.generic_name.toLowerCase().includes(q) ||
      m.manufacturer.toLowerCase().includes(q)
  );
}
