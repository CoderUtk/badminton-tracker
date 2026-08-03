import { TOURNAMENT_DDL, TOURNAMENT_ALTER_DDL, TOURNAMENT_COURTS_DDL } from "../src/db/schema";
test("tournament DDL declares the three tables", () => {
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS tournaments/);
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS tournament_entrants/);
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS bracket_matches/);
});
test("tournament ALTER adds match_type, bestof, finals_bestof, club_player_id_2", () => {
  expect(TOURNAMENT_ALTER_DDL).toMatch(/match_type/);
  expect(TOURNAMENT_ALTER_DDL).toMatch(/bestof/);
  expect(TOURNAMENT_ALTER_DDL).toMatch(/finals_bestof/);
  expect(TOURNAMENT_ALTER_DDL).toMatch(/club_player_id_2/);
});
test("tournament ALTER adds the live-ops court and scorer columns", () => {
  expect(TOURNAMENT_ALTER_DDL).toMatch(/ALTER TABLE bracket_matches ADD COLUMN court TEXT/);
  expect(TOURNAMENT_ALTER_DDL).toMatch(/ALTER TABLE bracket_matches ADD COLUMN scored_by TEXT/);
});

test("courts is added by its own migration, not the base DDL", () => {
  expect(TOURNAMENT_COURTS_DDL).toMatch(/ALTER TABLE tournaments ADD COLUMN courts INTEGER NOT NULL DEFAULT 4/);
  // Same trap as court/scored_by below: declaring it in the CREATE TABLE too
  // makes the ALTER hit "duplicate column name" on every fresh install.
  expect(TOURNAMENT_DDL).not.toMatch(/courts/);
  expect(TOURNAMENT_ALTER_DDL).not.toMatch(/courts/);
});

// Regression: court/scored_by were once declared in BOTH the CREATE TABLE and
// the ALTER list. On a fresh install the ALTER then hit "duplicate column name",
// which aborts the migration transaction and fails the whole database open —
// the app started with no local storage at all. Existing installs were fine,
// so it only reproduced on a clean device.
test("no column is declared in both the CREATE TABLE and the ALTER list", () => {
  const created = new Map<string, string[]>();
  for (const [, table, body] of TOURNAMENT_DDL.matchAll(
    /CREATE TABLE IF NOT EXISTS (\w+) \(([^)]*)\)/g,
  )) {
    created.set(
      table,
      body.split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean),
    );
  }
  for (const [, table, column] of TOURNAMENT_ALTER_DDL.matchAll(
    /ALTER TABLE (\w+) ADD COLUMN (\w+)/g,
  )) {
    expect(created.get(table) ?? []).not.toContain(column);
  }
});
