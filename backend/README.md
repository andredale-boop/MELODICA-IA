# MELODICA IA API 1.3

Backend production foundation for MELODICA IA.

## Implemented
- JWT authentication with scrypt password hashing.
- User profile and account deletion.
- PostgreSQL projects and server-side credit ledger.
- Idempotent credit reservation/settlement/refund.
- Generation jobs with polling and cancellation.
- Authenticated asset delivery.
- Configurable backend-only provider gateway.
- Local WAV fallback only when `ALLOW_LOCAL_DEMO=true`.
- Helmet, CORS, JSON size limits and strict JWT algorithm validation.

## Local setup
1. `docker compose up --build`
2. Apply SQL migrations in `backend/sql/` in numeric order.
3. Set a random `JWT_SECRET` and production `DATABASE_URL`.
4. Keep `ALLOW_LOCAL_DEMO=false` for production.
5. Configure `PROVIDER_GATEWAY_URL` and `PROVIDER_GATEWAY_API_KEY` for real AI services.

## Provider contract
The gateway receives `POST /v1/generations` with `{mode,prompt,jobId}` and must return `{assetUrl}` (preferred) or `{assetPath}`. The gateway is server-to-server only; provider API keys must never be shipped in the Android APK.
