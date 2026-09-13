import { groupsKnockout } from "../src/tournament/formats/groupsKnockout";
import { parseSrc } from "../src/tournament/formats/gate";
import type { Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = (n: number, groupSize = 4, advancePerGroup = 2) => {
  let k = 0;
  return groupsKnockout.build({
    entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}`, groupSize, advancePerGroup,
  });
};

test("12 entrants in groups of 4 make 3 groups", () => {
  const b = build(12);
  const groups = new Set(b.filter((m) => m.groupIdx !== null).map((m) => m.groupIdx));
  expect(groups.size).toBe(3);
});

test("group sizes differ by at most one when the count does not divide", () => {
  const b = build(13);
  const counts = new Map<number, Set<string>>();
  for (const m of b) {
    if (m.groupIdx === null) continue;
    const s = counts.get(m.groupIdx) ?? new Set<string>();
    s.add(m.entrantA!); s.add(m.entrantB!);
    counts.set(m.groupIdx, s);
  }
  const sizes = [...counts.values()].map((s) => s.size).sort();
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  expect(sizes.reduce((a, b2) => a + b2, 0)).toBe(13);
});

test("group matches carry no edges; knockout slots carry source tokens", () => {
  const b = build(12);
  const group = b.filter((m) => m.groupIdx !== null);
  const knockout = b.filter((m) => m.groupIdx === null);
  for (const m of group) expect(m.winToMatchId).toBeNull();
  const firstKo = knockout.filter((m) => m.srcA || m.srcB);
  expect(firstKo.length).toBeGreaterThan(0);
  for (const m of firstKo) {
    if (m.srcA) expect(parseSrc(m.srcA)).not.toBeNull();
    if (m.srcB) expect(parseSrc(m.srcB)).not.toBeNull();
  }
});

test("the knockout half is a tree with exactly one ending match", () => {
  const b = build(12);
  const knockout = b.filter((m) => m.groupIdx === null);
  expect(knockout.filter((m) => m.winToMatchId === null).length).toBe(1);
});

test("entrants from the same group do not meet in the first knockout round", () => {
  const b = build(16, 4, 2);
  const ko = b.filter((m) => m.groupIdx === null && (m.srcA || m.srcB));
  for (const m of ko) {
    const a = parseSrc(m.srcA!)!;
    const bb = parseSrc(m.srcB!)!;
    expect(a.group).not.toBe(bb.group);
  }
});

test("matchCount agrees with the graph it builds", () => {
  for (const n of [8, 12, 13, 16, 20]) {
    expect(groupsKnockout.matchCount(n, { groupSize: 4, advancePerGroup: 2 }))
      .toBe(build(n).length);
  }
});

// OVERRIDE 1: the brief's own pairs-construction loop drops the middle
// group's qualifiers whenever the group count is odd (it breaks out of the
// loop at the halfway point). Sweep the real parameter space and check the
// invariants the fix must satisfy: every qualifier appears in exactly one
// first-round slot (completeness), nobody meets a group-mate in round one
// (separation), and the slot count matches a proper seeded draw (byes).
describe("knockout seeding invariants (I1 completeness, I2 byes, I3 separation)", () => {
  const nextPowerOfTwo = (n: number): number => {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  };

  for (const count of [2, 3, 4, 5, 6, 7, 8]) {
    for (const advance of [1, 2]) {
      test(`count=${count} advance=${advance}`, () => {
        const groupSize = 4;
        const n = count * groupSize;
        const b = build(n, groupSize, advance);
        const koMatches = b.filter((m) => m.groupIdx === null);
        const minRound = Math.min(...koMatches.map((m) => m.round));
        const first = koMatches.filter((m) => m.round === minRound);

        // I2: slot count matches nextPowerOfTwo(count*advance)/2
        expect(first.length).toBe(nextPowerOfTwo(count * advance) / 2);

        // I1: every srcToken(g, r) appears exactly once
        const seen = new Map<string, number>();
        for (const m of first) {
          for (const tok of [m.srcA, m.srcB]) {
            if (!tok) continue;
            seen.set(tok, (seen.get(tok) ?? 0) + 1);
          }
        }
        for (let g = 0; g < count; g++) {
          for (let r = 1; r <= advance; r++) {
            const tok = `G${g}#${r}`;
            expect(seen.get(tok)).toBe(1);
          }
        }
        expect(seen.size).toBe(count * advance);

        // I3: no first-round match has both slots from the same group
        for (const m of first) {
          if (!m.srcA || !m.srcB) continue;
          const ga = parseSrc(m.srcA)!.group;
          const gb = parseSrc(m.srcB)!.group;
          expect(ga).not.toBe(gb);
        }
      });
    }
  }
});
