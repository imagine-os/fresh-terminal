-- Fresh Terminal D1 schema v4 (2026-09-29, C-089): the $5 starter kit.
-- starter_micro = the starter credit already folded into grant_micro. 0 means the
-- account still carries the old $1 column default. The router tops the grant up
-- (or down) to the Worker var ACCOUNT_STARTER_USD once per change, and lifts the
-- billing threshold to at least the new grant, so the starter kit and the
-- pass-through threshold are one number.
ALTER TABLE accounts ADD COLUMN starter_micro INTEGER NOT NULL DEFAULT 0;
