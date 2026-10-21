import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import ts from "typescript";
const source = new URL("../src/lib/barcode.ts", import.meta.url);
const loaded = new Module(source.pathname);
loaded._compile(ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, source.pathname);
const { findBarcodeMedicine } = loaded.exports;
const medicine = { id: 1, is_active: true, barcodes: ["0012345678905"] };

test("exact barcode lookup keeps leading zeros and strips scanner terminator", () => {
  assert.equal(findBarcodeMedicine([medicine], "0012345678905\r\n"), medicine);
  assert.throws(() => findBarcodeMedicine([medicine], "12345678905"));
});
test("unknown, inactive and ambiguous barcodes cannot add arbitrary medicines", () => {
  assert.throws(() => findBarcodeMedicine([medicine], "UNKNOWN"));
  assert.throws(() => findBarcodeMedicine([{ ...medicine, is_active: false }], "0012345678905"));
  assert.throws(() => findBarcodeMedicine([medicine, { ...medicine, id: 2 }], "0012345678905"));
});
