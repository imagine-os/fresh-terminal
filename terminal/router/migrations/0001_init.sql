-- Fresh Terminal D1 schema v1 (2026-09-29).
-- Signed-in accounts, box metadata + interface state, and a mirror of each
-- account's hash-linked ledger. Every row has a stable id and updated_at so
-- realtime / multiplayer can build on it later. Times are Unix milliseconds.

CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,              -- our id: "acct_" + clerk user id
  clerk_user_id TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boxes (
  id          TEXT PRIMARY KEY,                -- the box id the browser minted
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  name        TEXT NOT NULL,
  state_json  TEXT NOT NULL DEFAULT '{}',      -- nav, pages, box ui, glossary (JSON)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,                -- last writer wins on this value
  deleted_at  INTEGER                          -- soft delete; NULL while live
);
CREATE INDEX IF NOT EXISTS boxes_account_updated ON boxes (account_id, updated_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
  account_id       TEXT NOT NULL REFERENCES accounts(id),
  id               TEXT NOT NULL,              -- entry id from the browser chain
  box_id           TEXT NOT NULL,
  kind             TEXT NOT NULL,
  what             TEXT NOT NULL,
  model            TEXT NOT NULL DEFAULT '',
  units            INTEGER NOT NULL,
  unit_kind        TEXT NOT NULL,
  cost_micro       INTEGER NOT NULL,
  price_micro      INTEGER NOT NULL,
  ref              TEXT NOT NULL DEFAULT '',
  prev_hash        TEXT NOT NULL,
  hash             TEXT NOT NULL,
  shared_prev_hash TEXT,
  shared_hash      TEXT,
  created_at       INTEGER NOT NULL,           -- when the entry was chained
  updated_at       INTEGER NOT NULL,           -- when the mirror received it (entries are append-only)
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS ledger_account_updated ON ledger_entries (account_id, updated_at);
