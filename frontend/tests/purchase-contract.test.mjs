import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

test("purchase acceptance maps reviewed quantities and shelf to backend contract", async () => {
  const source = fileURLToPath(new URL("../src/lib/api.ts", import.meta.url));
  const loaded = new Module(source);
  loaded._compile(ts.transpileModule(fs.readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, source);
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, ...options };
    return { ok: true, json: async () => ({ invoice: { id: 12 } }) };
  };
  try {
    await loaded.exports.acceptPurchaseInvoice(12, {
      location_id: 8,
      received_items: [{ item_id: 5, received_quantity: 3, batch_number: "ACTUAL", expiry_date: "2027-01-01" }],
    });
    assert.match(request.url, /\/api\/purchases\/12\/accept$/);
    assert.deepEqual(JSON.parse(request.body), {
      default_location_id: 8,
      items: [{ item_id: 5, received_quantity: 3, batch_number: "ACTUAL", expiry_date: "2027-01-01" }],
    });
  } finally { globalThis.fetch = originalFetch; }
});
