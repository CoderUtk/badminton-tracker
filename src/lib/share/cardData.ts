import type { PlayerStat } from "../../repos/sessionRepo";

export function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export function formatGameScores(
  summary: { games: { A: number; B: number }[] } | null
): string[] {
  if (!summary) return [];
  return summary.games.map((g) => `${g.A}-${g.B}`);
}

export function topStandings(players: PlayerStat[], n = 3): PlayerStat[] {
  return players.slice(0, n);
}
