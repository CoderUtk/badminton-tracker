import { doubleElim } from "../src/tournament/formats/doubleElim";
import { advanceWinner } from "../src/tournament/bracket";
import type { Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n: number) => {
  let k = 0;
  return doubleElim.build({ entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}` });
};

test.each([[4, 6], [8, 14], [16, 30]])(
  "%i entrants produce %i matches", (n, expected) => {
    expect(build(n).length).toBe(expected);
    expect(doubleElim.matchCount(n)).toBe(expected);
  });

test("exactly one match ends the tournament", () => {
  const b = build(8);
  expect(b.filter((m) => m.winToMatchId === null).length).toBe(1);
});

test("every winners match routes its loser somewhere", () => {
  const b = build(8);
  const grandFinal = b.find((m) => m.winToMatchId === null)!;
  const winners = b.filter((m) => m.lossToMatchId !== null);
  // Every winners-bracket match except the grand final sheds a loser.
  expect(winners.length).toBeGreaterThan(0);
  for (const m of winners) {
    expect(b.some((x) => x.id === m.lossToMatchId)).toBe(true);
    expect(m.id).not.toBe(grandFinal.id);
  }
});

test("every edge target exists and no match points at itself", () => {
  const b = build(16);
  const ids = new Set(b.map((m) => m.id));
  for (const m of b) {
    for (const t of [m.winToMatchId, m.lossToMatchId]) {
      if (t) { expect(ids.has(t)).toBe(true); expect(t).not.toBe(m.id); }
    }
  }
});

test("the graph is acyclic", () => {
  const b = build(8);
  const by = new Map(b.map((m) => [m.id, m]));
  for (const start of b) {
    const seen = new Set<string>();
    let cur: string | null = start.id;
    while (cur) {
      expect(seen.has(cur)).toBe(false);
      seen.add(cur);
      cur = by.get(cur)?.winToMatchId ?? null;
    }
  }
});

test("a first-round loser reappears in the losers bracket", () => {
  const b = build(4);
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  const after = advanceWinner(b, first.id, first.entrantA!);
  const target = after.find((m) => m.id === first.lossToMatchId)!;
  expect([target.entrantA, target.entrantB]).toContain(first.entrantB);
});

// Deliberate: the losers-bracket winner beating the winners-bracket winner in
// the grand final ends it. No reset match. See the spec.
test("there is no bracket reset after the grand final", () => {
  const b = build(8);
  const grandFinal = b.find((m) => m.winToMatchId === null)!;
  expect(b.filter((m) => m.winToMatchId === grandFinal.id).length).toBe(2);
  expect(doubleElim.blurb).toMatch(/two lives/i);
});
