ALTER TABLE voice_profiles
  ADD COLUMN IF NOT EXISTS provider_voice_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_file_id UUID,
  ADD COLUMN IF NOT EXISTS provider_task_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_consent_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT 'LOCAL';

CREATE INDEX IF NOT EXISTS voice_profiles_provider_voice_idx
  ON voice_profiles(provider_voice_id);

CREATE INDEX IF NOT EXISTS voice_profiles_provider_task_idx
  ON voice_profiles(provider_task_id);
