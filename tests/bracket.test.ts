import { buildBracket, advanceWinner, bracketStatus } from "../src/tournament/bracket";
import type { Entrant } from "../src/tournament/types";

let n = 0;
const gen = () => `id${n++}`;
const ents = (count: number): Entrant[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1, partnerClubPlayerId: null,
  }));

beforeEach(() => { n = 0; });

test("size 4 builds 2 round-1 matches and 1 final", () => {
  const b = buildBracket(ents(4), 4, "t1", gen);
  expect(b.filter((m) => m.round === 1)).toHaveLength(2);
  expect(b.filter((m) => m.round === 2)).toHaveLength(1);
});

test("standard seeding puts seed 1 vs seed 4, seed 2 vs seed 3 (size 4)", () => {
  const b = buildBracket(ents(4), 4, "t1", gen).filter((m) => m.round === 1);
  const pair = (m: any) => [m.entrantA, m.entrantB].sort();
  expect(pair(b[0])).toEqual(["e1", "e4"].sort());
  expect(pair(b[1])).toEqual(["e2", "e3"].sort());
});

test("5 entrants into size 8 creates 3 byes that auto-advance to round 2", () => {
  const b = buildBracket(ents(5), 8, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  const byes = r1.filter((m) => m.entrantA === null || m.entrantB === null);
  expect(byes).toHaveLength(3);
  // a bye match already has a winner (the present entrant)
  byes.forEach((m) => expect(m.winnerEntrant).toBe(m.entrantA ?? m.entrantB));
});

test("advanceWinner fills the next-round slot by parity", () => {
  const b = buildBracket(ents(4), 4, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  const b2 = advanceWinner(b, r1[0].id, r1[0].entrantA!);
  const final = b2.find((m) => m.round === 2)!;
  expect(final.entrantA).toBe(r1[0].entrantA); // index 0 -> entrantA
  const b3 = advanceWinner(b2, r1[1].id, r1[1].entrantB!);
  expect(b3.find((m) => m.round === 2)!.entrantB).toBe(r1[1].entrantB); // index 1 -> entrantB
});

test("advanceWinner is idempotent", () => {
  const b = buildBracket(ents(4), 4, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  const once = advanceWinner(b, r1[0].id, r1[0].entrantA!);
  const twice = advanceWinner(once, r1[0].id, r1[0].entrantA!);
  expect(twice).toEqual(once);
});

test("bracketStatus reports champion when final resolved", () => {
  let b = buildBracket(ents(4), 4, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  b = advanceWinner(b, r1[0].id, "e1");
  b = advanceWinner(b, r1[1].id, "e2");
  expect(bracketStatus(b).status).not.toBe("done");
  const final = b.find((m) => m.round === 2)!;
  b = advanceWinner(b, final.id, "e1");
  expect(bracketStatus(b)).toEqual({ status: "done", champion: "e1" });
});

test("size 64 builds 32 round-1 matches and a 6-round bracket", () => {
  const b = buildBracket(ents(64), 64, "t1", gen);
  expect(b.filter((m) => m.round === 1)).toHaveLength(32);
  expect(Math.max(...b.map((m) => m.round))).toBe(6);
});

test("deterministic: same inputs produce same ids and structure", () => {
  n = 0; const a = buildBracket(ents(8), 8, "t1", gen);
  n = 0; const c = buildBracket(ents(8), 8, "t1", gen);
  expect(a).toEqual(c);
});
