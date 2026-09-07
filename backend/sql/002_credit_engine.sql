-- MELODICA IA Credit Engine v2
CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PURCHASE','RESERVE','SETTLE','REFUND','BONUS','ADJUSTMENT')),
  reference_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, kind, reference_id)
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON credit_ledger(user_id, created_at DESC);
