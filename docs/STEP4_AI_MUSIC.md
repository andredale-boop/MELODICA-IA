# Step 4 — AI Music Provider Gateway
MELODICA IA uses a backend-only provider gateway. Android never receives provider secrets.

Required production adapters:
- music generation provider
- voice provider
- audio analysis provider
- mix/master provider
- Music DNA analyzer

Each job must use: authenticated user -> entitlement check -> credit reservation -> provider request -> webhook/poll -> settlement/refund -> persisted artifact.

Provider credentials belong in the backend secret manager/environment, never in the APK.
