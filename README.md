# SmartPharm

Pharmacy management for Indian physical pharmacies. Next.js 16 / React 19 / TypeScript frontend; Flask / SQLAlchemy backend; MySQL business database. SQLite is supported for local evaluation, with optional computer vision, pgvector and Gemini integrations.

## Connected workflows

- First-store setup, login, owner/manager/pharmacist/cashier/inventory roles.
- Team & Access for staff creation, role assignment, password resets and activation, with owner/self protection and audit history.
- Medicines, ingredients and aliases, batches, shelf stock, expiry and audited adjustments.
- POS billing, FEFO selection, customers, receipts, sales history, partial and full returns.
- Purchase drafts, review and acceptance, suppliers, invoice parsing and editable physical delivery counts passed into actual stock booking.
- Prescription capture, OCR assistance, clinical verification and dispensing records.
- Shelf layout, picking locations, storage checks, cycle counts and audit history.
- Expenses, filtered history and operational profit/loss workspace.
- Owner branch creation with initial manager account, cross-branch stock, transfer draft, dispatch and receipt.
- Durable offline POS queue, cached catalog, pending/conflict status, reconnect retry and manager reconciliation.
- Grounded copilot, demand/stockout/expiry/reorder calculations and browser speech-to-search.

## Local setup (Windows PowerShell)

Use Python 3.11 and Node.js 22 LTS. Start the backend and frontend in separate terminals from this project directory.

```powershell
cd backend
py -3.11 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
$env:DATABASE_URL = "sqlite:///smartpharm-local.db"
$env:FLASK_ENV = "development"
$env:PGVECTOR_URL = ""
$env:GEMINI_API_KEY = ""
.\venv\Scripts\python.exe -m flask --app run db upgrade
.\venv\Scripts\python.exe run.py
```

Copy environment examples only for a new installation; preserve existing files. SQLite relative paths resolve under `backend/instance`. For MySQL, create an empty UTF-8 database, leave `DATABASE_URL` unset, fill `DB_*` in `.env`, then use the same `db upgrade` command. Migrations are included: do not run `db init` or generate migrations for a fresh installation.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [first-time setup](http://localhost:3000/login/setup), create the pharmacy and owner, then add medicines, shelves, batches and suppliers. Later visits use [Login](http://localhost:3000/login). The default [API health check](http://127.0.0.1:5000/api/health) is on port 5000. Set `NEXT_PUBLIC_API_URL` before building if the API address differs.

## Existing databases

Back up before migrations. The new operational migration supplies ten tables missing from the original history. An installation previously created with `db.create_all()` needs a schema comparison and correct Alembic baseline stamp first; blindly upgrading it can fail on existing tables. No live migration runs automatically.

## Offline counter use

Sign in and open POS online first to cache the catalog. Checkout saves a UUID transaction locally before replaying it. The server commits the sale and sync receipt atomically; retries use the same UUID. Disconnected bills remain pending and reserve cached stock. Conflicts remain visible until a manager reconciles inventory and retries. Reviewing a conflict does not falsely record a sale.

The ledger and cache belong to the signed-in account and store. A previously validated unexpired session can reload offline; new offline login is unavailable. Keep this browser profile and site data until every bill is synced. Settings clears only the catalog cache, preserving saved bills and login. Web Locks support is required for same-browser checkout reservations. Multiple disconnected terminals still require server reconciliation. A disconnected reload requires local Next.js assets/server to remain available; this is not an installed service-worker PWA.

## Optional computer vision and AI

Install `backend/requirements-vision.txt` for PaddleOCR and YOLO; their weights download on first use. Without OCR, images cannot provide extracted text; manual search and pasted invoice/prescription text remain available. Recognition requires pharmacist review. Datasets are not shipped: use the repository `data` directory or `SMARTPHARM_DATA_DIR`.

`PGVECTOR_URL` enables PostgreSQL vector persistence; an empty URL uses in-memory indexing. `GEMINI_API_KEY` enables the optional language model path. Current source includes no cloud credentials. Text vectors use deterministic hashed features and visual vectors use image features; the training utility indexes/evaluates these and does not imply a clinically validated neural model.

## Verification

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -q
```

Tests use temporary SQLite, isolated datasets and disabled external AI/model downloads. Default pytest excludes `test_live_*.py`: those scripts target a real store and are unsuitable for routine production verification. Tests include fresh migration upgrade/downgrade and metadata parity.

```powershell
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs both suites, lint, type checking and build. See the [completion blueprint](plans/smartpharm-completion.md) for scope, dependencies, review findings and measured results.

## Deployment and practical limits

Use MySQL for concurrent stores, a strong `SECRET_KEY`, HTTPS, restricted `CORS_ORIGINS`, backups and a production WSGI server. Set `FLASK_ENV=production` and run `venv\Scripts\waitress-serve.exe --listen=127.0.0.1:5000 run:app` behind an HTTPS proxy. Build and start the frontend with `npm run build` then `npm start`. Flask development hosting is for local use.

One installation represents one pharmacy chain with owner oversight; this is not a tenant-isolated SaaS service. Profit/loss excludes GST and reverses costs for restocked goods. Missing purchase costs fall back to 70% of MRP, making reports operational estimates rather than audited accounts. Cash refunds are capped by collected non-credit tender; returned credit goods may require separate debt reconciliation. Some printer/audio preferences are not integrated into every workflow. SQLite tests do not establish real MySQL concurrency/load behavior or real-device OCR accuracy. Hosting, backups, external credentials, credential rotation and regulatory approval remain operator responsibilities.
