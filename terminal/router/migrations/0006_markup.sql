-- Fresh Terminal D1 schema v6 (2026-09-29, C-105): pay what you want.
--
-- markup_bp: the account's own markup on model spend past the starter kit, in basis
-- points over model cost (1000 = 10%). NULL = the default from the route table
-- (margin_bp, 1000). The router keeps it between 500 (5%, so card fees are covered)
-- and 10000 (100%). The person sets it in Settings (PUT /me/markup).
ALTER TABLE accounts ADD COLUMN markup_bp INTEGER;
