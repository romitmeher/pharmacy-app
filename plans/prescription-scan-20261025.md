# Prescription recognition repair

The image scanner previously ran packaging OCR directly over handwriting, treated
unrelated text as medicine names, selected a first partial catalog match and
assigned a default dispensing quantity. The UI displayed an unqualified success
message and did not allow correction of extracted rows.

The user explicitly approved sending the supplied test prescription and enabling
Google Gemini handwriting recognition after being told images can contain patient
names and medical information. Printed/local OCR remains available without that
external transfer. The recognition mode and disclosure are visible before scanning.

Implemented:
- Structured handwriting reading with the configured Google AI key, tested using
  `gemini-3-flash-preview`. Portable provider schema with local Pydantic validation;
  no provider tool calls, Files API or persistent conversation.
- Do not expose/log provider error bodies or secrets. A provider outage returns
  a clear 503 and manual-entry option, without silently trusting printed OCR.
- Return medicine-row text only, excluding any extra clinic/patient header text
  the provider may have transcribed. All names and directions remain drafts.
- Do not automatically link image readings to stock, dispense, or infer quantities
  from schedules/circled numbers. No fabricated confidence percentages.
- Local shadow correction and spatial OCR line grouping; exclude headers/vitals,
  stop treating `OD` inside a brand name as a schedule, reject ambiguous catalog
  identities and exclude expired stock from text availability checks.
- Upload limits/validation, original-photo preview, editable names/directions,
  required explicit quantities, manual rows, parsing corrected text and prevention
  of changing the image mid-scan. Removed fabricated General Consultation item.

Verification:
- 340 backend tests passed; final focused prescription suite: 21 passed.
- 26 frontend tests passed, production build/type checks passed, ESLint had 0
  errors and the existing 81 warnings.
- Supplied image, local handwriting request: 4 rows, 2 uncertain names, ~33s.
  This is not a claim that the names are clinically correct.
- Live browser test on GCP: logged in, uploaded the supplied image, provider/API
  returned HTTP 200, four editable rows displayed, original image displayed,
  quantities blank and no automatic catalog IDs. No prescription archived or
  sale/stock operation performed. Report: `output/prescription/live-checks.json`.
- Published backend `smartpharm-api-00012-gum` and frontend
  `smartpharm-web-00005-s4r`. No Git commit.

Illegible handwriting still requires confirmation from a pharmacist/prescriber.
The vision model is configurable through `PRESCRIPTION_VISION_MODEL`; provider
availability, preview-model changes and quotas can affect latency/results.
Private images and raw recognition test data remain outside committed source.
