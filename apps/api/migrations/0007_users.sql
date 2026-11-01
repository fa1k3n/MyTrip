-- Accounts (US-01), the owner of each trip (US-13) and the account address tied to a traveler's personal link (US-21).
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trip_owners (trip_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
ALTER TABLE person_links ADD COLUMN account TEXT;
