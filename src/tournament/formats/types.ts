import type { BracketMatch, Entrant, FormatId } from "../types";

// Declared locally rather than imported from ../../repos/tournamentRepo:
// tournamentRepo.ts imports from src/tournament/*, so importing back from
// here would create an import cycle. Keep this union in sync with
// `export type MatchType` in src/repos/tournamentRepo.ts.
export type MatchType = "singles" | "doubles";

export type GenOpts = {
  entrants: Entrant[];
  tournamentId: string;
  /** Id factory. Injected so tests can produce deterministic ids. */
  gen: () => string;
  /** groups_knockout only. */
  groupSize?: number;
  advancePerGroup?: number;
};

/** One finished match's score, keyed by BracketMatch.matchId. Absent when the
 *  match has no recorded score, which makes game and point difference
 *  unavailable and pushes standings onto the later tiebreaks. */
export type MatchScore = { gamesA: number; gamesB: number; pointsA: number; pointsB: number };

export type Standing = {
  entrantId: string;
  rank: number;         // 1-based, strictly increasing — never shared
  played: number;
  wins: number;
  losses: number;
  gameDiff: number;
  pointDiff: number;
  /** True when this entrant is level with a neighbour on every sporting
   *  tiebreak and the split came from seed or id. The UI marks these as level;
   *  the ORDER is still total so every device agrees. */
  tied: boolean;
};

export type FormatModule = {
  id: FormatId;
  /** Shown in the picker. */
  label: string;
  /** One plain line under the label. */
  blurb: string;
  /** Match count for N entrants, without building a graph. Powers the live estimate. */
  matchCount(entrants: number, o?: { groupSize?: number; advancePerGroup?: number }): number;
  /** Fewest players this format can run with, for the given match type. */
  minPlayers(matchType: MatchType): number;
  /** The whole match graph, routing edges included. Pure. */
  build(o: GenOpts): BracketMatch[];
  standings(bracket: BracketMatch[], entrants: Entrant[], scores?: Map<string, MatchScore>): Standing[];
  status(bracket: BracketMatch[]): { status: "pending" | "live" | "done"; champion: string | null };
};
