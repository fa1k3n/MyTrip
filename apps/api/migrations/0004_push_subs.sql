-- Phones that want notices for a trip (NT-03): who is a traveler id, "follower" for the common link, or "admin".
CREATE TABLE IF NOT EXISTS push_subs (trip_id TEXT NOT NULL, endpoint TEXT NOT NULL, who TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, PRIMARY KEY (trip_id, endpoint));
