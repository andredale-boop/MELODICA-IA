# MELODICA IA 1.2 — Production status

## What is now implemented in this package
- Android release configuration targeting API 36.
- Play Billing 9.1 client integration shell with automatic reconnection and one-time product flow.
- Backend JWT auth with scrypt password hashing.
- PostgreSQL projects API.
- Server-side credit account and ledger reservation/settlement/refund flow.
- Idempotent generation creation and job polling/cancel.
- Local WAV worker for complete end-to-end generation validation.
- Static asset delivery endpoint.
- Security middleware and strict JWT algorithm validation.
- Production SQL hardening migration.

## What cannot be made genuinely live without external accounts/secrets
A commercial AI service still requires the owner's provider accounts and credentials. The package deliberately does **not** contain provider secrets. Configure the real music, voice, video and storage providers on the backend, then set their adapters/gateway URL.

Google Play purchases also require the Play Console product IDs and server-side purchase verification credentials. The Android Billing client is wired, but the final entitlement grant must be performed by the backend after Google verification.

## Release gate
Do not market the local WAV worker as AI generation. Before public launch, replace the fallback worker with real provider adapters, enable server-side Play purchase verification, deploy PostgreSQL/API over HTTPS, run internal/closed Play testing, and complete Play Console Data Safety/privacy declarations.


## Phase 2 completed
- Android app connected to Railway API by default.
- Login/register/JWT session added.
- Server credits and cloud projects synced.
- Generation jobs use backend endpoints and poll status.
- Authenticated asset download added.
