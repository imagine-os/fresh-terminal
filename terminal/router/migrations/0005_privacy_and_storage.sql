-- Fresh Terminal D1 schema v5 (2026-09-29, C-090, C-091): privacy by default and
-- storage metering.
--
-- share_data: 0 = the account's content (stages, prompts, ledger lines) is private
-- from Fresh Terminal; admin endpoints show only aggregate numbers. The person turns
-- it on themselves. access_grants: a person can grant someone (for example Justin,
-- when they become a client) access to a scope for a while; revocable.
-- stored_bytes: what the account keeps in D1 (stages and ledger mirror), measured on
-- every sync write and on GET /credits. Billing above the free allowance is not wired.
ALTER TABLE accounts ADD COLUMN share_data INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN stored_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN stored_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS access_grants (
  id          TEXT PRIMARY KEY,               -- "ag_" + uuid
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  grantee     TEXT NOT NULL,                  -- a Clerk user id, or "fresh-terminal" for the team
  scope       TEXT NOT NULL,                  -- stages | ledger | all
  granted_at  INTEGER NOT NULL,
  expires_at  INTEGER,                        -- NULL = until revoked
  revoked_at  INTEGER,                        -- set when the person takes it back
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS access_grants_account ON access_grants (account_id, grantee);
