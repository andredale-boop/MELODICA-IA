CREATE TABLE IF NOT EXISTS voice_profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  provider TEXT,
  provider_voice_model_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_profiles_user_idx
  ON voice_profiles(user_id, created_at DESC);
