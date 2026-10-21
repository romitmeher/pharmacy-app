# UI performance audit

Sum of individually gzipped built HTML script/style references, gzip level 9. Initial JS includes Next/React runtime; modern-browser totals exclude noModule polyfills. Deferred interactions/effects and route prefetches are additional downloads. This is artifact sizing, not network or browser timing.

Budget interpretation: 150,000 bytes for app routes; 170,000 bytes for login. KiB below means 1,024 bytes.

| Route | Baseline KiB | Final KiB | Budget |
| --- | ---: | ---: | --- |
| `/audit` | 168.3 | 156.9 | Over |
| `/branches` | 166.5 | 154.9 | Over |
| `/expenses` | 165.3 | 153.9 | Over |
| `/expiry` | 166.1 | 154.6 | Over |
| `/` | 156.1 | 154.7 | Over |
| `/inventory` | 211.0 | 181.8 | Over |
| `/login/setup` | 153.5 | 148.4 | Within |
| `/login` | 154.3 | 149.2 | Within |
| `/medicines` | 168.0 | 156.6 | Over |
| `/pos` | 195.1 | 181.2 | Over |
| `/prescriptions` | 167.0 | 155.7 | Over |
| `/purchases` | 172.0 | 160.5 | Over |
| `/returns` | 164.7 | 153.3 | Over |
| `/settings` | 158.9 | 157.6 | Over |
| `/shelves` | 159.2 | 157.8 | Over |
| `/suppliers` | 165.6 | 154.2 | Over |
| `/team` | 164.5 | 152.9 | Over |

## Changes

- Copilot and inventory drawers load when opened; animation code loads after paint only when enabled.
- Paginated tables avoid the virtualization engine until more than 50 rows exist.
- POS uses a memoized virtual catalog without the sortable table engine. Search filtering and stock aggregation reuse their results while typing.
- Table rows are memoized and measured. All loaded sortable-table rows are restored for printing.
- Main UI font is preloaded locally. No external font or icon requests are needed.

## Remaining limits

Initial JavaScript remains over budget on app routes. The retained Next/React runtime and existing client-side screens account for most of the total. Deferred downloads are excluded from the initial totals, not eliminated. Further route/module restructuring would be needed to meet the total budget; these results do not claim compliance.

Lighthouse, browser INP, LCP, CLS, mobile layouts, assistive technology and physical printing have not been measured or verified. A credible Lighthouse estimate cannot be derived from bundle sizes alone. Browser testing was not run, following the user's earlier instruction.

## Reproduce

Build frontend, run `python scripts/audit_ui_performance.py` from the project root, and run `node scripts/benchmark-pos.mjs` from frontend. Benchmark results are in `data/ui-performance/catalog-benchmark.json` and are not browser timings.
