# MELODICA IA API contract (draft)

POST /v1/projects
POST /v1/generations
GET  /v1/jobs/{jobId}
POST /v1/jobs/{jobId}/cancel
GET  /v1/me/credits
POST /v1/billing/google/verify
GET  /v1/assets/{assetId}

Generation request:
{
  "projectId": "...",
  "mode": "song|radio|club|voice|master|video",
  "prompt": "...",
  "lyrics": "...",
  "style": "...",
  "credits": 100
}

The server is authoritative for credit costs, balances, authorization and job state.
