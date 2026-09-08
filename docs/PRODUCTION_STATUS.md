# MELODICA IA — stato produzione 1.4.0

## Operativo verificato
- Railway API online
- PostgreSQL Railway online
- schema SQL applicato: users, projects, jobs, credit_accounts, credit_ledger
- DATABASE_URL configurato nel servizio MELODICA-IA
- HTTPS pubblico attivo
- registrazione/login JWT verificati
- endpoint crediti verificato
- engine crediti transazionale e idempotente
- job generation con protezione da race cancel/complete

## Ancora necessario prima della pubblicazione Play Store
- provider IA musicale/video reale e storage persistente
- verifier Google Play reale con credenziali server-side
- firma release/Play App Signing
- test su dispositivo reale e closed testing Play
- privacy policy definitiva e Data Safety
- verifica di tutti i prodotti e prezzi in Play Console
