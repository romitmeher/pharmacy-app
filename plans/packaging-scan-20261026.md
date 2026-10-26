# Packaging scan repair

Scope: the unresolved sideways Amlokind-AT photograph in the POS scanner.

- Rejected OCR matches retry at right angles; accepted upright reads stop after
  one pass. Identity thresholds, strength guards and human verification remain.
- Preserve OCR boxes in the original image coordinates after resize/rotation.
- Read explicitly printed combination doses from a composition heading, rather
  than comparing only the first ingredient against a combination medicine.
- Ignore numeric suffixes inside slash-delimited licence identifiers. The cloud
  sample contained `M00/5093G`, previously misread as an extra 5093 gram dose.
- Permit ingredient order differences only for explicit combinations whose
  component doses use the same unit. Conflicting or missing components reject.
- Photo feedback describes basic image checks, not guaranteed text readability.

Verification: focused scanner/prescription/invoice checks 53 passed; final full
backend suite 350 passed; frontend 28 tests, build/type check and lint with zero
errors passed. Eleven read-only live API checks passed; active catalog remains
eight medicines. No bills, stock, prescriptions or credentials changed.

The first candidate rejected the real photo; live API traffic was not promoted.
The captured cloud text now matches locally after excluding the licence code.
Final candidate and deployment results are recorded below once verified.

The cloud CPU acceleration path produced inconsistent OCR on repeated rotated
inputs. With `OCR_ENABLE_MKLDNN=false`, candidate `smartpharm-api-00019-wup`
correctly recognised the original Amlokind-AT photograph at 270 degrees with
the explicit `5 mg + 50 mg` formulation. The initial cold request took 41.01s;
do not claim instant photo recognition. Runtime override is set on the candidate,
and the Docker default is aligned for future builds. Frontend `00009-7z7` is live.

No claim of physical camera testing, general recognition accuracy, model
retraining or automatic medicine verification. No Git commit.

Final regression: 351 backend tests passed, 28 frontend tests passed, production
frontend build/typecheck and lint with zero errors passed. Eleven main workflow
API reads returned 200 without business writes. Original-photo candidate check
accepted Telmikind-H, Amlokind-AT, Cheston Cold, Multiprex and Candiforce-200.
Cyclomine and Nu Cat Kof remain safely rejected because complete combination
doses were unreadable; use mapped barcodes/manual catalogue review for these.
Do not describe this as all-image accuracy or universal photo recognition.

The supplied Dromef photograph visibly contains store sticker barcode `00235066`.
It was decoded from the original photo, linked through the authorised barcode API
to the existing paired-demo Dromef record, and exact lookup verified. No stock
or price was changed. This is an additional store-scoped alias, not a global GTIN.

Published API revision `smartpharm-api-00019-wup` at 100% traffic, using the v3
image with runtime `OCR_ENABLE_MKLDNN=false`; frontend `smartpharm-web-00009-7z7`.
Dromef original-photo recheck passed through exact barcode in 1.09 seconds.
