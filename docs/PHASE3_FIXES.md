# MELODICA IA 1.4.0 — stabilizzazione job e crediti

Questa versione conserva le correzioni di Manus e aggiunge hardening sul flusso di generazione:

- un job può passare a `RUNNING` una sola volta; una richiesta idempotente non riavvia un job già esistente;
- `projectId` viene verificato contro l'utente autenticato prima di creare il job;
- completamento, settlement dei crediti e stato del job vengono finalizzati nella stessa transazione con lock del job;
- annullamento e completamento sono serializzati tramite `FOR UPDATE`, evitando la gara cancel/runJob;
- un errore di provider rimborsa i crediti nella stessa transazione che marca il job `FAILED`;
- gli asset restituiti come URL HTTPS possono essere restituiti dopo autenticazione tramite redirect, mentre gli asset locali restano protetti;
- health endpoint e Android sono versionati a 1.4.0.

La build release deve essere ricreata dal CI/Railway/Docker tramite `npm run build` e Gradle.
