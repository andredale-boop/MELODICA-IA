# MELODICA IA 1.1 — Google Play Release Checklist

## Source hardening completed
- compileSdk/targetSdk 36
- versionCode 11 / versionName 1.1.0
- Google Play Billing KTX 9.1.0 dependency
- HTTPS-only network policy (`usesCleartextTraffic=false`)
- INTERNET permission
- release minification enabled
- unit-test source added

## Production gates still required
- Real HTTPS backend deployment and endpoint configuration.
- Server-authoritative credit wallet + idempotent ledger.
- Server-side Google Play purchase verification and entitlement grants.
- Real AI provider gateway; provider keys must remain server-side.
- Play Console products/subscriptions configured with final IDs.
- Privacy policy, Data Safety and account deletion (if accounts exist).
- Signed AAB built and tested on a clean CI/machine with Gradle Wrapper.
- Internal/closed testing and crash/ANR review.

## Google testing note
For new personal developer accounts created after 13 Nov 2023, Google currently requires a closed test with at least 12 testers continuously opted in for 14 days before applying for production access.
