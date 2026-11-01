-- Commons lookups for wish images, shared by all trips and keyed by the normalised title (DB-11).
CREATE TABLE IF NOT EXISTS image_cache (key TEXT PRIMARY KEY, json TEXT NOT NULL);
