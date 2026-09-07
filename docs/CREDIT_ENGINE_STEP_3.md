# MELODICA IA — Step 3: Credit Engine & Billing foundation

Implemented in this package:
- Server-side credit accounts and immutable ledger.
- Atomic reserve semantics before an AI job is accepted.
- Settlement/refund primitives for provider success/failure.
- Idempotency key uniqueness at ledger level.
- Server catalog for configurable generation costs.
- `/v1/credits` and `/v1/credits/catalog` endpoints.
- Generation endpoint refuses unknown modes and insufficient balance.

Still required before production billing:
1. Google Play purchase token verification on the backend using Google Play Developer API.
2. Product IDs for Creator/Pro/Studio and credit packs configured in Play Console.
3. RTDN/Pub/Sub processing for subscription lifecycle and refunds/revocations.
4. Grant credits only after verified purchase; never from the Android client.
5. Persist subscription entitlements and transaction IDs idempotently.
6. Connect the reserved job to the real provider queue; settle only from authoritative provider outcome.
