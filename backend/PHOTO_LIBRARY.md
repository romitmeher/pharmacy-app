# Indian medicine photo reference library

The collector uses every HTTPS image URL in the project's two existing datasets:

- `data/India Medicines and Drug Info Dataset.csv`: `Medicine Name` + `Image URL`.
- `data/medicines.csv`: `med_name` + each URL in `img_urls`.

It deduplicates URLs and downloaded image content, retains medicine labels and source URLs, verifies image decoding/dimensions, stores images locally, and builds 512-dimensional reference features. Data stays under `data/medicine_photos`, outside version control and outside the pharmacy business database.

From the `backend` directory:

```powershell
.\venv\Scripts\python.exe -m app.vision.photo_library prepare
.\venv\Scripts\python.exe -m app.vision.photo_library download
.\venv\Scripts\python.exe -m app.vision.photo_library status
```

Downloads resume from pending records. `--limit 100` processes a bounded sample; the default processes all remaining links. Downloads default to 12 simultaneous requests (configurable with --workers, capped at 32), with no fixed pause between batches. OpenCV uses one thread per image job to avoid competing thread pools. Broken images are recorded as failed; denied/rate-limited requests stop the run without bypassing the source. The collector stops before disk free space falls below 10 GB. Inspect `library.sqlite3` for individual errors; do not keep retrying denied sources automatically.

The running app reads completed reference features after backend restart. It looks up photos only for an already grounded OCR/catalog candidate, using the full medicine name/strength. Photos with conflicting labels or content shared between different medicine identities are excluded from matching evidence. Photo similarity does not override OCR or increase medicine confidence.

This is a reference-image index, **not** retraining of PaddleOCR or a clinically validated medicine classifier. Dataset links are not an exhaustive list of all Indian medicines; some links are stale. Source attribution is retained in the library; downloading does not grant additional rights over source images. A true learned classifier needs verified labels, suitable training hardware, separate train/validation/test sets and measured recognition accuracy.

## Experimental GPU training

A separate `.venv-training` environment keeps CUDA PyTorch separate from the running Flask/Paddle environment. The training script uses ImageNet-pretrained MobileNet V3 Small, retrains its classifier and last feature stage, and uses CUDA mixed precision. NVIDIA RTX 3070 (8 GB) was detected on this machine; the original application environment contains CPU-only PyTorch.

```powershell
.\.venv-training\Scripts\python.exe scripts/train_medicine_classifier.py --epochs 12 --batch-size 24
```

Artifacts go to `data/medicine_photos/training/mobilenet-v3-small`: `classifier.pt`, `labels.json`, `split.json` and live `report.json`. Choose a new `--output` directory for another run; existing model weights are preserved. The script snapshots downloaded, content-deduplicated, unambiguously labelled images at startup; later downloads belong to a future run.

Classes with fewer than five distinct photos stay in training only. Other classes have separate validation and test photographs selected **before augmentation**. No test accuracy is invented when no test set is possible. Source-provided labels still require verification. All resulting models remain experimental with `deployment_enabled=false`; training does not silently replace the live OCR or billing matcher.



The scan pipeline loads the completed model from data/medicine_photos/training/full-20261021 (override SMARTPHARM_PHOTO_MODEL with a model directory). It reports agreement with an already grounded OCR/database candidate; it never changes confidence or enables classifier-only dispensing. Weights load once per backend process. Inference uses CUDA when available in the application environment, otherwise CPU. The first load is slower; subsequent checks reuse the model. Missing optional dependencies or weights leave OCR operational.
