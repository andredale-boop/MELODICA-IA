# MELODICA IA — FASE 1 COMPLETATA

Questa revisione porta la base verso un backend reale e configurabile.

## Implementato
- API HTTPS-ready con JWT e PostgreSQL.
- Registrazione, login, profilo e cancellazione account.
- Progetti server-side.
- Crediti server-side e ledger.
- Job idempotenti e polling.
- Asset protetti tramite endpoint autenticato invece di directory pubblica.
- Provider gateway configurabile con `PROVIDER_GATEWAY_URL`.
- Modalità WAV locale disponibile solo con `ALLOW_LOCAL_DEMO=true`.
- Android API URL configurabile tramite Gradle properties.
- Billing 9.1 predisposto per verifica server-side prima dell'acknowledge.

## Da configurare fuori dal codice
- dominio HTTPS e PostgreSQL reali;
- provider AI reale e relative credenziali server-side;
- prodotti Play Console;
- account/service credentials per verifica acquisti;
- firma release/AAB.

Google Play richiede target API 36 per nuove app e aggiornamenti dal 31 agosto 2026. Questa build usa targetSdk 36.
