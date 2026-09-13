import type { BracketMatch, Entrant } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";

const BYE = "__bye__";

/**
 * Circle method. Fix the first entrant, rotate the rest; each rotation is one
 * scheduling round in which nobody appears twice. An odd count gets a sentinel
 * whose pairing is dropped, so the bye rotates fairly and no bye match is ever
 * created as a row.
 */
export function circleRounds(ids: string[]): [string, string][][] {
  const list = ids.length % 2 === 0 ? [...ids] : [...ids, BYE];
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== BYE && b !== BYE) pairs.push([a, b]);
    }
    rounds.push(pairs);
    // Rotate everything except the first slot.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export const roundRobin: FormatModule = {
  id: "round_robin",
  label: "Round-robin",
  blurb: "Everyone plays everyone",
  minPlayers: (matchType) => (matchType === "doubles" ? 6 : 3),
  matchCount: (entrants) => (entrants * (entrants - 1)) / 2,
  build: ({ entrants, tournamentId, gen }: GenOpts): BracketMatch[] => {
    const out: BracketMatch[] = [];
    circleRounds(entrants.map((e) => e.id)).forEach((pairs, r) => {
      pairs.forEach(([a, b], i) => {
        out.push({
          id: gen(), tournamentId, round: r + 1, index: i, matchId: null,
          entrantA: a, entrantB: b, winnerEntrant: null,
          court: null, scoredBy: null,
          // No edges: nothing advances, standings decide the winner.
          winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
          groupIdx: null, srcA: null, srcB: null,
        });
      });
    });
    return out;
  },
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket, entrants, scores),
  status: (bracket, entrants?: Entrant[]) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const done = bracket.every((m) => m.winnerEntrant);
    if (!done) {
      return { status: bracket.some((m) => m.winnerEntrant || m.matchId) ? "live" : "pending", champion: null };
    }
    // Real entrants (with real seeds) win when the caller has them. Only when
    // they're absent do we fall back to a reconstruction from the bracket —
    // and that reconstruction's seed is positional, not real, so it must
    // never be allowed to break a sporting tie: if the top of the table is
    // tied with its neighbour on every sporting key, there is no honest
    // champion to name.
    const usable = entrants ?? [...new Set(bracket.flatMap((m) => [m.entrantA, m.entrantB]))]
      .filter((x): x is string => !!x)
      .map((id, i) => ({ id, clubPlayerId: "", name: "", seed: i + 1, partnerClubPlayerId: null }));
    const table = recordStandings(bracket, usable);
    const champion = entrants || !table[0]?.tied ? table[0]?.entrantId ?? null : null;
    return { status: "done", champion };
  },
};
