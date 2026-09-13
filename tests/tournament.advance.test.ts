import { advanceWinner } from "../src/tournament/bracket";
import { singleElim } from "../src/tournament/formats/singleElim";
import type { BracketMatch, Entrant } from "../src/tournament/types";

const ents: Entrant[] = Array.from({ length: 4 }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const build = () => {
  let n = 0;
  return singleElim.build({ entrants: ents, tournamentId: "t1", gen: () => `m${++n}` });
};

test("the winner lands in the slot the edge names", () => {
  const b = build();
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  const after = advanceWinner(b, first.id, first.entrantA!);
  const parent = after.find((m) => m.id === first.winToMatchId)!;
  expect(parent.entrantA).toBe(first.entrantA);
  expect(after.find((m) => m.id === first.id)!.winnerEntrant).toBe(first.entrantA);
});

test("index 1 fills slot b, not slot a", () => {
  const b = build();
  const second = b.find((m) => m.round === 1 && m.index === 1)!;
  const after = advanceWinner(b, second.id, second.entrantB!);
  expect(after.find((m) => m.id === second.winToMatchId)!.entrantB).toBe(second.entrantB);
});

test("a loss edge routes the loser", () => {
  const b = build();
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  // Hand-attach a loss edge; double elimination emits these for real in Task 6.
  const consolation: BracketMatch = {
    ...first, id: "cons", round: 1, index: 99,
    entrantA: null, entrantB: null, winnerEntrant: null,
    winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
  };
  const withLoss = [...b.map((m) =>
    m.id === first.id ? { ...m, lossToMatchId: "cons", lossToSlot: "a" as const } : m), consolation];
  const after = advanceWinner(withLoss, first.id, first.entrantA!);
  expect(after.find((m) => m.id === "cons")!.entrantA).toBe(first.entrantB);
});

test("a null edge advances nobody and mutates nothing else", () => {
  const b = build();
  const final = b.find((m) => m.winToMatchId === null)!;
  const seeded = b.map((m) => m.id === final.id ? { ...m, entrantA: "e1", entrantB: "e2" } : m);
  const after = advanceWinner(seeded, final.id, "e1");
  expect(after.find((m) => m.id === final.id)!.winnerEntrant).toBe("e1");
  expect(after.filter((m) => m.winnerEntrant).length).toBe(
    seeded.filter((m) => m.winnerEntrant).length + 1);
});

test("does not mutate the input array", () => {
  const b = build();
  const first = b.find((m) => m.round === 1 && m.index === 0)!;
  const snapshot = JSON.stringify(b);
  advanceWinner(b, first.id, first.entrantA!);
  expect(JSON.stringify(b)).toBe(snapshot);
});

test("an unknown match id is a no-op", () => {
  const b = build();
  expect(advanceWinner(b, "nope", "e1")).toBe(b);
});
