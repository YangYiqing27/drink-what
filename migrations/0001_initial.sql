CREATE TABLE IF NOT EXISTS app_state (
  client_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_state_updated_at_idx
  ON app_state(updated_at);
