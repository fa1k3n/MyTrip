-- The beta (US-27, US-28): feedback sent with "Tyck till", and which of a trip's four pages a consenting user opened on a day.
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage (trip_id TEXT NOT NULL, who TEXT NOT NULL, tab TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (trip_id, who, tab, day));
