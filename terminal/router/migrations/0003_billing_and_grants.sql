-- Fresh Terminal D1 schema v3 (2026-09-29): pass-through billing gate, friend
-- credits (admin grants and invite codes). Money is integer micro-dollars.
-- Times are Unix ms. Every row has a stable id and updated_at.

-- Account billing. The account's credit limit is min(grant_micro, billing_threshold_micro):
-- past it, paid calls answer 402 payment_required until a payment provider tops the
-- account up. Grants, invite codes and paid top-ups raise the grant, and raise the
-- threshold to at least the new grant, so a gift is always spendable.
-- billing_state: free | needs_payment | active.
ALTER TABLE accounts ADD COLUMN billing_threshold_micro INTEGER NOT NULL DEFAULT 5000000;
ALTER TABLE accounts ADD COLUMN billing_state TEXT NOT NULL DEFAULT 'free';
-- What a payment provider has charged this account in total (0 until one is connected).
ALTER TABLE accounts ADD COLUMN paid_micro INTEGER NOT NULL DEFAULT 0;

-- Every credit that lands on an account: an admin grant, an invite code, or a paid top-up.
CREATE TABLE IF NOT EXISTS credit_grants (
  id            TEXT PRIMARY KEY,              -- "grant_" + uuid
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  clerk_user_id TEXT NOT NULL,
  amount_micro  INTEGER NOT NULL,
  source        TEXT NOT NULL,                 -- admin | invite | topup
  invite_code   TEXT,                          -- set when source = invite
  granted_by    TEXT NOT NULL,                 -- Clerk user id of the admin (for invites: who made the code)
  note          TEXT NOT NULL DEFAULT '',
  ref           TEXT NOT NULL DEFAULT '',      -- provider reference for top-ups (unique per payment)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS credit_grants_account ON credit_grants (account_id, created_at);
CREATE INDEX IF NOT EXISTS credit_grants_created ON credit_grants (created_at);
-- A provider payment (Stripe Checkout session id) credits once.
CREATE UNIQUE INDEX IF NOT EXISTS credit_grants_ref ON credit_grants (ref) WHERE ref != '';

-- Redeemable invite codes: worth amount_micro each, max_uses times.
CREATE TABLE IF NOT EXISTS invite_codes (
  code         TEXT PRIMARY KEY,               -- e.g. FT-7K2M-QX9P (upper case)
  amount_micro INTEGER NOT NULL,
  max_uses     INTEGER NOT NULL,
  uses         INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL,                  -- Clerk user id of the admin
  note         TEXT NOT NULL DEFAULT '',
  expires_at   INTEGER,                        -- NULL = no expiry
  disabled     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- One redemption per account per code.
CREATE TABLE IF NOT EXISTS invite_redemptions (
  code       TEXT NOT NULL REFERENCES invite_codes(code),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  grant_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (code, account_id)
);
