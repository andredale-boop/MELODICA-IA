# Production blockers

This package is a hardened Android release-candidate baseline, not a production-certified build.

Blocking items:
1. Real backend deployment and HTTPS endpoint.
2. Server-authoritative credits and idempotent ledger.
3. Server-side Google Play purchase verification.
4. Real AI provider integrations and cost controls.
5. Gradle Wrapper binary + clean release AAB verification.
6. Privacy/Data Safety/account-deletion implementation and Play Console configuration.

## Step 1 hardening — Android client
- Local credit top-up removed from the client.
- Local credit spending no longer mutates a persisted balance.
- Purchase UI is disabled until server-side Play Billing verification is connected.
- Provider/API keys remain outside the Android client.
- Remaining blocker: implement authenticated HTTPS backend and replace the disabled local generation paths with server jobs.
