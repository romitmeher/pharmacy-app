# Photo recognition improvement — 21 October 2026

## Changes

- Preserve per-line OCR confidence rather than assigning every line the whole-page average.
- Prioritize compact product-name/dose lines and adjacent split lines over addresses, warning text and manufacturer headings. Search up to 20 meaningful OCR candidates instead of dropping names below the first five lines.
- Normalize punctuation, spacing, dosage-form words and numeric unit suffixes when comparing medicine brand names. Retrieve brand/alias identities before generic names that can crowd out the correct SKU.
- Support low printed strengths (including 5, 20 and 40), hyphenated brands and split brand/dose text.
- Ignore dosage-warning quantities when extracting product strength. Mark name-derived amounts as inferred, give them less weight than explicitly read strength units, and show the inference warning in POS.
- Recognize a verified combination brand's printed total only as review evidence, with same-unit, additive component checks. Explicit conflicting strengths/units still reject the candidate.
- Close-scoring catalog variants remain unresolved instead of selecting an arbitrary pack.
- Upscale small readable photos for OCR; original-image quality still gates recognition. Sharp images down to a 160 px short side and at least 30,000 pixels can be attempted, rather than rejecting every image under 200 px.
- Demo backend warms the OCR engine in a background thread. It does not preload answers or pre-scan demo images.

## Measured regression results

Same 17 demo photos and expected catalog medicine IDs:

| Result | Before | After |
|---|---:|---:|
| Correct catalog match | 5 | 16 |
| Wrong catalog match | 0 | 0 |
| Unresolved | 12 | 1 |

The remaining failure is Telma 40's patterned foil photograph. It is left unresolved. Warm median scan time was 1.975 seconds; individual images took longer, and the cold first scan took 8.37 seconds in that benchmark. Full results: `data/demo/photo-baseline.json` and `data/demo/photo-final.json`.

The three user-supplied screenshots (Parawel 650, Calpol 650, P-650) also matched the expected medicine in isolated API tests with those records present, alongside negative/conflicting medicines. Reports: `data/medicine_photos/user-parawel-fixed.json`, `user-calpol-fixed.json`, `user-p650-fixed.json`. These tests do not add those medicines to the user's business store.

This is a regression set used during debugging, not an independent or representative clinical accuracy evaluation. Downloaded reference photos may overlap classifier training data. The experimental neural classifier remains supporting evidence only; OCR/catalog matching controls the proposed identity. Human verification, correct catalog records and barcode confirmation remain necessary for billing. No universal recognition accuracy is claimed.
