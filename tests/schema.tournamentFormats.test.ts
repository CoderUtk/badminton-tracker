import { TOURNAMENT_DDL, TOURNAMENT_ALTER_DDL, TOURNAMENT_FORMATS_DDL } from "../src/db/schema";

const statements = TOURNAMENT_FORMATS_DDL.split(";").map((s) => s.trim()).filter(Boolean);

const NEW_COLUMNS = [
  "win_to_match_id", "win_to_slot", "loss_to_match_id", "loss_to_slot",
  "group_idx", "src_a", "src_b", "group_count", "advance_per_group",
];

test("adds every column the format engine needs", () => {
  for (const col of NEW_COLUMNS) {
    expect(TOURNAMENT_FORMATS_DDL).toMatch(new RegExp(`ADD COLUMN ${col}\\b`));
  }
});

test("one ALTER per statement — SQLite has no multi-column ADD COLUMN", () => {
  expect(statements.length).toBe(NEW_COLUMNS.length);
  for (const s of statements) {
    expect(s).toMatch(/^ALTER TABLE \w+ ADD COLUMN \w+ (TEXT|INTEGER)$/);
  }
});

test("no IF NOT EXISTS — SQLite does not support it on ADD COLUMN", () => {
  expect(TOURNAMENT_FORMATS_DDL).not.toMatch(/IF NOT EXISTS/i);
});

// Adding a column that is already in the CREATE TABLE aborts the whole
// migration with "duplicate column name", which fails the database open on
// fresh installs only. Same rule schema.tournaments.test.ts guards for
// TOURNAMENT_ALTER_DDL.
test("no new column is already in the base DDL or an earlier ALTER", () => {
  for (const col of NEW_COLUMNS) {
    expect(TOURNAMENT_DDL).not.toMatch(new RegExp(`\\b${col}\\b`));
    expect(TOURNAMENT_ALTER_DDL).not.toMatch(new RegExp(`\\b${col}\\b`));
  }
});
