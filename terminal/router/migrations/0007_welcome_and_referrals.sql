-- Fresh Terminal D1 schema v7 (2026-09-29, C-106, C-107): the $5 welcome credit once per
-- person, and referrals.
--
-- starter_state: legacy (accounts from before this migration keep what they have) |
-- pending (a new account; decided on its first GET /credits or paid call) | granted |
-- blocked. starter_reason is internal (why it was blocked or is pending); people see an
-- honest line, never the reason code. email_norm: the verified email, normalised
-- (lowercase, +tag removed, Gmail dots removed) so aliases count as one person.
ALTER TABLE accounts ADD COLUMN starter_state TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE accounts ADD COLUMN starter_reason TEXT;
ALTER TABLE accounts ADD COLUMN email_norm TEXT;
ALTER TABLE accounts ADD COLUMN referral_code TEXT;
ALTER TABLE accounts ADD COLUMN referred_by TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_referral_code ON accounts (referral_code) WHERE referral_code IS NOT NULL;

-- One welcome credit per email (normalised) and per signed browser device: the first account wins.
CREATE TABLE IF NOT EXISTS welcome_claims (
  key         TEXT PRIMARY KEY,                -- "email:<normalised>" or "device:<device id>"
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  created_at  INTEGER NOT NULL
);

-- Welcome credits given per /24 (IPv4) or /48 (IPv6) network per UTC day (limit WELCOME_PER_NET_DAILY, default 5).
CREATE TABLE IF NOT EXISTS welcome_net_daily (
  day  TEXT NOT NULL,
  net  TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, net)
);

-- Referrals: the friend gets $5 extra on claiming; the referrer gets $5 once the friend has spent
-- their free $5 or bought credits, then 50% of our markup on the friend's paid usage for 12 months.
CREATE TABLE IF NOT EXISTS referrals (
  id                  TEXT PRIMARY KEY,        -- "ref_" + uuid
  referrer_account    TEXT NOT NULL REFERENCES accounts(id),
  friend_account      TEXT NOT NULL REFERENCES accounts(id),
  state               TEXT NOT NULL,           -- pending | rewarded | capped | refused | reversed
  reason              TEXT,                    -- internal: why refused, capped or reversed
  bonus_micro         INTEGER NOT NULL DEFAULT 0,
  reward_micro        INTEGER NOT NULL DEFAULT 0,
  share_accrued_micro INTEGER NOT NULL DEFAULT 0,
  share_paid_micro    INTEGER NOT NULL DEFAULT 0,
  share_until         INTEGER,
  created_at          INTEGER NOT NULL,
  rewarded_at         INTEGER,
  updated_at          INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_friend_live ON referrals (friend_account) WHERE state != 'refused';
CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals (referrer_account, rewarded_at);
