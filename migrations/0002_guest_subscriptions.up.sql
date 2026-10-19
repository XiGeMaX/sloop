PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guest_subscriptions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  plan_json TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 3 CHECK (months BETWEEN 1 AND 6),
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_subscriptions_expires_at
  ON guest_subscriptions(expires_at);
