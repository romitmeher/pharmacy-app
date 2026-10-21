import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/posCatalog.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { filterPOSMedicines, stockByMedicine } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const medicines = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, brand_name: `Brand ${i + 1}`, generic_name: `Molecule ${i % 100}`, manufacturer: `Manufacturer ${i % 20}`, barcodes: [String(i + 1).padStart(13, '0')] }));
const batches = Array.from({ length: 20000 }, (_, i) => ({ medicine_id: i % 5000 + 1, total_available: i % 31 }));
function originalFilter(query) {
  return medicines.filter(m => { const q = query.toLowerCase().trim(); return !q || m.brand_name.toLowerCase().includes(q) || m.barcodes?.some(code => code === query.trim()) || m.generic_name?.toLowerCase().includes(q) || m.manufacturer?.toLowerCase().includes(q); });
}
for (const query of ['', 'Brand 777', ' molecule 1 ', '0000000000777', 'MANUFACTURER 2', 'no-match']) assert.deepEqual(filterPOSMedicines(medicines, query).map(m => m.id), originalFilter(query).map(m => m.id));
const legacy = () => medicines.map(m => batches.filter(b => b.medicine_id === m.id).reduce((sum, b) => sum + (b.total_available || 0), 0));
const optimized = () => { const stock = stockByMedicine(batches); return medicines.map(m => stock.get(m.id) || 0); };
assert.deepEqual(optimized(), legacy());
function medianMs(run, iterations) { const timings = []; for (let i = 0; i < iterations; i++) { const start = performance.now(); run(); timings.push(performance.now() - start); } return Number(timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)].toFixed(3)); }
const result = { medicines: medicines.length, batches: batches.length, stock_legacy_median_ms: medianMs(legacy, 3), stock_optimized_median_ms: medianMs(optimized, 9), search_median_ms: medianMs(() => filterPOSMedicines(medicines, 'Molecule 1'), 25), matching_rules_verified: true, stock_totals_verified: true, cpu: cpus()[0]?.model, note: 'Node-only synthetic data benchmark on this machine. It does not measure browser INP, rendering, LCP, CLS or an older PC.' };
const directory = new URL('../../data/ui-performance/', import.meta.url); await mkdir(directory, { recursive: true });
await writeFile(new URL('catalog-benchmark.json', directory), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
