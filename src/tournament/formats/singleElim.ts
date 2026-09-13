import { buildBracket } from "../bracket";
import { drawSizeFor } from "../draw";
import type { BracketMatch, Entrant, Slot } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";

/** Stamp win edges onto a tree built by buildBracket. The parent of (round r,
 *  index i) is (r+1, floor(i/2)), and i's parity picks the slot — exactly the
 *  math finish_bracket_match used to do inline. The final has no parent, and
 *  its null edge is now what marks the end of the tournament. */
export function stampTreeEdges(bracket: BracketMatch[]): BracketMatch[] {
  const byKey = new Map(bracket.map((m) => [`${m.round}:${m.index}`, m]));
  return bracket.map((m) => {
    const parent = byKey.get(`${m.round + 1}:${Math.floor(m.index / 2)}`);
    return parent
      ? { ...m, winToMatchId: parent.id, winToSlot: (m.index % 2 === 0 ? "a" : "b") as Slot }
      : { ...m, winToMatchId: null, winToSlot: null };
  });
}

export const singleElim: FormatModule = {
  id: "single_elim",
  label: "Knockout",
  blurb: "Lose once, you're out",
  minPlayers: (matchType) => (matchType === "doubles" ? 6 : 4),
  matchCount: (entrants) => drawSizeFor(entrants) - 1,
  build: ({ entrants, tournamentId, gen }: GenOpts) =>
    stampTreeEdges(buildBracket(entrants, drawSizeFor(entrants.length), tournamentId, gen)),
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket, entrants, scores),
  // Its champion is the winner of the match with no win edge — entrants are
  // irrelevant here, but the param is accepted to satisfy FormatModule.
  status: (bracket, _entrants?: Entrant[]) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    // A client migration adds the routing columns as NULL to existing cached
    // rows, and the app paints from cache before any network call — so right
    // after upgrading, every row's winToMatchId can be null. In that state
    // `bracket.find(winToMatchId === null)` would pick bracket[0] (often a
    // round-1 row) rather than the actual final, and — if that row happens to
    // have a winner already — falsely declare a round-1 winner "done" with a
    // champion card. hasDoubleElimRouting-style: key the decision on whether
    // the data is present at all, and fall back to the round/index rule (the
    // pre-routing `bracketStatus` behaviour) when it isn't.
    const hasRouting = bracket.some((m) => m.winToMatchId !== null);
    const final = hasRouting
      ? bracket.find((m) => m.winToMatchId === null)!
      : bracket.reduce((max, m) => (m.round > max.round ? m : max));
    if (final.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
    const anyPlayed = bracket.some((m) => m.matchId || (m.winnerEntrant && m.round === 1));
    return { status: anyPlayed ? "live" : "pending", champion: null };
  },
};
