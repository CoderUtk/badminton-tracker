export type BracketSize = 4 | 8 | 16 | 32 | 64;
export type Entrant = {
  id: string; clubPlayerId: string; name: string; seed: number;
  partnerClubPlayerId: string | null;
};
export type BracketMatch = {
  id: string; tournamentId: string; round: number; index: number;
  matchId: string | null; entrantA: string | null; entrantB: string | null;
  winnerEntrant: string | null;
  court: string | null;
  scoredBy: string | null;
};
