# MELODICA 1.5.1 — Replicate Provider

Primary generation provider:
- AI voice: `minimax/music-2.6`
- Personal voice: `deepsbhat1984/music_voice_clone_pro`

Routing:
- `voiceId == null` -> MiniMax Music 2.6 directly -> final MP3
- `voiceId != null` and provider `replicate` -> MiniMax base song -> voice clone -> final WAV
- Legacy Soundverse voices remain supported only when their stored provider is `soundverse`

The Android API contract remains `/v1/voices/...` and `/v1/generations`.
The Replicate token must be server-side only: `REPLICATE_API_TOKEN`.
