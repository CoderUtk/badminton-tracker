// Tournament tables. Appended to the migration list in db.ts.
// Column `idx` (not `index`, which is reserved) maps to BracketMatch.index in tournamentRepo.
export const TOURNAMENT_DDL = `
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY, club_id TEXT NOT NULL, name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single_elim', size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tournament_entrants (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, club_player_id TEXT NOT NULL,
  seed INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bracket_matches (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, round INTEGER NOT NULL,
  idx INTEGER NOT NULL, match_id TEXT, entrant_a TEXT, entrant_b TEXT,
  winner_entrant TEXT
);
CREATE INDEX IF NOT EXISTS idx_bracket_tournament ON bracket_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_entrants_tournament ON tournament_entrants(tournament_id);
`;

// Doubles + per-round games config, plus live-ops court/scorer columns. Runs
// once (via user_version) after the base tournament tables — added as ALTERs so
// existing installs upgrade cleanly and fresh installs (which created the base
// tables above without these columns) get them too, with no duplicate-column
// conflict.
//
// Every column named here MUST be absent from TOURNAMENT_DDL above. Adding one
// to both runs ALTER against a column that already exists, and SQLite's
// "duplicate column name" aborts the whole migration — which fails the database
// open outright, on fresh installs only. Guarded by a test in
// tests/schema.tournaments.test.ts.
export const TOURNAMENT_ALTER_DDL = `
ALTER TABLE tournaments ADD COLUMN match_type TEXT NOT NULL DEFAULT 'singles';
ALTER TABLE tournaments ADD COLUMN bestof INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournaments ADD COLUMN finals_bestof INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournament_entrants ADD COLUMN club_player_id_2 TEXT;
ALTER TABLE bracket_matches ADD COLUMN court TEXT;
ALTER TABLE bracket_matches ADD COLUMN scored_by TEXT;
`;

// Court count per tournament. A SEPARATE migration entry, appended to the list
// in db.ts — never folded into the constants above. Editing an already-applied
// migration does not re-run it (user_version has moved past), so existing
// installs would never get the column.
export const TOURNAMENT_COURTS_DDL = `
ALTER TABLE tournaments ADD COLUMN courts INTEGER NOT NULL DEFAULT 4;
`;

// Personal-club flag. A SEPARATE migration entry appended to the list in
// db.ts — editing an applied migration does not re-run it, so existing
// installs would never get the column.
export const CLUBS_PERSONAL_DDL = `
ALTER TABLE clubs_cache ADD COLUMN personal INTEGER NOT NULL DEFAULT 0;
`;

// Indexes for the matches table, which migration 0 created with nothing beyond
// its primary key. It is the fastest-growing table in the app (one row per
// game) and every list query both filters and sorts over it:
//   listMatchesForSession  where session_id = ? order by created_at desc
//   listMatchesForClub     where club_id = ?    order by created_at desc
//   listMatches            order by created_at desc limit 100
//   listAllMatches         order by created_at desc
// A composite (column, created_at desc) satisfies the filter AND the sort from
// one index, so SQLite skips the sort step rather than scanning and sorting.
//
// match_events needs nothing: its primary key (match_id, seq) already serves
// loadEvents' "where match_id = ? order by seq".
//
// A SEPARATE migration entry appended to the list in db.ts — editing an
// applied migration does not re-run it, so existing installs would never get
// these.
export const MATCH_INDEXES_DDL = `
create index if not exists matches_session_created on matches (session_id, created_at desc);
create index if not exists matches_club_created on matches (club_id, created_at desc);
create index if not exists matches_created on matches (created_at desc);
`;

// Profile and analytics caches.
//
// profile_cache: getMyProfile() previously made two network calls (auth.getUser
// then a profiles select) on EVERY call, from five call sites — including Gate,
// which blocks routing on it, and Home, which calls it twice per reload.
// Single row: only the signed-in user's profile is ever cached here, and
// sign-out clears it.
//
// analytics_cache: getPlayerAnalytics() read every match on the device and
// recomputed ~25 lifetime aggregates on every Home focus. `payload` is the
// serialised PlayerAnalytics (see src/analytics/serialize.ts — it carries a
// Set, which raw JSON.stringify would silently drop). `fingerprint` is a cheap
// aggregate over the completed-match rows the computation actually reads.
//
// A SEPARATE migration entry appended to the list in db.ts.
export const PROFILE_ANALYTICS_CACHE_DDL = `
create table if not exists profile_cache (
  id text primary key,
  display_name text not null default '',
  display_name_set integer not null default 0,
  age integer,
  hand text,
  avatar_url text,
  username text not null default ''
);
create table if not exists analytics_cache (
  name text primary key,
  fingerprint text not null,
  payload text not null,
  computed_at integer not null
);
`;
