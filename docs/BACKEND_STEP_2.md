# MELODICA IA — Passaggio 2: Backend

Questa cartella introduce il contratto e lo scheletro di un backend HTTPS separato dall'app Android.

## Regole di sicurezza
- Nessuna chiave Kling/provider nel client Android.
- Saldo crediti e diritti di utilizzo sono server-authoritative.
- Le generazioni usano una idempotency key.
- I crediti devono essere riservati in transazione e poi settled/refunded.
- Billing Google Play va verificato server-side prima di assegnare crediti o entitlement.

## Da collegare prima della produzione
1. PostgreSQL gestito e migrazioni.
2. Password hashing (Argon2id/bcrypt) e registrazione/login reali.
3. Access/refresh token rotation e revoca.
4. Coda lavori (Redis/BullMQ o equivalente).
5. Provider Gateway per Kling e servizi audio.
6. Google Play Developer API + RTDN.
7. Logging, monitoring, rate limits e backup.
8. Endpoint privacy/account deletion.

Il server skeleton NON è dichiarato production-ready finché questi componenti non sono collegati e testati.
