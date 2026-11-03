-- DP-13: recorded AI answers, replayed on a test instance (AI_REPLAY=1); empty on live.
CREATE TABLE IF NOT EXISTS ai_replay (key TEXT PRIMARY KEY, json TEXT NOT NULL, at TEXT NOT NULL);
