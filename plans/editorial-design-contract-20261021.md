# SmartPharm editorial direction

Purpose: pharmacy staff should identify stock, add a medicine and charge a bill quickly; owners should find stock risks and open their next task immediately.

Primary surfaces: dashboard, login, navigation, POS and the shared screen frame. Main actions retain existing routes and handlers. No medical data, prices, stock calculations, permissions or API requests are changed.

Direction: a contemporary dispensary. Warm neutral workspace, forest navigation, a lighter green active state, a clear typographic hierarchy and numbered workflow sections. The dashboard header replaces the existing header rather than adding a marketing section. Connected metrics reduce repeated card framing; the asymmetric desk groups the real activity chart and stock alerts.

Reference: https://www.awwwards.com/sites/vaara . The accessible Awwwards entry identifies typography, product listing/filtering and microinteractions as key elements and records a dark/warm-neutral palette. The broader e-commerce category timed out. This direction adapts that product-first emphasis to pharmacy work; it does not copy that site or claim a visual review of inaccessible pages.

Image: the existing demo Dolo-650 photo is copied unmodified into public/images/packaging-reference.jpg. Login explicitly labels it an example/reference. It is not presented as live store stock or a recognition result.

Viewports: 390x844 and 1366x768. The login brand panel is hidden below 900px to keep sign-in primary. Tables retain their horizontal scrolling and virtualization, and working screens remain static.

States: existing loading, empty, error/retry, partial-data, success and role boundaries are retained. Status text and medical warnings are unchanged. Actual rendered-state verification remains untested under the earlier no-browser instruction.

Checks: TypeScript, targeted ESLint, existing frontend regression tests and production build. Source-based contrast checks do not establish full accessibility or responsive layout compliance.

Results: production build, TypeScript, targeted lint and all 18 frontend tests passed. Solid color pair contrast ratios: rail primary 11.01:1, rail secondary 6.97:1, active navigation 9.89:1, login headline 10.52:1. These mathematical checks do not verify rendered contrasts or full accessibility.

The skill evidence checker was run. It correctly rejected the record because rendered viewport, interaction and state checks remain untested. No screenshots or passing visual evidence are claimed.
