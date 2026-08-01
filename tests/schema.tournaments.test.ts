import { TOURNAMENT_DDL, TOURNAMENT_ALTER_DDL } from "../src/db/schema";
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
