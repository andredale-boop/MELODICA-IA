# Phase 4 — final fixes applied

1. Generation creation reserves credits and inserts the job in one PostgreSQL transaction.
2. Reservation idempotency is race-safe: the unique credit-ledger reservation row is inserted before the balance update, so concurrent requests with the same idempotency key cannot double-debit credits.
3. Android refreshes server credits and remote projects after login, registration, and session restore.
4. Cancel/finalize remain protected by row locking so a canceled job cannot later be finalized by the normal completion path.
5. Local WAV mode remains explicitly a demo fallback; production AI generation still requires a configured provider gateway.

Build note: full Android/Node dependency builds should be run in a network-enabled CI or local environment before Play release. No secrets are included in this source package.
