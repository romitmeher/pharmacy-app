# Secret exposure response

The screenshots show historical public GitHub findings and an Aiven notice confirming an active exposed PostgreSQL service credential. Removing a string in a newer commit does not revoke it or remove the older commit.

## Required in the service account

Reset the password for `avnadmin` on the Aiven PostgreSQL service named in the notice. Use the Aiven Console reached directly, then update `PGVECTOR_URL` in ignored local/deployment environment configuration and restart affected backends. Do not paste the replacement password into chat, source files or issue descriptions. Check service activity and restrict network access as appropriate.

If historically exposed application JWTs can still authenticate, revoke those sessions; rotating the deployment's application signing key invalidates existing signed sessions. Deployment secrets were not modified from this workspace.

After credentials are revoked, coordinate removal from Git history and request rescanning. History rewriting and force pushing were not performed. Closing a scanner alert alone does not revoke a password.

## Local changes

- Demo passwords and the demo signing key are installation-specific random values stored under ignored `backend/instance/demo-credentials.json`.
- The four existing local demo account passwords and signing key were rotated. Demo stock and sales were preserved.
- Demo seeding, barcode checks and photo benchmarks read local credentials instead of fixed values. Public-facing demo manifests and generated README text no longer embed the password.
- The flagged distributor test creates its synthetic password at runtime. This test account was not an Aiven credential.
- The current API client contains no matching literal JWT, and the current vector store does not embed a credential-bearing connection URI.
- A limited tracked-file scan found no matching JWT/cloud-credential-URI/API-key literals. This is not an exhaustive secret scan and does not cover Git history.

Targeted credential persistence/rotation and distributor tests: 9 passed. Local fixes remain subject to commit/push before the public repository changes.

References: https://aiven.io/docs/products/postgresql/howto/manage-service-users and https://aiven.io/docs/tools/cli/service/user .
