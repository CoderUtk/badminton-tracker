import { playerAnalytics, type PlayerAnalytics } from "../analytics/player";
import { listAllMatches } from "./matchRepo";
import { getSessionLocations } from "./sessionRepo";

/** Lifetime analytics for one player, across every match on the device. */
export async function getPlayerAnalytics(name: string): Promise<PlayerAnalytics> {
  const matches = await listAllMatches();
  const sessionIds = [...new Set(
    matches.filter((m) => m.side_a.some((p) => p.name === name) || m.side_b.some((p) => p.name === name))
      .map((m) => m.session_id)
      .filter((id): id is string => !!id)
  )];
  const sessionLocations = await getSessionLocations(sessionIds);
  return playerAnalytics(matches, name, sessionLocations);
}

export type { PlayerAnalytics };
