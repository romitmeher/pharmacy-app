# Main workflow function audit — 21 October 2026

Scope: source-level tracing of stocking, medicine catalog, POS, returns, settings and audit export; direct API checks without a browser. This is not a claim that every UI action or physical printer/device has been tested.

## State/side-effect map

- AuthContext login changes token/profile and account cache. Logout/session rejection clears identity. POS asserts the token before reservations and after delayed scans.
- offlineQueue keeps catalog and sales scoped to store/user. Reserving a sale and replacing a catalog share a cross-tab lock. Only server-acknowledged sales are removable. Unresolved bills continue reserving stock.
- POS image uploads replace recognition results; barcode-photo completion uses a callback refreshed with current cart/catalog state. Checkout reserves the durable bill before clearing cart/customer/discount fields. Cart additions, removal and quantity changes are now blocked during checkout.
- StockingAssistant clears old identity/verification/barcode fields on a new read, cancels stale web-result application by sequence, and saves only physically confirmed identities. Purchase stock changes remain a separate acceptance step.
- Settings stores terminal preferences locally. POS now reads those preferences on load, focus and storage changes. Tax visibility does not change tax calculation. Receipt auto-print is armed only for a newly confirmed checkout, not opening invoice history.
- Medicine editing updates the backend and both list/detail records. POS must synchronize to replace its cached medicine identity/price snapshot.

## Gaps fixed

1. Terminal preferences were saved but not consumed: connected receipt size, auto-print, barcode sound, GST visibility and the doctor-name preference.
2. Printing used the entire application page: added receipt-only print styling, A4/80 mm page sizing and confirmed-sale auto-print.
3. Medicine details had no edit action: added editable identity, manufacturer, dosage form, prices, GST and prescription flag using the existing update endpoint.
4. Returns rejected printed invoice numbers despite the search prompt: exact store-scoped invoice-number lookup now works alongside numeric sale IDs.
5. Scan verification fetched medicine IDs without store/active checks: added scope, role, whole quantity, date and saved-batch expiry checks.
6. The cart could change while a bill was being durably saved and then lose those changes during reset: blocked cart mutations while checkout is busy.
7. Tendered cash below the payable amount was ignored: reject explicit insufficient/invalid cash amounts before reserving a sale. Empty tender remains exact-cash shorthand.
8. Audit export labels implied the complete history while exporting the visible page: label now explicitly says visible logs.

## Verification

- All 31 selected static authenticated read endpoints returned successful responses against the demo dataset. Detailed statuses: `data/demo/function-audit-api.json`.
- Full backend suite: 304 passed, including return invoice references and scan verification isolation.
- Frontend: 18 tests passed, TypeScript passed. Lint reported pre-existing advisory warnings; no errors.
- Production build checked separately. Browser/device/physical-printer output not exercised.

## Still limited or not implemented

- Continuous live-video barcode detection: current camera flow captures/uploads a photo; USB readers remain supported.
- GS1 application-identifier parsing and automatic carton/strip/tablet conversions: current codes map to one existing stock unit and do not infer batch/expiry.
- Automatic neural model retraining from corrections: confirmed per-store retrieval memory is implemented; neural promotion needs independent evaluation.
- Distributor invoice file upload/OCR: the older distributor parser takes pasted extracted text. The stocking assistant reads individual packaging photos; it does not replace a full PDF/multi-page invoice OCR importer.
- Reliable web results require a configured provider; Tavily is configured locally, with basic search and a cache. Web snippets never certify medicine identity.
