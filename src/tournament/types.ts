export type BracketSize = 4 | 8 | 16 | 32 | 64;
export type Slot = "a" | "b";
export type FormatId = "single_elim" | "double_elim" | "round_robin" | "groups_knockout";
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
  /** Where this match's winner goes. Null on a match that ends the tournament. */
  winToMatchId: string | null;
  winToSlot: Slot | null;
  /** Where this match's loser goes. Only double elimination sets these. */
  lossToMatchId: string | null;
  lossToSlot: Slot | null;
  /** Group stage only: which group this match belongs to. Null elsewhere. */
  groupIdx: number | null;
  /** Groups → knockout only: a standings source token like 'G2#1' for a slot
   *  the seeding gate will fill. Null elsewhere. */
  srcA: string | null;
  srcB: string | null;
};
