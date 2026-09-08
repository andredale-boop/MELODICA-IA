# MELODICA IA Android v1.3.0

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
- Flusso Google Play Billing collegato alla UI con verifica server-side obbligatoria
- Cancellazione account e dati dall'app
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
1. Distribuire il backend HTTPS e configurare PostgreSQL, provider e storage.
2. Configurare il verifier Google Play (`GOOGLE_PLAY_VERIFIER_URL`) con credenziali server-side.
3. Creare e testare i prodotti Play `credits_500`, `credits_1500`, `credits_5000`.
4. Pubblicare privacy policy, pagina pubblica di cancellazione e completare Data safety.
5. Configurare signing/release, generare l'AAB e testare su dispositivi reali.
6. Eseguire test automatici, manuali, Billing, crash/ANR e closed testing Play.

## QA status — 2026-09-05
A static bug/security pass was performed. One backend compilation blocker was corrected: the generation endpoint is now an async handler. See `docs/BUG_TEST_REPORT.md` and `docs/EXTERNAL_PRODUCTION_SETUP.md`.
