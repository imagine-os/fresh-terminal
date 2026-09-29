-- Fresh Terminal D1 schema v2 (2026-09-29): free credits enforced by the router.
-- Money is integer micro-dollars. "price" is what the person is charged (cost plus
-- margin); "cost" is what the provider charged us. Times are Unix ms.

-- One row per anonymous browser. The id is issued by the router and signed
-- (HMAC) so it cannot be made up; the IP is stored only as a salted hash.
CREATE TABLE IF NOT EXISTS anon_devices (
  id            TEXT PRIMARY KEY,
  ip_hash       TEXT NOT NULL,
  net_hash      TEXT NOT NULL,               -- /24 for IPv4, /48 for IPv6
  grant_micro   INTEGER NOT NULL,            -- starter grant plus any soft-prompt chances
  spent_micro   INTEGER NOT NULL DEFAULT 0,  -- price charged against the grant
  cost_micro    INTEGER NOT NULL DEFAULT 0,  -- our provider cost
  chances_used  INTEGER NOT NULL DEFAULT 0,  -- soft sign-in prompts shown (each adds a small chance)
  limited       INTEGER NOT NULL DEFAULT 0,  -- 1 = issued past the per-IP / per-network limit (no grant)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS anon_devices_ip ON anon_devices (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS anon_devices_net ON anon_devices (net_hash, created_at);

-- Signed-in accounts get their own grant.
ALTER TABLE accounts ADD COLUMN grant_micro INTEGER NOT NULL DEFAULT 1000000;
ALTER TABLE accounts ADD COLUMN spent_micro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN cost_micro INTEGER NOT NULL DEFAULT 0;

-- Global spend per UTC day and scope ('anon' | 'account'), for the daily cap.
CREATE TABLE IF NOT EXISTS spend_daily (
  day         TEXT NOT NULL,                 -- YYYY-MM-DD (UTC)
  scope       TEXT NOT NULL,
  cost_micro  INTEGER NOT NULL DEFAULT 0,
  price_micro INTEGER NOT NULL DEFAULT 0,
  calls       INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (day, scope)
);
