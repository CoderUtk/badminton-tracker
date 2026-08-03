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
