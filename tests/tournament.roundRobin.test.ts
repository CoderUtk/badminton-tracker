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

test.each([[3, 3], [4, 6], [5, 10], [6, 15], [8, 28], [9, 36]])(
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

test("a 3-way win cycle names the real seed's champion, never a positional one", () => {
  const real = ents(3); // e1 seed 1, e2 seed 2, e3 seed 3
  const b = build(3);
  // build(3) pairs, in bracket order: (e2,e3), (e1,e3), (e1,e2).
  // Bracket-appearance dedup order is therefore e2, e3, e1 — so a positional
  // reconstruction would seed e2 first. Make a cycle (e1 beats e2, e2 beats
  // e3, e3 beats e1) so every entrant ties on win rate and on the mini-league
  // head-to-head count, forcing the decision onto the next tiebreak: real
  // seed (favours e1) vs. fabricated positional seed (favours e2) disagree.
  const winners: Record<string, string> = {
    [`${b[0].entrantA}~${b[0].entrantB}`]: b[0].entrantA!, // e2 beats e3
    [`${b[1].entrantA}~${b[1].entrantB}`]: b[1].entrantB!, // e3 beats e1
    [`${b[2].entrantA}~${b[2].entrantB}`]: b[2].entrantA!, // e1 beats e2
  };
  const cyclic = b.map((m) => ({ ...m, winnerEntrant: winners[`${m.entrantA}~${m.entrantB}`] }));

  const table = roundRobin.standings(cyclic, real);
  expect(table[0].entrantId).toBe("e1"); // real seed 1 wins the sporting tie

  const withReal = roundRobin.status(cyclic, real);
  expect(withReal.champion).toBe(table[0].entrantId);

  const withoutEntrants = roundRobin.status(cyclic);
  expect(withoutEntrants.champion).not.toBe("e2"); // the positional-seed answer
  expect(withoutEntrants.champion).toBeNull(); // honest: no sporting tiebreak decided it
});
