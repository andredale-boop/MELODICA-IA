# MELODICA IA v1.3.0 — Correzioni applicate

## Correzioni incluse

Il client Android ora collega la schermata Crediti a Google Play Billing 9.1, gestisce la verifica server-side obbligatoria del purchase token e non accredita mai crediti localmente. Sono configurati i prodotti `credits_500`, `credits_1500` e `credits_5000`.

È stato aggiunto il flusso in-app “Elimina account e dati”, con conferma esplicita, collegato all’endpoint autenticato `DELETE /v1/account`. Il backend conserva la cancellazione a cascata di progetti, job, account crediti e ledger associati tramite i vincoli PostgreSQL.

Il backend ora espone `POST /v1/billing/verify`. L’endpoint rifiuta l’accredito se `GOOGLE_PLAY_VERIFIER_URL` non è configurato; quando il verifier esterno risponde con prodotto verificato, l’accredito è idempotente sul purchase token tramite il ledger unico.

Sono stati risolti anche i problemi di build: BOM Compose incompatibile con API 36, target Java/Kotlin non coerenti, API callback di Billing 9.1 e uso di `NavigationBarItem` come estensione `RowScope`.

Sono stati aggiunti template per privacy policy, pagina pubblica di cancellazione account e checklist degli asset Play Store.

## Verifica locale

La sequenza seguente è stata eseguita con successo nell’ambiente di lavoro:

```bash
./gradlew clean test assembleRelease --no-daemon
npm ci --ignore-scripts
npm run build
```

È stata inoltre generata la variante release Android. Il warning R8 relativo ai metadata Kotlin non ha impedito la build; va comunque tenuto sotto osservazione in CI quando si stabilizza la combinazione AGP/Kotlin.

## Dipendenze esterne residue

La versione non può essere dichiarata pubblicabile senza una chiave di firma release/Play App Signing, un backend HTTPS realmente deployato, PostgreSQL e storage persistente, un verifier Google Play configurato con credenziali server-side, i provider IA reali, privacy policy compilata con i dati del titolare e gli asset della scheda Store. Questi valori richiedono accessi e decisioni del proprietario e non devono essere fabbricati nel codice.
