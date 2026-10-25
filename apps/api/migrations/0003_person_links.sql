-- Personal links, one per traveler and trip, with the permission Resenär (traveler) or Planerare (planner) (AU-11).
CREATE TABLE IF NOT EXISTS person_links (trip_id TEXT NOT NULL, traveler_id TEXT NOT NULL, secret TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (trip_id, traveler_id));
