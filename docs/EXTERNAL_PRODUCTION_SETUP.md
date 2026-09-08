# External production setup required

The source package can be hardened in-session, but these steps require access to external services/accounts:

1. Deploy backend over HTTPS and set `MELODICA_API_BASE_URL` in the Android release configuration.
2. Configure PostgreSQL and run `backend/sql/001_initial.sql` and `backend/sql/002_credit_engine.sql`.
3. Set a strong `JWT_SECRET` and production CORS allow-list.
4. Configure Google Play subscriptions and one-time credit products.
5. Connect Google Play Developer API / purchase-token verification and acknowledgement/consumption on the backend.
6. Configure RTDN/Pub/Sub for subscription lifecycle events.
7. Configure AI provider credentials on the backend only and implement the provider adapters.
8. Publish privacy policy and account-deletion endpoint/page if account creation is enabled.
9. Build a signed AAB and run local/device tests plus Play internal/closed testing.
10. Resolve all Play Console pre-launch warnings before production rollout.
