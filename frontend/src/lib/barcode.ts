import type { Medicine } from "./api";

export function findBarcodeMedicine(medicines: Medicine[], raw: string): Medicine {
  const code = raw.trim();
  if (!/^[!-~]{4,64}$/.test(code)) throw new Error("Scan or enter a valid barcode (4–64 characters).");
  const matches = medicines.filter(m => m.is_active && m.barcodes?.includes(code));
  if (matches.length > 1) throw new Error("Barcode has multiple matches. Correct its mapping in Medicines Catalog.");
  if (!matches.length) throw new Error("Barcode not found in available stock. Link it in Medicines Catalog, then sync the POS catalog.");
  return matches[0];
}
