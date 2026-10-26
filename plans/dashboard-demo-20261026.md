# Dashboard demo activity and return-lookup repair

User requested extra demo data and repair of the search icon overlapping invoice
lookup text. The existing shared Aiven MySQL owner store was used; PostgreSQL and
the eight active photo medicines were left intact.

- Marker: `DEMO-DASH-20261026`; every imported invoice/expense/customer/supplier
  is labelled fictional. No real contact numbers or external payments/orders.
- 50 sales over seven India-calendar days; 12 fictional customers, 3 suppliers,
  5 purchases (3 pending drafts), 6 expenses, 3 near-expiry batches.
- Sales consume exactly the documented quantities from original demo batches;
  no unrelated batch stock is reset. 217 demo units sold and 20 newly received.
  The opening purchase references stock already booked, without double intake.
- Store-row lock and a single commit; reruns detect the seed prefix and do not
  add duplicate history. The original inventory snapshot and new sale IDs are in
  ignored `data/backups/DEMO-DASH-20261026-import.json` and the audit log.
- Do not blindly restore snapshot quantities after subsequent real transactions.
  Use the import marker and transaction history for any later scoped reversal.
- Return lookup now reserves 44px for its icon, has an accessible Sale ID label,
  shorter placeholder and a stacked phone layout.
- Dashboard expiry counts add critical and expired counts correctly; naive UTC
  sale timestamps are interpreted as UTC before grouping by browser-local days.
- One week of nonzero demand exposed unstable recursive Ridge forecasts. The
  existing moving-average baseline is now used below 14 actual selling days.
  The short-history regression test prevents thousands-of-units suggestions from
  this demo's small sample. These remain estimates, not automated purchase orders.

Verification: atomic/idempotent stock/payment seed test plus ML suite passed (7
tests), frontend production build/type check and 28 tests passed, ESLint 0 errors
with 81 existing warnings. Browser checks verify populated metrics/insight rows and
icon clearance/no page overflow at 375px and 1440px. Reports/screenshots are in
ignored `output/dashboard-demo/`. No Git commit.

Deployment verified: frontend `smartpharm-web-00008-pvn`, API
`smartpharm-api-00014-quc` at 100% traffic. Live browser check passed at 375px
and 1440px with 14px icon/text clearance and zero page overflow. Dashboard
displayed 53 sales, 11 stock alerts, 4 expiry alerts, 3 drafts and 11 insight
rows; the seven-day chart contains invoices every day. Candidate read-only
forecast check returned order quantities 70, 70 and 40, below the regression
check's 500-unit ceiling. Counts can change as the rolling time window advances.
