-- Cover images in D1 instead of R2 (DP-05). An image is split into parts, because D1 limits one SQL statement to 100 KB.
CREATE TABLE IF NOT EXISTS images (name TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (name, part));
