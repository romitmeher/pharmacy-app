import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import ts from "typescript";
const source = new URL("../src/lib/posPreferences.ts", import.meta.url);
const loaded = new Module(source.pathname);
loaded._compile(ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, source.pathname);
const { readPosPreferences, defaultPosPreferences } = loaded.exports;
test("POS uses saved receipt, printing, doctor, beep and tax preferences", () => {
  const values = { sp_pos_receipt_size: "a4", sp_pos_auto_print: "false", sp_pos_require_sch_h: "false",
    sp_pos_barcode_beep: "false", sp_pos_show_gst: "false" };
  assert.deepEqual(readPosPreferences({ getItem: key => values[key] ?? null }), {
    receiptSize: "a4", autoPrint: false, requireDoctor: false, barcodeBeep: false, showGst: false,
  });
});
test("missing or unavailable storage preserves POS defaults", () => {
  assert.deepEqual(readPosPreferences({ getItem: () => null }), defaultPosPreferences);
  assert.deepEqual(readPosPreferences({ getItem: () => { throw new Error("Storage blocked"); } }), defaultPosPreferences);
});
