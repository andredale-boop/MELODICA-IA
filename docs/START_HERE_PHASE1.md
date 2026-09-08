# START HERE — MELODICA IA FASE 1

## 1. Local smoke test
`docker compose up --build`

API health: `http://localhost:8080/health`

The compose profile enables the local WAV fallback only for development.

## 2. Production
- Set `ALLOW_LOCAL_DEMO=false`.
- Set a long random `JWT_SECRET`.
- Use managed PostgreSQL with TLS.
- Set `PUBLIC_BASE_URL` to the HTTPS API domain.
- Set `PROVIDER_GATEWAY_URL` and `PROVIDER_GATEWAY_API_KEY`.
- Configure Android with `-PMELODICA_API_BASE_URL=https://api.example.tld -PMELODICA_API_ENABLED=true`.

## 3. Google Play
The Android project targets API 36 and uses Play Billing 9.1.0. Google documents that purchases should be verified on the server before content is granted and acknowledged. Product IDs still need to be created in Play Console.
