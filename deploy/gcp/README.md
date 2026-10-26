# SmartPharm on Google Cloud Run

The frontend and Flask API use separate HTTPS services in `asia-south1`. Business data stays in the existing managed MySQL database. Deployment does not migrate, seed, reset, or replace that database.

Container sources are filtered by `.gcloudignore` and each `.dockerignore`. Never add environment files, certificates, local SQLite databases, private invoice photos, demo login files or training datasets to an image. MySQL's CA certificate is mounted from Secret Manager at runtime.

The API runtime service account is `smartpharm-runtime`. The frontend uses `smartpharm-web-runtime`, which has no database-secret access. It has access only to the six SmartPharm secrets needed by the deployed configuration. Credentials must be provisioned directly in Secret Manager, never in this README or command arguments. Builds cache the small PaddleOCR weights inside the backend image; the paired local demo classifier and private photos are not uploaded.

Frontend: `smartpharm-web`, 512 MiB / 1 CPU. API: `smartpharm-api`, 4 GiB / 4 CPUs, maximum two instances, concurrency one with one WSGI request thread for the OCR singleton, 300-second request timeout. Both services scale to zero when idle. Cloud Build, image storage, Secret Manager, network transfer and active Cloud Run requests can incur charges.

The API is publicly reachable at the transport layer for browser requests, but business endpoints retain the existing application authentication and role checks. CORS allows the deployed frontend origin. Use existing staff accounts, not the local SQLite demo credentials.

Medicines, batches, sales and purchases persist in Aiven MySQL. Stocking references, reviewed corrections and AI vectors persist in Aiven PostgreSQL. The interactive local app and Cloud Run share these connections; neither uses a SQLite demo database. SQLite remains only in isolated tests and offline archive tools. Large local reference datasets and the local paired-photo demo model are not part of this deployment.

## Redeploy

From the repository root, after verifying local changes:

```powershell
.\deploy\gcp\deploy.ps1
```

The script expects the Artifact Registry repository, runtime service account, per-secret access grants and six runtime secrets to have already been provisioned. It builds fresh images, deploys them with their existing secret references, and checks the API health endpoint. It does not commit or push Git changes. Physical camera testing and new-photo accuracy are separate from deployment checks.
