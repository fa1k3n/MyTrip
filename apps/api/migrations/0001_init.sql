-- Trip platform on Cloudflare D1 (DP-03, DP-04). Each trip is one row with its JSON; the revision column guards against lost updates.
CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS links (trip_id TEXT PRIMARY KEY, secret TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS proposals_trip ON proposals (trip_id, at);
CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL);
