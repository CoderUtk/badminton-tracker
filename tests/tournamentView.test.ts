import {
  groupLabel, groupOrder, hasDoubleElimRouting, renumberRounds, signedDiff,
  splitDoubleElimRounds, tiedRowLabel,
} from "../src/tournament/tournamentView";
import { doubleElim } from "../src/tournament/formats/doubleElim";
import { drawSizeFor } from "../src/tournament/draw";
import type { Standing } from "../src/tournament/formats/types";
import type { BracketMatch, Entrant } from "../src/tournament/types";

const ents = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({
  id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
  seed: i + 1, partnerClubPlayerId: null,
}));
const buildDouble = (n: number) => {
  let k = 0;
  return doubleElim.build({ entrants: ents(n), tournamentId: "t1", gen: () => `m${++k}` });
};

describe("signedDiff", () => {
  test("positive gets a plus sign", () => { expect(signedDiff(3)).toBe("+3"); });
  test("negative uses the real minus sign, not a hyphen", () => { expect(signedDiff(-1)).toBe("−1"); });
  test("zero has no sign", () => { expect(signedDiff(0)).toBe("0"); });
});

describe("tiedRowLabel", () => {
  // Regression for the bug where an explicit accessibilityLabel of just
  // "1, Ana, level with the next player" replaced React Native's child-text
  // aggregation instead of adding to it — a screen reader on a tied row could
  // no longer hear the record it most needs explaining.
  test("restates rank, name, record and diff before the level marker", () => {
    const row: Standing = {
      entrantId: "e1", rank: 1, played: 2, wins: 2, losses: 0,
      gameDiff: 3, pointDiff: 20, tied: true,
    };
    expect(tiedRowLabel(row, "Ana")).toBe("1, Ana, 2–0, +3, level with the next player");
  });

  test("a negative game diff uses the real minus sign", () => {
    const row: Standing = {
      entrantId: "e2", rank: 2, played: 2, wins: 1, losses: 1,
      gameDiff: -2, pointDiff: -5, tied: true,
    };
    expect(tiedRowLabel(row, "Bo")).toBe("2, Bo, 1–1, −2, level with the next player");
  });
});

describe("groupOrder / groupLabel", () => {
  test("distinct group indices, ascending, nulls excluded", () => {
    const bracket = [
      { groupIdx: 1 }, { groupIdx: null }, { groupIdx: 0 }, { groupIdx: 1 }, { groupIdx: null },
    ] as BracketMatch[];
    expect(groupOrder(bracket)).toEqual([0, 1]);
  });

  test("no groups (every non-group format) returns an empty list", () => {
    const bracket = [{ groupIdx: null }, { groupIdx: null }] as BracketMatch[];
    expect(groupOrder(bracket)).toEqual([]);
  });

  test("letters follow index: 0 -> A, 1 -> B", () => {
    expect(groupLabel(0)).toBe("GROUP A");
    expect(groupLabel(1)).toBe("GROUP B");
  });
});

describe("hasDoubleElimRouting", () => {
  test("a real double-elim bracket has it", () => {
    expect(hasDoubleElimRouting(buildDouble(8))).toBe(true);
  });

  test("a payload with the loss edge stripped (e.g. the spectator RPC) does not", () => {
    const stripped = buildDouble(8).map((m) => ({ ...m, lossToMatchId: null }));
    expect(hasDoubleElimRouting(stripped)).toBe(false);
  });

  test("empty bracket does not", () => {
    expect(hasDoubleElimRouting([])).toBe(false);
  });
});

describe("splitDoubleElimRounds", () => {
  test("empty bracket splits into three empty lists", () => {
    expect(splitDoubleElimRounds([])).toEqual({ winners: [], grandFinal: [], losers: [] });
  });

  test("every winners-bracket row (the one with a loss edge) lands on the winners side", () => {
    const b = buildDouble(8);
    const { winners, grandFinal, losers } = splitDoubleElimRounds(b);
    expect(winners.length + grandFinal.length + losers.length).toBe(b.length);
    const winnersCount = drawSizeFor(8) - 1;
    expect(winners.length).toBe(winnersCount);
    for (const m of winners) expect(m.lossToMatchId).not.toBeNull();
    for (const m of losers) expect(m.lossToMatchId).toBeNull();
  });

  // Fixed a real defect: doubleElim.build gives the grand final both edges
  // null (winToMatchId AND lossToMatchId) — the same "nowhere left to go"
  // shape as an eliminated losers-bracket row — so a round-number-only split
  // swept it into the losers bucket. A user watching the decisive match of a
  // double-elimination tournament would have seen it rendered under a
  // "LOSERS" heading. This test used to assert that placement as correct;
  // that assertion was itself the bug (a championship match does not belong
  // under a losers heading), so it was rewritten to assert the grand final
  // is its own bucket instead of adding a regression test alongside a wrong
  // one.
  test("the grand final (unique by winToMatchId === null) is its own bucket, not the losers bracket", () => {
    const b = buildDouble(8);
    const grandFinalRow = b.find((m) => m.winToMatchId === null)!;
    const { winners, grandFinal, losers } = splitDoubleElimRounds(b);
    expect(grandFinal.map((m) => m.id)).toEqual([grandFinalRow.id]);
    expect(losers.some((m) => m.id === grandFinalRow.id)).toBe(false);
    expect(winners.some((m) => m.id === grandFinalRow.id)).toBe(false);
  });

  test("bucket sizes for an 8-entrant double elimination: 7 winners, 1 grand final, 6 losers", () => {
    const b = buildDouble(8);
    const { winners, grandFinal, losers } = splitDoubleElimRounds(b);
    expect(winners.length).toBe(7);
    expect(grandFinal.length).toBe(1);
    expect(losers.length).toBe(6);
    expect(winners.length + grandFinal.length + losers.length).toBe(doubleElim.matchCount(8));
  });
});

// On device the losers bracket and grand final rendered "0/0" with no cells —
// BracketView's column maths assumes a slice's rounds start at 1, and these
// slices carry absolute numbers. Half a double-elimination tournament was
// invisible. Renumbering is what makes them render.
test("renumberRounds maps a slice's rounds to 1..n, preserving order", () => {
  const mk = (id: string, round: number): BracketMatch => ({
    id, tournamentId: "t1", round, index: 0, matchId: null,
    entrantA: null, entrantB: null, winnerEntrant: null, court: null, scoredBy: null,
    winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
    groupIdx: null, srcA: null, srcB: null,
  });
  const out = renumberRounds([mk("a", 4), mk("b", 6), mk("c", 4)]);
  expect(out.map((m) => [m.id, m.round])).toEqual([["a", 1], ["b", 2], ["c", 1]]);
  expect(renumberRounds([])).toEqual([]);
  // Already 1-based slices are unchanged.
  expect(renumberRounds([mk("x", 1), mk("y", 2)]).map((m) => m.round)).toEqual([1, 2]);
});
