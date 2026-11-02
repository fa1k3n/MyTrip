-- The cost of each AI call, per month and person, for the spending caps and the usage overview (AI-03).
CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY, month TEXT NOT NULL, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ai_usage_month ON ai_usage (month);
