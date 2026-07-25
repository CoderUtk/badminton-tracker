export type TeamId = "A" | "B";
export type MatchType = "singles" | "doubles";

export interface Player {
  id: string;
  name: string;
}

export interface MatchConfig {
  matchType: MatchType;
  bestOf: 1 | 3 | 5; // best-of; needed = floor(bestOf/2)+1 → 1, 2 or 3 games to win
  pointsToWin: number; // 21 standard
  cap: number; // 30 standard
  intervalAt: number; // 11 standard, 0 disables
  teams: Record<TeamId, Player[]>; // 1 player for singles, 2 for doubles
  /** Player index (0/1) who serves first for the team that starts serving. */
  firstServer: { team: TeamId; playerIndex: number };
}

export type MatchEvent =
  | { type: "MATCH_STARTED"; config: MatchConfig; at: number }
  | { type: "RALLY_WON"; by: TeamId; at: number }
  | { type: "INTERVAL_ENDED"; at: number }
  | { type: "GAME_STARTED"; at: number } // confirms start of next game after a game ends
  | { type: "MATCH_FORFEITED"; by: TeamId; at: number };

export type Phase =
  | "awaiting_start"
  | "playing"
  | "interval"
  | "game_over" // waiting for GAME_STARTED
  | "match_over";

/**
 * Court positions per team: which player index stands in the right and left
 * service courts. Singles ignores this (index 0 everywhere).
 */
export interface Positions {
  right: number;
  left: number;
}

export interface MatchState {
  config: MatchConfig;
  phase: Phase;
  game: number; // 1-based
  score: Record<TeamId, number>;
  gamesWon: Record<TeamId, number>;
  gameHistory: { score: Record<TeamId, number>; winner: TeamId }[];
  servingTeam: TeamId;
  servingPlayer: number; // player index within serving team
  positions: Record<TeamId, Positions>;
  /** True once the mid-game interval for the current game has been taken. */
  intervalTaken: boolean;
  /** Rally winners this game, in order (drives the timeline UI). */
  rallies: TeamId[];
  winner: TeamId | null;
}
