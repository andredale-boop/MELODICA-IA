ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS voice_id UUID REFERENCES voice_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_voice_idx
ON jobs(voice_id);
