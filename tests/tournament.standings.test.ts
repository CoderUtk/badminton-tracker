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
  // e1 and e2 are the pair under test: both end 1-1 (rate .5) and played each
  // other directly, with e2 winning that match — e2 must outrank e1. e3 and
  // e4 exist only to give e1 and e2 their compensating result without the two
  // of them meeting a third time (which, with only 3 entrants, forces an
  // unresolvable rock-paper-scissors cycle instead of a genuine tiebreak —
  // see the cycle-specific tests below). e3 and e4 end up at clearly
  // different, non-tied rates, so the whole order is fully determined:
  // e4 (1-0) > e2 (1-1, beat e1) > e1 (1-1, lost to e2) > e3 (0-1).
  const s = recordStandings(
    [played("m1", "e2", "e1", "e2"), played("m2", "e1", "e3", "e1"), played("m3", "e4", "e2", "e4")],
    ents(4));
  expect(s.map((x) => x.entrantId)).toEqual(["e4", "e2", "e1", "e3"]);
  const e1 = s.find((x) => x.entrantId === "e1")!;
  const e2 = s.find((x) => x.entrantId === "e2")!;
  expect(e1.wins).toBe(e2.wins);
  expect(e1.losses).toBe(e2.losses);
  expect(e2.rank).toBeLessThan(e1.rank);
  expect(e1.tied).toBe(false);
  expect(e2.tied).toBe(false);
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

// The head-to-head comparison used to be a pairwise "x beat y" test inside
// the sort comparator. That is not transitive: e2 beat e1, e1 beat e3, e3
// beat e2 is a genuine rock-paper-scissors cycle, and Array.prototype.sort's
// result for a non-transitive comparator depends on the incoming order of
// the array being sorted — here, the order entrants happen to be listed in.
// Two offline devices with identical match results but a different entrant
// fetch order would then compute different knockout draws, which is exactly
// the fork this whole feature exists to prevent. Head-to-head must be folded
// into a scalar per-entrant key before sorting so the comparator is
// transitive and the result cannot depend on entrant order.
test("a head-to-head cycle ranks identically regardless of entrant array order", () => {
  const ms = [played("m1", "e2", "e1", "e2"), played("m2", "e1", "e3", "e1"), played("m3", "e3", "e2", "e3")];
  const natural = ents(3);
  const shuffled = [natural[2], natural[0], natural[1]]; // [e3, e1, e2]
  const reversed = [...natural].reverse(); // [e3, e2, e1]

  const a = recordStandings(ms, natural);
  const b = recordStandings(ms, shuffled);
  const c = recordStandings(ms, reversed);
  expect(b).toEqual(a);
  expect(c).toEqual(a);

  // A genuine 3-way cycle sportingly separates no one: everyone is 1-1 with
  // one win inside the tied group, so the order falls all the way through to
  // seed, and the UI should present them as level.
  expect(a.map((x) => x.entrantId)).toEqual(["e1", "e2", "e3"]); // seed order
  expect(a.every((x) => x.tied)).toBe(true);
});

test("unplayed matches are ignored", () => {
  const pending = { ...played("m9", "e1", "e2", "e1"), winnerEntrant: null, matchId: null };
  const s = recordStandings([pending], ents(2));
  expect(s.every((x) => x.played === 0)).toBe(true);
});

// Defect fix: head-to-head IS a sporting tiebreak. Two entrants level on
// wins (rate), game diff, and point diff, separated only by who beat whom,
// must not be marked tied — a real result separated them. (Same fixture as
// "head-to-head breaks a tie on wins" above — deliberately not a cycle, so
// head-to-head actually decides instead of degenerating to "everyone ties".)
test("head-to-head separation is not marked tied", () => {
  const s = recordStandings(
    [played("m1", "e2", "e1", "e2"), played("m2", "e1", "e3", "e1"), played("m3", "e4", "e2", "e4")],
    ents(4));
  const e1 = s.find((x) => x.entrantId === "e1")!;
  const e2 = s.find((x) => x.entrantId === "e2")!;
  expect(e1.wins).toBe(e2.wins);
  expect(e1.losses).toBe(e2.losses);
  expect(e1.gameDiff).toBe(e2.gameDiff);
  expect(e1.pointDiff).toBe(e2.pointDiff);
  expect(e2.rank).toBeLessThan(e1.rank);
  expect(e1.tied).toBe(false);
  expect(e2.tied).toBe(false);
});

// A group part-way through: e1 has won once, e2 and e3 have lost to nobody
// because they have not played, and e4 has lost. `rate` maps "no matches" and
// "played and lost" to the same 0, so e2/e3/e4 used to come back all marked
// tied — the LEVEL chip appeared next to a 0–0 row and a 0–1 row at the same
// time, which reads as nonsense. Only rows with the same match count, and so
// the same visible W–L, may be called level.
test("a row that has played is never level with one that has not", () => {
  const s = recordStandings([played("m1", "e1", "e4", "e1")], ents(4));
  const by = Object.fromEntries(s.map((x) => [x.entrantId, x]));
  expect(by.e1.tied).toBe(false);          // 1–0, alone on its rate
  expect(by.e4.tied).toBe(false);          // 0–1, played once
  expect(by.e2.played).toBe(0);
  expect(by.e3.played).toBe(0);
  // e2 and e3 have both played nothing and are genuinely indistinguishable.
  expect(by.e2.tied).toBe(true);
  expect(by.e3.tied).toBe(true);
});
