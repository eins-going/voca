-- VOCA D1 스키마
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day INTEGER NOT NULL,
  num INTEGER NOT NULL,
  word TEXT NOT NULL UNIQUE,
  meaning TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_code TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  scope TEXT,
  mode TEXT,
  total INTEGER,
  correct INTEGER,
  pct INTEGER,
  wrong_words TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS results_sync ON results (sync_code, taken_at DESC);

CREATE TABLE IF NOT EXISTS wrong_notes (
  sync_code TEXT NOT NULL,
  word TEXT NOT NULL,
  wrong_count INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0,
  last_wrong TEXT,
  PRIMARY KEY (sync_code, word)
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  day INTEGER
);
