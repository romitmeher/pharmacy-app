import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sourcePath = path.resolve(__dirname, "../src/lib/offlineQueue.ts");
const loaded = new Module(sourcePath);
loaded._compile(ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, sourcePath);
const ledger = loaded.exports;

class Storage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
const owner = { id: 7, store_id: 1 };
const colleague = { id: 8, store_id: 1 };
const branch = { id: 7, store_id: 2 };
const transaction = (id = "sale-a", quantity = 2) => ({
  client_tx_id: id, client_timestamp: "2026-10-21T10:00:00Z", tx_type: "OFFLINE_SALE",
  sale_data: { items: [{ medicine_id: 1, batch_id: 10, quantity }], payments: [{ payment_method: "cash", amount: 20 }], discount_amount: 3 },
});
const pack = {
  store_id: 1, store_name: "Test", generated_at: "2026-10-21T00:00:00Z", version_hash: "test",
  medicines: [{ id: 1, brand_name: "Test medicine", prescription_required: true,
    batches: [{ id: 10, batch_number: "A", expiry_date: "2099-12-31", quantity_available: 5 },
      { id: 11, batch_number: "Expired", expiry_date: "2000-01-01", quantity_available: 100 }] }],
};
test.beforeEach(() => { global.localStorage = new Storage(); global.indexedDB = new IDBFactory(); });

test("queues and catalog snapshots are isolated by both user and store", async () => {
  ledger.enqueueOfflineSale(owner, transaction());
  await ledger.saveCachedPack(owner, pack);
  assert.equal(ledger.getPendingQueue(owner).length, 1);
  assert.equal(ledger.getPendingQueue(colleague).length, 0);
  assert.equal(ledger.getPendingQueue(branch).length, 0);
  assert.equal(await ledger.getCachedPack(colleague), null);
  await assert.rejects(() => ledger.saveCachedPack(branch, pack), /another pharmacy/);
});

test("same UUID is immutable and separate sales survive concurrent result updates", () => {
  ledger.enqueueOfflineSale(owner, transaction());
  ledger.enqueueOfflineSale(owner, transaction("sale-a", 99));
  ledger.enqueueOfflineSale(owner, transaction("sale-b"));
  ledger.recordSyncResults(owner, [{ client_tx_id: "sale-a", status: "synced" }]);
  assert.equal(ledger.getPendingQueue(owner)[0].sale_data.items[0].quantity, 2);
  assert.equal(ledger.getPendingQueue(owner)[0].sale_data.discount_amount, 3);
  assert.equal(ledger.getPendingQueue(owner).length, 2);
});

test("only confirmed sales are removable, preserving failures and conflicts", () => {
  for (const id of ["success", "conflict", "failed", "pending"]) ledger.enqueueOfflineSale(owner, transaction(id));
  ledger.recordSyncResults(owner, [
    { client_tx_id: "success", status: "already_synced" },
    { client_tx_id: "conflict", status: "conflict", conflict_reason: "Stock deficit" },
    { client_tx_id: "failed", status: "failed", error: "Temporary failure" },
  ]);
  ledger.clearSyncedQueue(owner, ["success"]);
  const remaining = ledger.getPendingQueue(owner);
  assert.deepEqual(new Set(remaining.map((item) => item.client_tx_id)), new Set(["conflict", "failed", "pending"]));
  assert.equal(remaining.find((item) => item.client_tx_id === "conflict").sync_message, "Stock deficit");
});

test("pending physical sales reduce cached stock and expired batches cannot be sold", () => {
  ledger.enqueueOfflineSale(owner, transaction());
  const catalog = ledger.catalogFromPack(pack, ledger.getPendingQueue(owner));
  assert.equal(catalog.batches.length, 1);
  assert.equal(catalog.batches[0].total_available, 3);
  assert.equal(catalog.medicines[0].is_prescription_only, true);
});

test("storage failures propagate so checkout cannot discard an unsaved cart", () => {
  localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.throws(() => ledger.enqueueOfflineSale(owner, transaction()), /Quota exceeded/);
});

test("malformed local ledger data blocks checkout instead of silently dropping records", () => {
  ledger.enqueueOfflineSale(owner, transaction());
  const key = localStorage.key(0);
  localStorage.setItem(key, "{broken");
  assert.throws(() => ledger.getPendingQueue(owner));
});

test("cross-tab reservation validates aggregate stock before persisting competing sales", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(global, "navigator");
  let previous = Promise.resolve();
  Object.defineProperty(global, "navigator", { configurable: true, value: {
    locks: { request: (_key, callback) => {
      const next = previous.then(callback);
      previous = next.catch(() => {});
      return next;
    } },
  } });
  try {
    await ledger.saveCachedPack(owner, pack);
    const outcomes = await Promise.allSettled([
      ledger.reserveOfflineSale(owner, transaction("terminal-a", 3)),
      ledger.reserveOfflineSale(owner, transaction("terminal-b", 3)),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(ledger.getPendingQueue(owner).length, 1);
    assert.equal(ledger.catalogFromPack(pack, ledger.getPendingQueue(owner)).batches[0].total_available, 2);
    await assert.rejects(() => ledger.reserveOfflineSale(owner, transaction("invalid", -1)), /positive whole/);
  } finally {
    if (descriptor) Object.defineProperty(global, "navigator", descriptor);
    else delete global.navigator;
  }
});

test("a refresh only removes sales acknowledged before the server snapshot was requested", () => {
  ledger.enqueueOfflineSale(owner, transaction("earlier"));
  ledger.recordSyncResults(owner, [{ client_tx_id: "earlier", status: "synced" }]);
  const acknowledgedBeforeRequest = ["earlier"];
  ledger.enqueueOfflineSale(owner, transaction("later"));
  ledger.recordSyncResults(owner, [{ client_tx_id: "later", status: "synced" }]);
  ledger.clearSyncedQueue(owner, acknowledgedBeforeRequest);
  assert.equal(ledger.getPendingQueue(owner).length, 1);
  assert.equal(ledger.getPendingQueue(owner)[0].client_tx_id, "later");
});

test("delayed catalog responses and checkout share the same cross-tab lock", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(global, "navigator");
  const pending = new Map();
  Object.defineProperty(global, "navigator", { configurable: true, value: {
    locks: { request: (key, callback) => {
      const next = (pending.get(key) || Promise.resolve()).then(callback);
      pending.set(key, next.catch(() => {}));
      return next;
    } },
  } });
  try {
    let releaseOld;
    const oldResponse = new Promise((resolve) => { releaseOld = resolve; });
    const oldPack = structuredClone(pack);
    oldPack.medicines[0].batches[0].quantity_available = 10;
    const latestPack = structuredClone(oldPack);
    latestPack.medicines[0].batches[0].quantity_available = 9;
    const events = [];
    const oldRefresh = ledger.refreshOfflineCatalog(owner, async () => {
      events.push("old-request");
      return oldResponse;
    });
    const latestRefresh = ledger.refreshOfflineCatalog(owner, async () => {
      events.push("latest-request");
      return latestPack;
    });
    await Promise.resolve();
    assert.deepEqual(events, ["old-request"]);
    releaseOld(oldPack);
    await Promise.all([oldRefresh, latestRefresh]);
    assert.equal((await ledger.getCachedPack(owner)).medicines[0].batches[0].quantity_available, 9);
    await assert.rejects(() => ledger.reserveOfflineSale(owner, transaction("oversell", 10)), /Stock changed/);
    assert.equal(pending.size, 1, "refresh and reservation must use the same lock name");
  } finally {
    if (descriptor) Object.defineProperty(global, "navigator", descriptor);
    else delete global.navigator;
  }
});

test("catalogs larger than localStorage quota persist without touching saved bills", async () => {
  ledger.enqueueOfflineSale(owner, transaction("keep-this-sale"));
  const write = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key, value) => {
    if (String(value).length > 1024) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    write(key, value);
  };
  const large = structuredClone(pack);
  large.medicines[0].manufacturer = "M".repeat(6 * 1024 * 1024);
  await ledger.saveCachedPack(owner, large);
  const restored = await ledger.getCachedPack(owner);
  assert.equal(restored.medicines[0].manufacturer.length, 6 * 1024 * 1024);
  assert.equal(ledger.getPendingQueue(owner)[0].client_tx_id, "keep-this-sale");
  assert.equal(localStorage.getItem("smartpharm_offline_pack_v2:1:7"), null);
});

test("legacy catalog migrates only after its IndexedDB commit", async () => {
  const legacyKey = "smartpharm_offline_pack_v2:1:7";
  localStorage.setItem(legacyKey, JSON.stringify(pack));
  ledger.enqueueOfflineSale(owner, transaction());
  assert.deepEqual(await ledger.getCachedPack(owner), pack);
  assert.equal(localStorage.getItem(legacyKey), null);
  assert.deepEqual(await ledger.getCachedPack(owner), pack);
  assert.equal(ledger.getPendingQueue(owner).length, 1);
});

test("failed catalog commit preserves old snapshot and acknowledged sale ledger", async () => {
  await ledger.saveCachedPack(owner, pack);
  ledger.enqueueOfflineSale(owner, transaction());
  ledger.recordSyncResults(owner, [{ client_tx_id: "sale-a", status: "synced" }]);
  const originalPut = IDBObjectStore.prototype.put;
  const descriptor = Object.getOwnPropertyDescriptor(global, "navigator");
  Object.defineProperty(global, "navigator", { configurable: true, value: {
    locks: { request: (_key, callback) => Promise.resolve().then(callback) },
  } });
  IDBObjectStore.prototype.put = function (...args) {
    const request = originalPut.apply(this, args);
    this.transaction.abort();
    return request;
  };
  try {
    const changed = { ...pack, version_hash: "must-not-commit" };
    await assert.rejects(() => ledger.refreshOfflineCatalog(owner, async () => changed), /catalog/);
    assert.equal((await ledger.getCachedPack(owner)).version_hash, "test");
    assert.equal(ledger.getPendingQueue(owner)[0].sync_status, "synced");
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    if (descriptor) Object.defineProperty(global, "navigator", descriptor);
    else delete global.navigator;
  }
});

test("clearing catalog preserves all sales, login and other accounts' catalogs", async () => {
  await ledger.saveCachedPack(owner, pack);
  await ledger.saveCachedPack(colleague, pack);
  ledger.enqueueOfflineSale(owner, transaction());
  localStorage.setItem("smartpharm_jwt_token", "session-to-preserve");
  const descriptor = Object.getOwnPropertyDescriptor(global, "navigator");
  Object.defineProperty(global, "navigator", { configurable: true, value: {
    locks: { request: (_key, callback) => Promise.resolve().then(callback) },
  } });
  try {
    await ledger.clearCachedPack(owner);
    assert.equal(await ledger.getCachedPack(owner), null);
    assert.deepEqual(await ledger.getCachedPack(colleague), pack);
    assert.equal(ledger.getPendingQueue(owner).length, 1);
    assert.equal(localStorage.getItem("smartpharm_jwt_token"), "session-to-preserve");
  } finally {
    if (descriptor) Object.defineProperty(global, "navigator", descriptor);
    else delete global.navigator;
  }
});
