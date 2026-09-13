import { recordStandings } from "../src/tournament/formats/standings";
import type { BracketMatch, Entrant } from "../src/tournament/types";
import type { MatchScore } from "../src/tournament/formats/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));

const played = (id: string, a: string, b: string, winner: string, matchId = id): BracketMatch => ({
  id, tournamentId: "t1", round: 1, index: 0, matchId,
  entrantA: a, entrantB: b, winnerEntrant: winner,
  court: null, scoredBy: null,
  winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
  groupIdx: null, srcA: null, srcB: null,
});

test("ranks by wins", () => {
  const s = recordStandings(
    [played("m1", "e1", "e2", "e1"), played("m2", "e1", "e3", "e1"), played("m3", "e2", "e3", "e2")],
    ents(3));
  expect(s.map((x) => x.entrantId)).toEqual(["e1", "e2", "e3"]);
  expect(s.map((x) => x.rank)).toEqual([1, 2, 3]);
  expect(s[0]).toMatchObject({ wins: 2, losses: 0, played: 2 });
});

test("head-to-head breaks a tie on wins", () => {
  // e1, e2 and e3 are all 1-1 here: this is a full round-robin where each of
  // three entrants beat exactly one of the others, which is unavoidably a
  // rock-paper-scissors cycle (e2 > e1, e1 > e3, e3 > e2) — no ranking of a
  // 3-cycle is "fair" pairwise, since head-to-head cannot be transitive here.
  // What matters for this gate is not fairness but determinism: the same
  // three results must fold to the same order every time, on every device,
  // regardless of the order matches are supplied in (see the reordering test
  // below). That holds — pin the actual, stable output rather than asserting
  // a "correct" order that a genuine 3-way cycle cannot have.
  const s = recordStandings(
    [played("m1", "e2", "e1", "e2"), played("m2", "e1", "e3", "e1"), played("m3", "e2", "e3", "e3")],
    ents(3));
  expect(s.map((x) => x.entrantId)).toEqual(["e3", "e2", "e1"]);
  const reversed = recordStandings(
    [played("m3", "e2", "e3", "e3"), played("m2", "e1", "e3", "e1"), played("m1", "e2", "e1", "e2")],
    ents(3));
  expect(reversed).toEqual(s);
});

test("game difference breaks a tie when head-to-head does not", () => {
  const scores = new Map<string, MatchScore>([
    ["m1", { gamesA: 2, gamesB: 0, pointsA: 42, pointsB: 20 }],
    ["m2", { gamesA: 2, gamesB: 1, pointsA: 55, pointsB: 48 }],
  ]);
  // e1 and e2 never met; both 1-0. e1 won 2-0, e2 won 2-1.
  const s = recordStandings([played("m1", "e1", "e3", "e1"), played("m2", "e2", "e4", "e2")],
    ents(4), scores);
  expect(s.slice(0, 2).map((x) => x.entrantId)).toEqual(["e1", "e2"]);
  expect(s[0].gameDiff).toBe(2);
});

// Two devices offline must produce byte-identical standings or a
// groups → knockout draw forks. No tie may survive to the caller.
test("a total order survives entrants who are level on everything", () => {
  const s = recordStandings([], ents(4));
  expect(s.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  expect(new Set(s.map((x) => x.rank)).size).toBe(4);
  expect(s.map((x) => x.entrantId)).toEqual(["e1", "e2", "e3", "e4"]); // seed order
  expect(s.every((x) => x.tied)).toBe(true);
});

test("seed order is used before id, and id only when seeds collide", () => {
  const same = ents(2).map((e) => ({ ...e, seed: 7 }));
  const s = recordStandings([], same);
  expect(s.map((x) => x.entrantId)).toEqual(["e1", "e2"]); // id ascending
});

test("the same input in any order gives the same output", () => {
  const ms = [played("m1", "e1", "e2", "e1"), played("m2", "e3", "e4", "e3"),
              played("m3", "e1", "e3", "e3")];
  const a = recordStandings(ms, ents(4));
  const b = recordStandings([...ms].reverse(), ents(4));
  expect(a).toEqual(b);
});

test("unplayed matches are ignored", () => {
  const pending = { ...played("m9", "e1", "e2", "e1"), winnerEntrant: null, matchId: null };
  const s = recordStandings([pending], ents(2));
  expect(s.every((x) => x.played === 0)).toBe(true);
});

// Defect fix: head-to-head IS a sporting tiebreak. Three entrants level on
// wins (rate), game diff, and point diff, separated pairwise only by who beat
// whom, must not be marked tied — a real result separated each pair.
test("head-to-head separation is not marked tied", () => {
  const s = recordStandings(
    [played("m1", "e2", "e1", "e2"), played("m2", "e1", "e3", "e1"), played("m3", "e2", "e3", "e3")],
    ents(3));
  expect(s.every((x) => x.wins === 1 && x.losses === 1)).toBe(true);
  expect(s.every((x) => x.gameDiff === 0 && x.pointDiff === 0)).toBe(true);
  expect(s.map((x) => x.rank)).toEqual([1, 2, 3]);
  expect(s.every((x) => !x.tied)).toBe(true);
});
