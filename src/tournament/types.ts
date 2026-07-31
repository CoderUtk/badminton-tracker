export type BracketSize = 4 | 8 | 16 | 32;
export type Entrant = { id: string; clubPlayerId: string; name: string; seed: number };
export type BracketMatch = {
  id: string; tournamentId: string; round: number; index: number;
  matchId: string | null; entrantA: string | null; entrantB: string | null;
  winnerEntrant: string | null;
};
