# Barcode billing

1. Open **Medicines Catalog**, open the medicine details, and find **Product barcodes**.
2. Check the medicine, strength and pack. Scan/type its printed barcode and select **Link barcode**. Multiple codes can belong to one medicine; a code cannot belong to different medicines in the same store.
3. In **POS Billing**, select **Sync now** to refresh the local stock catalog.
4. Click the barcode input. Scan with a USB/Bluetooth reader configured as a keyboard with an **Enter** suffix, or type the barcode and press Enter.

Each scan adds **one existing stock unit** using the earliest available unexpired batch. Confirm the billed quantity when scanning a box or strip: this feature does not infer pack conversion or batch information from the barcode. Unknown, ambiguous, inactive or unavailable products do not add another medicine as a fallback.

Scanning uses exact string lookup in the cached store catalog and works offline after synchronization. Leading zeros are preserved. Camera photo recognition remains available separately. This version accepts plain linear barcode values (4–64 printable characters); it does not parse GS1 application identifiers or medicine QR payloads.

Mappings use existing `medicine_aliases` rows with `alias_type=barcode`; no schema migration is needed. Management endpoints require owner, manager or pharmacist access. Ordinary alias replacement preserves these mappings. Changes are serialized by a store-row lock on databases that support row locking.

API: authenticated `GET /api/medicines/barcode?code=...`, and `POST`/`DELETE /api/medicines/<id>/barcodes` with JSON `{ "barcode": "0012345678905" }`.
