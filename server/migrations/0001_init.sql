-- Game7 friends: who is who, who knows whom, and who beat whom.
--
-- A user is a name and a friend code on one phone. There is no email and no password: the phone
-- holds a random token and the server keeps only its SHA-256, so a leaked table signs nobody in.

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  seen_at    INTEGER NOT NULL
);

-- One row per pair, stored with a < b so the pair cannot be written twice in two orders.
-- status: 'pending' (requested_by is waiting on the other) or 'friends'.
CREATE TABLE friends (
  a            TEXT NOT NULL,
  b            TEXT NOT NULL,
  status       TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX friends_b ON friends (b);

-- A challenge and, once accepted, the room it is played in. a is the challenger and sits in
-- chair 0; b sits in chair 1.
-- status: 'invited' -> 'live' -> 'closed', or 'declined'.
CREATE TABLE matches (
  id         TEXT PRIMARY KEY,
  a          TEXT NOT NULL,
  b          TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX matches_a ON matches (a, status);
CREATE INDEX matches_b ON matches (b, status);

-- One row per series played in a room. A rematch in the same room is round + 1.
CREATE TABLE results (
  match  TEXT NOT NULL,
  round  INTEGER NOT NULL,
  winner TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (match, round)
);
