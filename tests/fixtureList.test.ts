import { fixtureLabel, fixtureRounds } from "../src/tournament/fixtureList";
import type { BracketMatch } from "../src/tournament/types";

const blank = (round: number, index: number, entrantA: string, entrantB: string): BracketMatch => ({
  id: `${round}:${index}`, tournamentId: "t1", round, index, matchId: null,
  entrantA, entrantB, winnerEntrant: null, court: null, scoredBy: null,
  winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
  groupIdx: null, srcA: null, srcB: null,
});

test("groups matches by round ascending, ordered by index within a round", () => {
  const bracket = [
    blank(2, 1, "c", "d"), blank(1, 0, "a", "b"),
    blank(1, 1, "c", "d"), blank(2, 0, "a", "c"),
  ];
  const grouped = fixtureRounds(bracket);
  expect(grouped.map((g) => g.round)).toEqual([1, 2]);
  expect(grouped[0].matches.map((m) => m.index)).toEqual([0, 1]);
  expect(grouped[1].matches.map((m) => m.index)).toEqual([0, 1]);
});

test("an empty bracket produces no rounds", () => {
  expect(fixtureRounds([])).toEqual([]);
});

test("fixtureLabel names an unplayed fixture", () => {
  expect(fixtureLabel("Ana", "Bo", null)).toBe("Ana versus Bo, not yet played");
});

test("fixtureLabel names the winner once played", () => {
  expect(fixtureLabel("Ana", "Bo", "Ana")).toBe("Ana versus Bo, Ana won");
});
