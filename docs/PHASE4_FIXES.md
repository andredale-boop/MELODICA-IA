# Phase 4 — final safety fixes

- Generation creation now reserves credits and inserts the job in one PostgreSQL transaction.
- Android refreshes server credits and projects after login, registration, and session restore.
- Existing idempotent generation requests are returned without creating another reservation.
- Cancel/finalize locking remains protected by `FOR UPDATE`.

The AI provider and Google Play verifier still require production credentials/configuration; local WAV mode is not AI generation.
