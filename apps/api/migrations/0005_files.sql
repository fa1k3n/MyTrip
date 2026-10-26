-- Ticket files of bookings (BK-13), apart from the trip data. A file is split into parts like cover images (DP-05).
CREATE TABLE IF NOT EXISTS files (id TEXT NOT NULL, part INTEGER NOT NULL, trip_id TEXT NOT NULL, type TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, part));
