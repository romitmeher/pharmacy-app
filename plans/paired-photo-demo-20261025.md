# Paired photo demo — 25 October 2026

Goal: label the user's eight explicitly paired medicine packages, train a separate demo classifier, and add matching isolated demo stock.

Labels: Telmikind-H, Amlokind-AT, Cyclomine, Cheston Cold, Dromef, Nu Cat Kof, Multiprex, Candiforce-200. The printed back supplies identity; front labels come from the user's explicit pairing. Unreadable strengths and manufacturer fields remain unset rather than guessed. No web enrichment was needed for these package labels.

Data contract: 16 original, unmodified photos, eight physical-package groups. Both sides belong to training. No independent validation/test packages exist; synthetic augmentation must not be described as independent evidence. SHA-256, original filename, side, label basis and package group are recorded in `data/demo/paired-20261025/annotations.json` (ignored local data).

Training: existing MobileNet V3 Small transfer-learning pipeline, seed 42, 100 epochs, batch size eight, zero loader workers, verified NVIDIA GeForce RTX 3070. Artifacts are isolated in `data/demo/paired-20261025/model`. The old model is preserved. Validation and test accuracy are null. Training-image recall was 16/16; this is a memorization/smoke check, not generalization accuracy. Runtime smoke check used CPU; cold model load took 7.318 seconds on this computer.

Serving: only the local demo selects this model. After the scanning repair, demo mode can also offer a separate review suggestion when the model's first choice agrees with a labelled reference through at least 30 ORB ratio-test matches and 25 geometric inliers. Model probability must exceed 0.80 with a 0.50 margin; these are conservative demo gates, not calibrated clinical confidence. A known mapped barcode takes precedence. Suggestions have no verified match candidate, remain low-confidence and require catalog review; they cannot auto-add a medicine to a bill. Normal mode does not enable this path. Unsupported QR payload formats no longer prevent normal photo OCR; barcode-only input validation remains strict. Restart demo backend to load the new configuration.

Stock: eight medicines, two fictional batches and 60 strips per medicine (480 strips in total). Demo prices, dates, quantities and internal EAN-13 codes are fictional, not copied manufacturer stock facts. A SQLite backup is saved before the first seed. Seeding is idempotent and preserves existing stock, transactions and credentials. There are now 25 demo medicines and 66 batches. The dedicated paired scan-card page includes both original sides and an internal barcode for each medicine.

Checks: all 25 real barcode PNGs resolve to the expected demo medicines; checkout passes in a disposable database clone; 35 related backend tests pass. Detailed local results are saved alongside the model and demo dataset. No browser testing was performed.

Full scan API check on the eight printed backs: Telmikind-H, Cheston Cold, Multiprex and Candiforce-200 identified correctly; Amlokind-AT rejected (HTTP 422); Cyclomine, Dromef and Nu Cat Kof abstained. No wrong medicine candidate was returned in this check. These are package-training photos, not independent evaluation. First scan took 35.46 seconds including initialization; subsequent scans ranged from 0.06 to 16.17 seconds. Do not claim all photo scans work or are fast. The exact demo barcodes are the verified presentation path.

Scanning repair check: all 16 supplied photos return the expected **review suggestion**, with no verified billing candidate and mandatory human review. First model load took 3.872 seconds; subsequent supplied-photo requests took approximately 0.06-0.08 seconds. Ten unrelated images (eight other medicine packages, a blank image and deterministic noise) were rejected by the demo suggestion path. These are limited regression results, not evidence of accuracy on unseen medicines or camera captures. All 25 barcode images and disposable checkout pass after the repair. Frontend type checking, targeted lint and all 18 frontend tests pass.

Reproduce preparation:

```powershell
backend/venv/Scripts/python.exe backend/scripts/prepare_paired_demo.py 'C:\Users\user\Downloads\WhatsApp Unknown 2026-10-25 at 1.42.21 PM'
```

Train into a new output directory to preserve existing weights:

```powershell
backend/.venv-training/Scripts/python.exe backend/scripts/train_medicine_classifier.py --root data/demo/paired-20261025 --output data/demo/paired-20261025/model-new --epochs 100 --batch-size 8 --workers 0
```

Next experiment: collect independently photographed packages for each class, reserve entire packages for holdout, and include unknown medicines and lookalike strips. Reject wrong identity; abstention/manual search is acceptable. Rollback: remove the demo model directory selection to return to the previous default supporting model; use the pre-seed SQLite backup only if explicitly choosing to revert all subsequent demo transactions.
