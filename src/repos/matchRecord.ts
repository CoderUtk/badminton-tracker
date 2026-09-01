import type { MatchConfig, TeamId } from "../engine";

export interface SidePlayer {
  club_player_id: string | null;
  name: string;
}

export interface MatchRecord {
  id: string;
  club_id: string | null;
  session_id: string | null;
  config: MatchConfig;
  side_a: SidePlayer[];
  side_b: SidePlayer[];
  status: "live" | "completed" | "forfeited";
  winner: TeamId | null;
  score_summary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
  created_at: number;
}
