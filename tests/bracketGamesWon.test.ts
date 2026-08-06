import { gamesWonBy } from "../src/tournament/score";

test("counts games won by a side", () => {
  const games = [{ A: 21, B: 15 }, { A: 18, B: 21 }, { A: 21, B: 12 }];
  expect(gamesWonBy(games, "A")).toBe(2);
  expect(gamesWonBy(games, "B")).toBe(1);
});

test("returns 0 for no games", () => {
  expect(gamesWonBy([], "A")).toBe(0);
});
