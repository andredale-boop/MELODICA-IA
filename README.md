# MELODICA IA Android v1.1.0

Release candidate avanzata dell'app MELODICA IA.

## Incluso
- Dashboard Material 3 dark
- Navigazione Home / Crea / Libreria / Crediti
- Progetti persistenti localmente
- Studio musicale con player UI e pipeline
- Radio Hit / Club Hit
- Voice Lab
- Mix & Master
- Music DNA
- Video Lab
- Export
- Catalogo crediti e pacchetti demo
- Contratti `MelodicaBackend` per generazione IA asincrona
- Nessuna chiave API segreta nell'app

## Architettura di produzione

Android app
→ API HTTPS MELODICA
→ coda job
→ provider audio/voce/video
→ object storage/CDN
→ URL firmato
→ Android

Il backend deve gestire:
- autenticazione/sessioni
- crediti e ledger server-side
- idempotenza degli acquisti
- rate limiting
- job asincroni
- webhook
- moderazione/sicurezza
- storage e URL firmati
- logging e monitoraggio

## Prima della pubblicazione Play Store
1. Sostituire `DemoBackend` con un client HTTPS reale.
2. Implementare autenticazione.
3. Implementare Google Play Billing con verifica server-side.
4. Spostare il saldo crediti sul server: il saldo locale è solo demo/UI.
5. Collegare storage e download degli asset.
6. Aggiungere privacy policy, termini, account deletion e gestione consenso dove richiesto.
7. Configurare signing/release e test su dispositivi reali.
8. Eseguire test automatici e manuali.

## QA status — 2026-09-05
A static bug/security pass was performed. One backend compilation blocker was corrected: the generation endpoint is now an async handler. See `docs/BUG_TEST_REPORT.md` and `docs/EXTERNAL_PRODUCTION_SETUP.md`.
