import { buildBracket, advanceWinner as legacyAdvance } from "../src/tournament/bracket";
import { singleElim } from "../src/tournament/formats/singleElim";
import type { BracketSize, Entrant } from "../src/tournament/types";

const entrantsOf = (n: number): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`,
    seed: i + 1, partnerClubPlayerId: null,
  }));

// Same counter for both builders, so ids line up and a field-by-field
// comparison is meaningful.
const counter = () => { let n = 0; return () => `m${++n}`; };

const SIZES: BracketSize[] = [4, 8, 16, 32, 64];
const CASES: [number, BracketSize][] = [
  [3, 4], [4, 4], [5, 8], [8, 8], [9, 16], [16, 16], [17, 32], [32, 32], [33, 64], [64, 64],
];

describe.each(CASES)("single_elim with %i entrants in a %i draw", (n, size) => {
  const ents = entrantsOf(n);

  test("emits the same cells the legacy builder did", () => {
    const legacy = buildBracket(ents, size, "t1", counter());
    const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
    expect(next.length).toBe(legacy.length);
    for (let i = 0; i < legacy.length; i++) {
      const { id, round, index, entrantA, entrantB, winnerEntrant, tournamentId } = next[i];
      expect({ id, round, index, entrantA, entrantB, winnerEntrant, tournamentId })
        .toEqual({
          id: legacy[i].id, round: legacy[i].round, index: legacy[i].index,
          entrantA: legacy[i].entrantA, entrantB: legacy[i].entrantB,
          winnerEntrant: legacy[i].winnerEntrant, tournamentId: legacy[i].tournamentId,
        });
    }
  });

  test("every edge points where idx/2 used to", () => {
    const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
    const maxRound = Math.max(...next.map((m) => m.round));
    for (const m of next) {
      if (m.round === maxRound) {
        // A null win edge is what "this ends the tournament" means now.
        expect(m.winToMatchId).toBeNull();
        expect(m.winToSlot).toBeNull();
        continue;
      }
      const parent = next.find((p) => p.round === m.round + 1 && p.index === Math.floor(m.index / 2))!;
      expect(m.winToMatchId).toBe(parent.id);
      expect(m.winToSlot).toBe(m.index % 2 === 0 ? "a" : "b");
      // Single elimination never routes a loser.
      expect(m.lossToMatchId).toBeNull();
    }
  });

  test("matchCount agrees with the graph it builds", () => {
    expect(singleElim.matchCount(n)).toBe(size - 1);
  });
});

// A client migration adds the routing columns as NULL to existing cached
// rows, and the app paints from cache before any network call — so right
// after upgrading, an in-progress bracket can have every winToMatchId null.
// Without the round/index fallback, `.find(winToMatchId === null)` picks
// bracket[0] (a round-1 row) and — since it already has a winner — falsely
// reports a round-1 winner as tournament champion.
test("an un-stamped bracket (every winToMatchId null) never names a round-1 winner champion", () => {
  const ents = entrantsOf(4);
  const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
  const unstamped = next.map((m) => ({
    ...m,
    winToMatchId: null,
    // Round 1 has a decided winner (as if the client just upgraded mid-tournament).
    winnerEntrant: m.round === 1 && m.index === 0 ? m.entrantA : m.winnerEntrant,
  }));
  const st = singleElim.status(unstamped);
  expect(st.status).not.toBe("done");
  expect(st.champion).toBeNull();
});

test("byes resolve exactly as they did — 5 entrants in an 8 draw", () => {
  const ents = entrantsOf(5);
  const legacy = buildBracket(ents, 8, "t1", counter());
  const next = singleElim.build({ entrants: ents, tournamentId: "t1", gen: counter() });
  const legacyByes = legacy.filter((m) => m.round === 1 && m.winnerEntrant).map((m) => m.winnerEntrant);
  const nextByes = next.filter((m) => m.round === 1 && m.winnerEntrant).map((m) => m.winnerEntrant);
  expect(nextByes).toEqual(legacyByes);
  expect(nextByes.length).toBe(3);
});
