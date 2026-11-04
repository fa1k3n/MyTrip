-- Failed logins per address and per account, so the limit holds across server instances (SP-11, AU-05, US-08).
CREATE TABLE IF NOT EXISTS login_fails (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_fails_key ON login_fails (key, at);
