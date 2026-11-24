/**
 * Database schema. Applied idempotently on first access.
 *
 * SQLite is the reference store; every query goes through the repository
 * modules in this folder so a Postgres swap only touches this layer.
 */
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    INTEGER NOT NULL,
  onboarded_at  INTEGER,
  preferences   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol   TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  day     TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, day)
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  direction  TEXT NOT NULL,
  entry      REAL NOT NULL,
  size       REAL NOT NULL,
  stop       REAL,
  take_profit REAL,
  opened_at  INTEGER NOT NULL,
  closed_at  INTEGER,
  exit_price REAL,
  pnl        REAL,
  pnl_pct    REAL,
  setup_id   TEXT,
  notes      TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_positions_user ON paper_positions(user_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS journal_entries (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol      TEXT NOT NULL,
  direction   TEXT NOT NULL,
  entry       REAL NOT NULL,
  exit_price  REAL NOT NULL,
  stop        REAL,
  take_profit REAL,
  size        REAL NOT NULL,
  strategy    TEXT NOT NULL,
  result      TEXT NOT NULL,
  pnl         REAL NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  opened_at   INTEGER NOT NULL,
  closed_at   INTEGER NOT NULL,
  r_multiple  REAL
);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_entries(user_id, closed_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  value      REAL,
  note       TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

CREATE TABLE IF NOT EXISTS alert_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id    TEXT,
  symbol     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alert_events_user ON alert_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_setups (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_setups_user ON saved_setups(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  blocks     TEXT,
  sources    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at ASC);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`;
