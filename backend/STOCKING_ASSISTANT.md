# Reviewed stocking assistant

Open **Purchases & Invoices → Stock medicine from photo**. Upload/capture a packaging photo or paste packaging text. Correct the medicine search words before searching. The assistant shows your store catalog, 372,150 indexed source records, and relevant web search references. Sources can be opened and recorded for review. Imported records and search snippets are suggestions, not independently verified product identities.

Select an existing store medicine or review a source suggestion. Confirm the name, strength, manufacturer, dosage form and physical pack. Add its barcode if available, tick the physical verification checkbox and save. Existing identities are reused without silently overwriting them. New medicine creation and barcode assignment commit together; a barcode conflict rolls back the new identity.

Select **Use in purchase draft** and review supplier, invoice, batch, expiry, received units, purchase rate and MRP. Stock changes only after accepting the purchase. Sync POS afterward; barcode billing retrieves the saved identity and available batch/price locally, including offline. A scan adds one existing stock unit, without inferring box/strip conversions.

## Correction memory

Confirmed corrections are recorded in `data/stocking/references.sqlite3`, scoped to store and authenticated verifier. Repeating a query or the same normalized OCR text prioritizes the last confirmed active medicine. It still requires physical verification. Web results and unconfirmed guesses never enter correction memory. This is immediate retrieval learning, **not automatic neural-network retraining**. The approved text, query, medicine identity and source URLs are retained as an audit trail for a later evaluated training run. If memory saving fails, the response explicitly reports that the medicine was saved but learning was not.

The SQLite file must be backed up alongside your business database for correction history. Override its directory with `SMARTPHARM_STOCKING_DIR`. Build/rebuild the reference index without changing correction history:

```powershell
.\venv\Scripts\python.exe -m app.vision.stocking
```

## Web search

`TAVILY_API_KEY` selects Tavily ahead of other providers. Requests explicitly use basic search with automatic parameter upgrades disabled, five results, and no generated answers/raw content. Repeated queries reuse an in-process cache within the same clock hour (up to 128 entries), reducing credit usage. The key belongs only in the ignored backend `.env`. Changes require restarting an existing backend process. A live Parawel 650 lookup returned five relevant sources in about two seconds on this machine.

Only the editable product search words are sent; packaging images and full OCR text remain local. With `BRAVE_SEARCH_API_KEY`, the backend uses Brave's official web search endpoint. Without it, it attempts Bing's RSS search. Public search responses may be blocked or irrelevant: they are filtered, and a direct search link remains available. Unavailability never prevents local catalog/reference lookup or manual confirmation. No search snippets set batch, expiry, price or stock automatically. For predictable embedded search, configure your own Brave API key (provider charges may apply); do not expose it in frontend settings.

Endpoints: `POST /api/vision/stocking/read`, `/search`, `/confirm`. Owner, manager, pharmacist and inventory staff can read/search; owner, manager and pharmacist can confirm identity. No main-database schema migration is needed.
