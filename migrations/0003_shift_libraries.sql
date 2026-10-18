PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shift_libraries (
  user_id TEXT PRIMARY KEY,
  presets_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
