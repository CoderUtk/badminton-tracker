import type { BracketMatch } from "./types";

// Pure DB-row mappers for bracket_matches. No native imports so they are
// unit-testable in a plain node/jest environment. Column `idx` <-> `index`.
export type BracketRow = {
  id: string; tournament_id: string; round: number; idx: number;
  match_id: string | null; entrant_a: string | null; entrant_b: string | null;
  winner_entrant: string | null;
  court: string | null; scored_by: string | null;
};

export const rowToBracketMatch = (r: BracketRow): BracketMatch => ({
  id: r.id, tournamentId: r.tournament_id, round: r.round, index: r.idx,
  matchId: r.match_id, entrantA: r.entrant_a, entrantB: r.entrant_b, winnerEntrant: r.winner_entrant,
  court: r.court ?? null, scoredBy: r.scored_by ?? null,
});
export const bracketMatchToRow = (m: BracketMatch): BracketRow => ({
  id: m.id, tournament_id: m.tournamentId, round: m.round, idx: m.index,
  match_id: m.matchId, entrant_a: m.entrantA, entrant_b: m.entrantB, winner_entrant: m.winnerEntrant,
  court: m.court ?? null, scored_by: m.scoredBy ?? null,
});
export function changedRows(before: BracketMatch[], after: BracketMatch[]): BracketMatch[] {
  const b = new Map(before.map((m) => [m.id, m]));
  return after.filter((m) => JSON.stringify(b.get(m.id)) !== JSON.stringify(m));
}
