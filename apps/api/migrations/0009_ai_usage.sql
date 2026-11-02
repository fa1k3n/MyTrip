-- The cost of each AI call, per month and person, for the spending caps and the usage overview (AI-03).
CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, month TEXT NOT NULL, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ai_usage_month ON ai_usage (month);
-- The latest run of each AI helper per trip, with the fingerprint of the data it used (AI-68, AI-69).
CREATE TABLE IF NOT EXISTS ai_helpers (trip_id TEXT NOT NULL, helper TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (trip_id, helper));
