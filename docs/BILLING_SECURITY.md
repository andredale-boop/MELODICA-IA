# Billing security rules

- Android is never authoritative for credit balance or entitlement.
- A purchase is `PENDING` until server verification succeeds.
- Every Play purchase token / order ID must be processed idempotently.
- Credits are granted only once for a verified transaction.
- Refund/revocation events must reverse the associated entitlement according to policy.
- Provider API keys remain backend-only.
- Credit mutations use the ledger; direct client-side balance writes are forbidden.
