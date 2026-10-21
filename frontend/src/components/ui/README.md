# UI foundation

Phase 1 supplies presentation components. Existing screens retain their business handlers; subsequent phases migrate them individually.

- `styles/tokens.css`: palette, spacing, typography, sizing and timing. Latin variable Manrope and JetBrains Mono are self-hosted with licenses in `public/fonts`.
- `styles/components.css`: component styles. Legacy global rules bridge existing screens temporarily; inline styles are removed when each screen migrates.
- `lib/animation-config.ts`: one motion configuration and device preference detection. No decorative animation runs in the foundation.
- `primitives.tsx`: buttons, labelled fields, badges, cards, quantity controls, search suggestions, filters, dates, batch selection and print wrappers. Callers retain medicine strings, validation and calculations.
- `DataTable.tsx`: TanStack Table v8 sorting and TanStack Virtual rendering above 50 rows. Supply stable row IDs and column definitions. Sorting is opt-in through column configuration; do not sort formatted currency strings.
- `overlays.tsx`: native modal with focus containment, confirmation, Vaul mobile sheet, cmdk palette and Sonner notifications. Route-specific hosts should load only where used. Existing receipt markup remains authoritative until the POS migration.
- `DensityToggle.tsx`: preference isolated by store and user. Mount in settings during screen migration.

## Performance and accessibility checklist

- [ ] Migrate POS without changing FEFO, stock reservations, GST, payments, offline queue or print handlers.
- [ ] Integrate density control and effects preference into settings.
- [ ] Keep search and barcode input responsive; measure INP under CPU throttling.
- [ ] Check virtual scrolling, sorting, keyboard access and screen-reader announcements using real inventory.
- [ ] Verify 360, 390, 768, 1024, 1366 and 1440 widths, touch targets and safe areas.
- [ ] Verify reduced motion and route-local lazy effects.
- [ ] Measure route gzip sizes, mobile Lighthouse, LCP and CLS in Phase 6; no scores claimed beforehand.
- [ ] Check receipt/A4 print preview and offline/error states after screen migration.

Library choices: existing Framer Motion stays available; TanStack provides tables and virtualization, cmdk provides keyboard command navigation, Sonner provides announced notifications, and Vaul provides accessible mobile sheets. No GSAP, 3D, chart or form packages are added in this phase.

## Phase 4

The remaining screens use route-specific `presentation.css` files, shared token values and responsive rules. Existing form handlers, validation, permissions and request payloads are retained. `VirtualTableBody` adapts existing tables above 50 rows, measures actual row heights and restores all loaded rows for printing. Tables without a scrolling container retain their original rendering.

Dialog focus containment, focus restoration, labelled fields, mobile navigation focus and a skip link support keyboard use. Custom not-found and retry screens cover route failures. Settings includes the user-specific density control.

Verification: production build and 18 frontend tests passed. Full app/component lint has no errors and 80 warnings, including unused declarations and existing hook dependency warnings. Browser layout, assistive technology and printer checks remain pending; performance measurement is Phase 6.

## Phase 5

Effects preferences are isolated by user/store and exposed in Settings. Automatic uses reduced effects for four-core/four-GB devices and Save-Data connections. System reduced motion always forces instant states, including when Full is selected.

Existing Framer Motion is loaded after paint for Full effects only, outside POS and inventory. It handles the masked login headline, dashboard card entry and chart transforms. Dashboard counts animate once without changing accessible values. Input interaction completes decorative motion immediately. Reduced keeps small press feedback; Off removes it. The theme switch no longer loads Framer Motion into working screens.

No GSAP, 3D, Lottie or additional effects packages were necessary. Static content remains visible if effects are disabled or JavaScript is unavailable. Visual, device and performance checks remain for Phase 6.

## Phase 6 audit

See `plans/ui-performance-audit-20261021.md` from the repository root for every route's measured initial JavaScript size and the remaining budget misses. Machine-readable results live under `data/ui-performance/`.

POS stock-display aggregation was benchmarked with 5,000 medicines / 20,000 batches: 685.461 ms legacy versus 0.772 ms optimized median on this machine. Search median was 0.461 ms. Matching and stock totals were compared against the original rules. These are Node measurements, not browser INP.

On-demand Copilot and drawer code, delayed large-table engine loading, cached catalog filtering, memoized visible rows and local font preloading reduce initial work. A dedicated POS virtual catalog avoids constructing the sortable table row model. Fast Enter resolves the current query immediately even while debounce is pending. Loaded inventory rows are restored for printing.

Build, TypeScript, targeted lint and 18 existing frontend tests pass. Strict total initial-JS budgets remain unmet on 15 app routes; both login routes meet their 170,000-byte budget. Lighthouse/INP/LCP/CLS, actual mobile layouts and printer behavior remain unverified. Do not describe the app as meeting those targets.
