import type { BatchItem, Medicine } from './api';

/** Presentation filtering only; preserves catalog order and existing matching rules. */
export function filterPOSMedicines(medicines: Medicine[], query: string): Medicine[] {
  const trimmed = query.trim(); const q = trimmed.toLowerCase();
  if (!q) return medicines;
  return medicines.filter(medicine => medicine.brand_name.toLowerCase().includes(q) || medicine.barcodes?.some(code => code === trimmed) || !!medicine.generic_name?.toLowerCase().includes(q) || !!medicine.manufacturer?.toLowerCase().includes(q));
}
export function stockByMedicine(batches: BatchItem[]): Map<number, number> {
  const stock = new Map<number, number>();
  for (const batch of batches) stock.set(batch.medicine_id, (stock.get(batch.medicine_id) || 0) + (batch.total_available || 0));
  return stock;
}
