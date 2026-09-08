# MELODICA IA v1.1 — Final Bug/Security Test Report

## Static test performed
- Android source and Gradle configuration inspected.
- Backend TypeScript source and SQL migrations inspected.
- Security-sensitive credit paths reviewed.
- Release configuration reviewed against current Google Play target API requirement.

## Bugs found and corrected
1. **Credit idempotency flaw** — a repeated reserve request could decrement the balance again even though the ledger insert was protected by a unique constraint. Fixed by checking an existing RESERVE before changing the account.
2. **Ledger settlement sign** — SETTLE entries were recorded as positive even though the reserved amount had already been removed from balance. Fixed to record consumed credits as negative and refunds as positive.
3. **Credit schema mismatch** — the initial migration created an incompatible `credit_ledger` shape (`delta/reason`) while the credit engine expected `amount/kind`. Fixed by making the initial migration defer ledger creation to the credit-engine migration.
4. **Generation job persistence** — generation endpoint reserved credits but did not create a job. Fixed by inserting an idempotent job record and returning its UUID.
5. **Generation status endpoint** — previously always returned 404. Fixed to read the authenticated user's job.
6. **Cancel endpoint** — previously returned a success response without changing the job. Fixed to cancel only the authenticated user's QUEUED/RUNNING job.
7. **JWT algorithm restriction** — verification now explicitly accepts HS256 only.
8. **Production database guard** — production startup now requires DATABASE_URL.

## Remaining external validation
- Android Gradle/AAB build was **not executable in this environment** because the project has no Gradle wrapper JAR and no system Gradle installation.
- Backend dependency installation could not complete within the execution window, so TypeScript compilation against the installed npm dependency graph was not certified here.
- Real Google Play purchase verification requires a Play Console application, product IDs, service-account credentials and test purchases.
- Real AI generation requires production provider credentials and deployed backend infrastructure.

## Release verdict
**RC / NOT YET CERTIFIED FOR PRODUCTION.** The code-level critical credit/idempotency defects found in this pass were corrected. Final publication still requires a real Release AAB build, signed artifact, device/instrumentation tests, Play Billing test purchases, deployed backend and provider credentials.
