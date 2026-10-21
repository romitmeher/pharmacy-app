# SmartPharm frontend

Next.js 16.3.5, React 19 and TypeScript. Run `npm ci`, copy `.env.example` to `.env.local` for a new installation, then `npm run dev`.

The API defaults to `http://127.0.0.1:5000`; set `NEXT_PUBLIC_API_URL` before building to change it. Start at `/login/setup` for a new pharmacy.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

See the [project README](../README.md) for backend setup, migrations, offline behavior and limitations. Read [AGENTS.md](AGENTS.md) and the installed Next.js docs before framework changes.

UI implementation and performance checklist: [shared components](src/components/ui/README.md). The full [route performance audit](../plans/ui-performance-audit-20261021.md) records measured gzip sizes and unmet budgets.

- [x] Build, TypeScript and 18 frontend regression tests pass.
- [x] POS filtering and stock aggregation benchmarked with matching rules and totals preserved.
- [x] Route-specific styles, self-hosted fonts and deferred optional UI code.
- [x] Large tables use measured virtual rows; sortable tables restore loaded rows for printing.
- [x] Effects settings honor system reduced motion and leave working screens static.
- [ ] Total initial JavaScript below 150,000 bytes on every app route. Currently unmet.
- [ ] Measure browser Lighthouse, INP, LCP and CLS. No browser scores claimed.
- [ ] Verify layouts at 360, 390, 768, 1024, 1366 and 1440 pixels.
- [ ] Verify keyboard/screen-reader flows, offline recovery and physical receipt printing.
