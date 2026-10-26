# Camera and barcode input

POS now exposes **Camera scanner** in its toolbar and **Live camera** beside
medicine search. This is a real `getUserMedia` video viewfinder, not a file picker.
The camera starts only after a user click and permission. It prefers a rear camera,
offers device selection when multiple cameras are available and requests no audio.

ZXing's browser reader is imported only when starting the camera. Live barcode
decoding stays on the device and works without the platform-specific
`BarcodeDetector` API. Each scan resolves an exact active-store barcode through the
existing catalog and stock checks; only a successful match adds one unit. A failed
match pauses for an explicit retry. It does not infer a medicine from a random QR
verification URL or submit checkout.

Closing, navigating away, hiding the page, successfully adding a barcode, or
capturing a photo releases all camera tracks. A late permission result after close
is also stopped. Permission denial, no camera and a busy camera have separate
messages and alternatives. **Capture packaging photo** transfers a still image to
the existing SmartPharm recognition/review flow. A packaging upload and the existing
barcode-photo upload remain available.

USB/Bluetooth barcode readers must be configured as OS keyboard devices. Focus the
barcode field (F2), then scan with an Enter or Tab terminator. There is no claim of
browser-side Bluetooth pairing, serial-port access or support for proprietary
hardware protocols.

Verification: production build/type check, 28 frontend tests, ESLint with 0 errors
and 81 existing warnings. Headless Chrome used a Y4M video fixture displaying a real
demo barcode, exercising actual ZXing decoding, one-item duplicate protection,
Enter/Tab input, permission errors and late-stream cleanup. Photo capture was
checked with a test frame and mocked recognition response. No sale was submitted.
Detailed local/live browser results are in repository-root `output/camera/`.

Physical iOS/Android/desktop cameras, device switching and specific USB/Bluetooth
reader models still require hardware checks. Use the HTTPS app or localhost; a
`file://` scan-card document cannot run the app's camera workflow. The existing
dependency audit reports unrelated alerts in Next.js/transitive packages; none are
in the new ZXing decoder. Dependency upgrades are separate from this change.
