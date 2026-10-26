# Invoice scan repair — 25 October 2026

Problem: both supplied sideways invoice photos previously returned HTTP 201 with zero rows and a zero total, creating empty drafts. OCR polygon arrays were discarded, and a flat text parser could not recover invoice columns.

Changes:

- Preserve PaddleOCR recognized polygons, including individual NumPy arrays.
- Try invoice orientations and reconstruct rows using detected headers and separate, ordered currency and batch/expiry columns. Reject incomplete column alignment instead of attaching another row's numbers.
- Read printed invoice totals and separated header values spatially. Do not hard-code bill totals, product names or supplier layouts.
- Photo scans return a review preview with no supplier, purchase or inventory writes. Unreadable quantities remain zero; unclear expiry and MRP values require manual entry. No substitute expiry date is invented. Future expiries through the supported date range normalize to calendar month end.
- The Purchases dialog now accepts a photo/PDF upload as well as pasted text. It shows the extracted rows, printed total and review notice. Users can populate the existing draft editor, select each exact catalog medicine, correct the OCR fields and save explicitly. Stock booking remains a separate acceptance step.
- Empty extraction returns HTTP 422 rather than false success. Invalid images and oversized uploads are rejected.

Observed results on the original supplied JPEG uploads through the API, using a disposable SQLite clone:

| Photo | Before | After |
| --- | --- | --- |
| 1.41.22 PM | zero items, zero total | 15 review rows; printed total INR 4,802.00; 38.63 seconds |
| 1.41.23 PM | zero items, zero total | 13 review rows; printed total INR 1,720.00; 41.75 seconds |

These results validate row counts and printed totals, not every OCR character or numeric field. Some names remain misspelled, handwritten quantities were not readable, and some expiry fields require correction. These photographs do not support claims of automatic invoice accuracy or fast camera scanning. Original files and detailed reports stay under ignored local data; no private invoice image is included in regression tests.

Validation: full backend suite passed 318 tests before the final additional preview test; all five final invoice regression tests pass. Frontend type checking and all 18 frontend tests pass. Targeted lint has no errors and reports existing Purchases warnings. No browser or physical camera tests were run. The local demo backend was restarted on its existing port.
