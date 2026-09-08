# Step 5 — Video Lab / Kling
Video requests are backend jobs. Android submits a job specification; backend validates credits and entitlements, then calls the provider adapter.

Pipeline: storyboard -> scenes -> generation -> status polling/webhook -> asset storage -> beat-sync metadata -> export.

Kling credentials and provider endpoints are server-side only. Exact provider pricing must be configured from the contracted API price sheet before enabling production credit costs.
