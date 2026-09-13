import { roundRobin, circleRounds } from "../src/tournament/formats/roundRobin";
import type { Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n: number) => {
  let k = 0;
  return roundRobin.build({ entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}` });
};

test.each([[3, 3], [4, 6], [5, 10], [6, 15], [8, 28]])(
  "%i entrants produce %i matches", (n, expected) => {
    expect(build(n).length).toBe(expected);
    expect(roundRobin.matchCount(n)).toBe(expected);
  });

test("every pairing appears exactly once", () => {
  const b = build(6);
  const seen = b.map((m) => [m.entrantA, m.entrantB].sort().join("~"));
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen.length).toBe(15);
});

test("no match routes anywhere — standings decide, not edges", () => {
  for (const m of build(6)) {
    expect(m.winToMatchId).toBeNull();
    expect(m.lossToMatchId).toBeNull();
    expect(m.srcA).toBeNull();
  }
});

test("nobody plays twice in the same round", () => {
  const b = build(8);
  const rounds = new Map<number, string[]>();
  for (const m of b) {
    const list = rounds.get(m.round) ?? [];
    list.push(m.entrantA!, m.entrantB!);
    rounds.set(m.round, list);
  }
  for (const [, ids] of rounds) expect(new Set(ids).size).toBe(ids.length);
});

test("with odd entrants the bye rotates and no bye match is created", () => {
  const b = build(5);
  expect(b.every((m) => m.entrantA && m.entrantB)).toBe(true);
  const sits = new Map<string, number>();
  const rounds = new Set(b.map((m) => m.round));
  for (const r of rounds) {
    const playing = new Set(b.filter((m) => m.round === r).flatMap((m) => [m.entrantA!, m.entrantB!]));
    for (const e of ents(5)) if (!playing.has(e.id)) sits.set(e.id, (sits.get(e.id) ?? 0) + 1);
  }
  expect([...sits.values()]).toEqual([1, 1, 1, 1, 1]);
});

test("circleRounds covers all pairings for an even count", () => {
  const rounds = circleRounds(["a", "b", "c", "d"]);
  expect(rounds.length).toBe(3);
  expect(rounds.flat().length).toBe(6);
});

test("status is done only when every match has a winner", () => {
  const b = build(3);
  expect(roundRobin.status(b).status).toBe("pending");
  const all = b.map((m) => ({ ...m, winnerEntrant: m.entrantA }));
  const done = roundRobin.status(all);
  expect(done.status).toBe("done");
  expect(done.champion).toBe("e1");
});
