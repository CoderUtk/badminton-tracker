import { truncateName, formatGameScores, topStandings } from "../../src/lib/share/cardData";
import type { PlayerStat } from "../../src/repos/sessionRepo";

test("truncateName leaves short names untouched", () => {
  expect(truncateName("Alex Lee")).toBe("Alex Lee");
});

test("truncateName truncates long names with an ellipsis", () => {
  expect(truncateName("Alexandria Montgomery-Fitzgerald", 18)).toBe("Alexandria Montgo…");
});

test("formatGameScores maps each game to an A-B string", () => {
  expect(formatGameScores({ games: [{ A: 21, B: 15 }, { A: 18, B: 21 }, { A: 21, B: 19 }] }))
    .toEqual(["21-15", "18-21", "21-19"]);
});

test("formatGameScores returns an empty array for a null summary", () => {
  expect(formatGameScores(null)).toEqual([]);
});

test("topStandings returns at most n players, preserving input order", () => {
  const players: PlayerStat[] = [
    { id: "cp-a", name: "A", wins: 5, losses: 1, played: 6 },
    { id: "cp-b", name: "B", wins: 4, losses: 2, played: 6 },
    { id: "cp-c", name: "C", wins: 3, losses: 3, played: 6 },
    { id: "cp-d", name: "D", wins: 2, losses: 4, played: 6 },
  ];
  expect(topStandings(players, 3).map((p) => p.name)).toEqual(["A", "B", "C"]);
});

test("topStandings returns fewer than n when the input is shorter", () => {
  const players: PlayerStat[] = [{ id: "cp-a", name: "A", wins: 1, losses: 0, played: 1 }];
  expect(topStandings(players, 3)).toHaveLength(1);
});
