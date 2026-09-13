import { groupLabel, groupOrder, signedDiff, splitDoubleElimRounds } from "../src/tournament/tournamentView";
import { doubleElim } from "../src/tournament/formats/doubleElim";
import { drawSizeFor } from "../src/tournament/draw";
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

describe("splitDoubleElimRounds", () => {
  test("empty bracket splits into two empty lists", () => {
    expect(splitDoubleElimRounds([])).toEqual({ winners: [], losers: [] });
  });

  test("every winners-bracket row (the one with a loss edge) lands on the winners side", () => {
    const b = buildDouble(8);
    const { winners, losers } = splitDoubleElimRounds(b);
    expect(winners.length + losers.length).toBe(b.length);
    const winnersCount = drawSizeFor(8) - 1;
    expect(winners.length).toBe(winnersCount);
    for (const m of winners) expect(m.lossToMatchId).not.toBeNull();
    for (const m of losers) expect(m.lossToMatchId).toBeNull();
  });

  test("the grand final (no win edge) is on the losers side, above the winners rounds", () => {
    const b = buildDouble(8);
    const grandFinal = b.find((m) => m.winToMatchId === null)!;
    const { winners, losers } = splitDoubleElimRounds(b);
    expect(losers.some((m) => m.id === grandFinal.id)).toBe(true);
    expect(winners.some((m) => m.id === grandFinal.id)).toBe(false);
    const maxWinnersRound = Math.max(...winners.map((m) => m.round));
    const minLosersRound = Math.min(...losers.map((m) => m.round));
    expect(minLosersRound).toBeGreaterThan(maxWinnersRound);
  });
});
