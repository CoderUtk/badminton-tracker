import { TOURNAMENT_DDL } from "../src/db/schema";
test("tournament DDL declares the three tables", () => {
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS tournaments/);
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS tournament_entrants/);
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS bracket_matches/);
});
