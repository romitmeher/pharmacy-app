# Packaging photo recognition — 26 October 2026

The user explicitly approved sending medicine packaging photos to the existing
Google Gemini connection in this chat. Only the uploaded image is sent; catalog,
stock, accounts and patient records are not included in the request.

## Change

- Barcode decoding and exact lookup still run first.
- Printed packages use configurable `PACKAGING_VISION_MODEL` (default
  `gemini-3.5-flash`), with low thinking, a 25-second deadline, one attempt and
  a constrained JSON transcription schema.
- Uncertain brands, ungrounded brand text and unsupported dose text are rejected.
- Existing store-specific catalog and conflicting-strength checks still apply.
  A catalog product with a strength cannot be accepted by the cloud path without
  a transcribed strength. No provider confidence percentage is invented.
- Accepted results always require pharmacist verification. Dates, MRP, batch,
  quantities and transactions are not derived from the generated transcription.
- Up to 32 validated text readings are cached in process memory for five minutes;
  matching and inventory are queried afresh. No photos or readings are persisted.
- Provider failures and quota errors fall back to existing local OCR, with a
  visible explanation. `PACKAGING_VISION_ENABLED=false` disables cloud reading.
- UI discloses Google processing and asks for printed name/composition side.

## Actual image checks before deployment

Selected model matched original labelled photos of Cyclomine (20 + 325 mg),
Nu Cat Kof (10 + 2 + 5 mg), Amlokind-AT (5 + 50 mg), Telmikind-H,
Cheston Cold, Multiprex and Candiforce-200. Reads took approximately 3–6 seconds
in these local provider checks. This is not a general accuracy benchmark.
Dromef's exact barcode route remains first and unchanged.

Unlabelled Amlokind and Telmikind blister fronts returned no identity. A third
negative check reached the provider's five-requests-per-minute free quota and
was not counted as a recognition result. The earlier preview model also reached
its daily free quota; the Flash Lite comparison was insufficiently reliable and
was not selected. Provider rate/availability limits still apply.

Validation: 363 backend tests passed before the final notice/cache changes;
48 focused scanner regressions passed after those changes. Frontend: 28 tests,
typecheck and lint passed. Local Turbopack worker failed to start; the supported
Webpack production build succeeded. Cloud production build and deployment
checks are recorded below when complete.

## Replacement credential

An earlier replacement credential returned HTTP 402 for depleted credits.
The user then supplied further replacements. Only the newest supplied key is
active: ignored `backend/.env` and GCP Secret Manager version 5. No key values are
included here. Billing was not changed and no key-rotation pool was implemented.

Final full suite: 363 passed in 58.81 seconds. Frontend cloud production build
succeeded (the ordinary Linux/Turbopack build), and preview `/pos` returned 200.

## Verified deployment

- Live API: `smartpharm-api-00023-mon`, 100% traffic, secret pinned to version 5.
- Live web: `smartpharm-web-00010-tub`, 100% traffic.
- Runtime model override: `PACKAGING_VISION_MODEL=gemini-3-flash-preview`, also
  applied to ignored local environment. The stable-model candidate timed out and
  was not promoted. The preview model succeeded with the newest supplied key.
- Exact candidate photo tests: Cyclomine correct with 20 mg + 325 mg in 7.35 s;
  Nu Cat Kof correct with 10 mg + 2 mg + 5 mg in 2.79 s. Both used Google package
  transcription and required human verification. Dromef's barcode 00235066
  correctly resolved in 0.97 s, without a Google request.
- Evidence: `output/packaging-rotation/google-candidate-probes.json`.
- After promotion, all 11 read-only public API checks passed, the catalog remained
  at eight active medicines, and public `/pos` returned HTTP 200.
- No commit or push. Free-tier provider quotas and temporary failures remain
  external constraints; no broad recognition accuracy claim is made.
