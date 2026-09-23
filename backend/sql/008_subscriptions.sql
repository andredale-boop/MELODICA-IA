-- MELODICA IA subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL CHECK (product_id IN ('creator','pro','studio')),
  base_plan_id TEXT NOT NULL,
  purchase_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  credits_per_period INTEGER NOT NULL CHECK (credits_per_period > 0),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(purchase_token)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_idx
  ON subscriptions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON subscriptions(status);
