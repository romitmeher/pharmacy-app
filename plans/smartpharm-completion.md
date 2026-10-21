# SmartPharm completion blueprint

Created 2026-10-21. Objective: make the existing pharmacy workflows installable, connected, and verifiable. Status: local implementation and verification complete. No live deployment or store database migration was performed.

## Evidence and scope

Baseline: Next.js 16.3.5 / React 19 frontend; Flask / SQLAlchemy backend; MySQL business data and optional pgvector/Gemini/OCR integrations. 187 static test functions; frontend baseline lint has 61 errors and 96 warnings. Three existing migrations omit returns, prescriptions, transfers, synchronization, audit, expenses, and AI history. Offline helpers and finance endpoints exist without complete user flows. No existing plans or memory index were found. Git and authenticated gh are available, default branch is main; implementation stays local and no PR/push/deployment is requested.

Completion means documented local startup from an empty database, all current model tables migrated, honest optional-integration behavior, authenticated operational screens, durable offline billing, correct refund accounting, branch authorization, passing isolated backend tests, TypeScript and production build. Cloud credentials, hosting, real-device OCR accuracy, and regulatory certification cannot be supplied or claimed by this code change.

## Invariants

- Never access the configured live database during verification; tests use SQLite and disable external AI/vector services.
- Never discard an unsynced sale or allow one user's offline queue to replay into another store.
- Purchases and stock transfers mutate inventory only at explicit acceptance/dispatch/receipt boundaries.
- Refunds cannot exceed original net paid line allocations or restock returned stock twice.
- Keep existing user work intact; keep credentials out of source, examples, logs, and plans.

## Dependency graph

`1 -> {2,3,4}; 2 -> {5,5a,5b}; {2,3,4,5,5a,5b} -> 6 -> 7`

Steps 2, 3 and 4 can run in parallel with distinct ownership. Backend correctness (5) may proceed alongside frontend work after external test calls are isolated. Integration (6) is serial. Review (7) must inspect the final implementation and plan. Models use the current capable agent; strongest available reasoning is appropriate for transaction and adversarial review.

## Step 1 — Baseline and test isolation

Context: backend tests currently import optional cloud clients; frontend has pre-existing lint failures. Files: backend configuration/vector/RAG modules and test fixtures. Tasks: inspect current behavior, remove embedded connection defaults, explicitly disable external services under TESTING, support DATABASE_URL for local SQLite, record baseline. Verify: backend isolated test suite; no live-service connection attempts. Exit: tests can run without cloud credentials. Rollback: revert only this step's edits. Suggested PR: `fix: isolate development and test configuration`.

## Step 2 — Complete database lifecycle

Context: migrations stop at purchase invoices while app.models imports substantially more tables. Files: backend/migrations/versions and migration tests. Tasks: add an explicit Alembic revision for every missing table/index/foreign key, support fresh installation and downgrade, document existing database reconciliation. Verify: upgrade empty SQLite to head, inspect parity against metadata, downgrade and upgrade again. Exit: fresh schema supports all registered domains. Rollback: downgrade only the new revision, after backup; never apply against a live store automatically. Suggested PR: `fix: complete operational database migrations`.

## Step 3 — Durable offline billing

Context: frontend/lib/offlineQueue.ts, api.ts and POS page have unconnected offline helpers. Files: these files and AuthContext. Tasks: scope persisted data by authenticated user/store, cache catalog, durably enqueue UUID checkout before replay, use server idempotency for retries, reconnect replay, show conflicts/failures, preserve authenticated offline reload only with valid cached identity/expiry. Remove development token fallback. Verify: frontend typecheck/build; helper regressions for identity separation and durable queues; backend sync tests. Exit: queued sales survive reload and errors remain visible without duplicate sale creation. Rollback: preserve queue storage while reverting UI; never delete pending records. Suggested PR: `feat: connect offline POS billing`.

## Step 4 — Expenses and profit/loss workspace

Context: /api/expenses already supports record/list/summary but no navigation/page exists. Files: frontend/app/expenses/page.tsx and Sidebar.tsx. Tasks: owner/manager page, expense form, date/category history, P&L summary, empty/error/loading states. Verify: typecheck, production build and finance API tests; cashier access denied. Exit: users can record an expense and see real totals. Rollback: revert frontend route/navigation without removing expense data. Suggested PR: `feat: add pharmacy finance workspace`.

## Step 5 — Transaction correctness and branch boundaries

Context: separate refund paths risk double restocking, partial return math ignores discounts/tax, transfer actions lack source/destination authority checks. Files: sales, returns, expense and branch services/APIs plus regression tests. Tasks: unify refund accounting with remaining-quantity returns, reject invalid refund conditions, allocate actual invoice totals, reverse COGS only for restocked returns, authorize transfer actions and destination shelf, serialize inventory/return state as appropriate. Add a branch workspace if service boundaries pass tests. Verify: discounted partial/full refunds, duplicate requests, missing inventory, foreign branch actor, invalid shelf, rollback checks and existing sales/returns/expenses/multibranch tests. Exit: regression tests prove inventory and money conservation. Rollback: revert code only, retain audit and transaction records. Suggested PR: `fix: preserve stock and money across returns and transfers`.

## Step 6 — Quality gates and runnable delivery

Context: setup README incorrectly calls frontend planned; no CI currently enforces checks. Files: existing frontend source lint errors, README, environment examples, CI, optional local launch files. Tasks: repair lint/type errors without disabling rules, document exact prerequisites and migration commands, optional dependency behavior and deployment boundaries, add isolated CI checks. Verify: backend pytest excluding live scripts; frontend lint, tsc --noEmit and next build; fresh local startup/health and migration test. Exit: actual outcomes recorded, no passing claims inferred from old caches. Rollback: revert tooling/docs independently; no production migration execution. Suggested PR: `chore: add reproducible setup and verification`.

### Inserted step 5a — Branch and staff provisioning

Context: role checks existed without a usable way to create cashier/pharmacist/inventory accounts, and branch transfers required an uncreatable second store. Files: auth and multibranch APIs, frontend team/branches routes and Sidebar, test_team.py and test_branch_setup.py. Tasks: owner-only branch + initial manager creation; owner/manager current-store staff administration; immutable owner/self boundaries; global login uniqueness, validation and audit, activation instead of deletion. Verify: real login of provisioned accounts, manager privilege escalation rejection, foreign-store target rejection, atomic failure rollback, frontend typecheck/lint/build. Exit: operational roles can be used from the UI without manual SQL. Rollback: revert interfaces/APIs without deleting staff or branch records. Suggested PR: `feat: provision branches and pharmacy staff`.

### Inserted step 5b — Real receiving counts and acceptance contract

Context: physical delivery UI copied invoice quantities into supposed actual scans; its acceptance payload used location_id/received_items while the service expected default_location_id/items. Files: frontend purchases route/api client, backend purchase service/API, purchase contract and integrity tests. Tasks: independent editable received counts starting at zero, load full invoice lines, explicit comparison before booking, map reviewed quantities and shelf into backend contract; validate location ownership and quantities, lock invoice and audit acceptance/cancel. Verify: client payload regression; partial acceptance, invalid quantities, wrong shelves, repeated booking, audit rollback and original purchase/distributor tests. Exit: stock booked reflects the reviewed delivery instead of silently using expected quantities. Rollback: revert code while retaining purchase and audit data. Suggested PR: `fix: book independently counted purchase receipts`.

## Step 7 — Adversarial review and register

Context: review the plan and final diff against all invariants. Tasks: delegate independent review, fix critical findings, record tests/limitations, update plans/README.md. Verify: inspect git diff and ensure no secrets/new external side effects; rerun affected checks after fixes. Exit: no known critical findings remain; any remaining limitations are explicit. Suggested PR: `docs: register verified completion blueprint`.

## Mutation protocol

Record date, evidence, changed step/dependency and validation whenever splitting, inserting, reordering, skipping, or abandoning a step. Never mark a step complete merely because scaffolding exists. New scope must preserve invariants and have its own rollback and verification. Do not publish, deploy or migrate live data as part of this local implementation.

## Execution log

- 2026-10-21: Baseline inspected; local parallel work assigned for foundations/migrations, offline billing and finance UI. Implementation and verification ongoing.
- 2026-10-21: Independent adversarial blueprint review required durable UUID-before-request checkout, disabled model downloads, mandatory usable branch workflow and explicit deployment limits. Incorporated all four findings.
- 2026-10-21: Inserted steps 5a/5b based on missing account provisioning and a demonstrated frontend/backend receiving contract mismatch; both depend on schema foundations and precede integration verification. The plan now has nine bounded work packages, including three independent initial implementation streams.
- 2026-10-21: Independent implementation review found cache reset deleting ledgers, credit tender refund exposure, mixed-GST reversal errors, cumulative rounding over-refunds, concurrent sync failure overwriting success, false conflict-success acknowledgements and brand-only branch medicine merges. All seven corrected with focused regression tests (cache button now removes only scoped catalog data).
- 2026-10-21: Browser smoke test against a freshly migrated temporary SQLite server: setup + automatic login, expense entry reflected in P&L, branch + manager creation, offline bill persisted, reconnection created exactly one sale, stock 50 -> 49, and local pending ledger cleared only after confirmed snapshot. Temporary servers stopped and isolated browser tab closed; no live records touched.
- 2026-10-21: Strongest-model final review found inconsistent cross-domain stock locks and out-of-order cross-tab catalog installation. Added shared ordered store locks and refreshed locking inventory reads across sales, returns, transfers, purchases, adjustments and shelf audits; shelf count application now commits all adjustments/audit atomically. Catalog refresh/download/install/acknowledgement removal now uses the exact reservation Web Lock, with a bounded download timeout. Added stale-ORM-balance and delayed-catalog-response regressions. Bounded re-review confirmed both original issues addressed; its shelf preview lock-order follow-up was also corrected by acquiring the store lock for previews.

## Completion checklist

- [x] Baseline and cloud isolation: embedded connection/token defaults removed; tests explicitly block external services and model downloads.
- [x] Database lifecycle: ten missing tables migrated; upgrade/downgrade and model metadata parity exercised.
- [x] Offline checkout: identity-scoped durable UUID transactions, Web Locks reservations, reconnect replay, manager retry and expired-session handling.
- [x] Finance: expense creation/history and P&L workspace, cash-cap and mixed-GST return regression coverage.
- [x] Returns/transfers: remaining-quantity refunds, cumulative-cent allocation, source/destination authority and medicine identity preserved.
- [x] Provisioning: branch manager login and staff role administration, with permissions and rollback tests.
- [x] Receiving: editable real counts and correct acceptance payload; stock booking validation and transactional audit.
- [x] Delivery tooling: documented local setup, optional vision dependencies, environment templates and CI workflow.
- [x] Independent adversarial review: critical findings resolved; practical limitations retained in README instead of claiming production certification.

## Verification evidence

- Frontend: TypeScript and production build pass for all app routes; 10 persistence, cross-tab reservation, delayed response and purchase-contract tests pass.
- ESLint: 0 errors, 83 existing advisory warnings remain (baseline 61 errors / 96 warnings). Rules were not disabled to obtain a passing check.
- Migration regression: fresh upgrade, metadata parity, rollback/re-upgrade and full downgrade pass within the backend suite.
- Backend: final full isolated suite **264 passed in 69.10 seconds**. Focused post-locking operational suite: 90 passed; final shelf preview/apply lock-order check: 5 passed. New stale-balance regression passes.
- Final whitespace/error check: `git diff --check` passes. All changes remain local; no commit, push, deployment or live data migration was performed.

No production MySQL load/concurrency benchmark, real-device OCR accuracy study, hosted deployment, or provider credential rotation is claimed. P&L cost fallback, credit debt reconciliation and local-server dependence for offline page reload are documented limitations.
