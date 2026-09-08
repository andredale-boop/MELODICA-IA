# MELODICA IA 1.2 — Release checklist

## Already in source
- [x] API 36 / target 36
- [x] Release minification enabled
- [x] HTTPS-only Android networking
- [x] Play Billing 9.1 client shell
- [x] JWT + scrypt auth
- [x] Server-side credits ledger
- [x] Idempotent generation jobs
- [x] Project API
- [x] Local WAV end-to-end validation worker
- [x] Asset endpoint
- [x] Launcher icon

## Required before commercial Play launch
- [ ] Deploy API behind HTTPS
- [ ] Provision managed PostgreSQL
- [ ] Configure real music/voice/video providers
- [ ] Configure object storage + signed asset URLs
- [ ] Create Play Console in-app products: credits_500, credits_1500, credits_5000
- [ ] Implement backend Google Play purchase-token verification and entitlement grant
- [ ] Add account deletion endpoint and UI
- [ ] Publish privacy policy and complete Data Safety
- [ ] Configure production applicationId/signing key
- [ ] Generate signed AAB
- [ ] Internal test track
- [ ] Closed test track
- [ ] Crash/ANR monitoring
- [ ] Production smoke test on physical Android devices
