# Phase 2 — Android API connection

MELODICA IA Android v1.4 connects the app to the production Railway API by default.

Implemented:
- Login and registration against `/v1/auth/*`.
- JWT token persisted locally in SharedPreferences.
- `/v1/me` session validation on startup.
- Server-side credit balance via `/v1/credits`.
- Cloud project list/create via `/v1/projects`.
- Generation job creation and polling via `/v1/generations`.
- Authenticated asset download for completed jobs.
- Logout.

The public API base URL is the Railway domain and can still be overridden with
`-PMELODICA_API_BASE_URL=...` and disabled for local builds with
`-PMELODICA_API_ENABLED=false`.

Important: AI provider integration and Google Play server-side billing verification are still separate production tasks.
