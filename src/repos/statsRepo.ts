import { playerAnalytics, type PlayerAnalytics } from "../analytics/player";
import { listMatches } from "./matchRepo";
import { getSessionLocations } from "./sessionRepo";

/** Lifetime analytics for one player, across every match on the device. */
export async function getPlayerAnalytics(name: string): Promise<PlayerAnalytics> {
  const matches = await listMatches();
  const sessionIds = [...new Set(matches.map((m) => m.session_id).filter((id): id is string => !!id))];
  const sessionLocations = await getSessionLocations(sessionIds);
  return playerAnalytics(matches, name, sessionLocations);
}

export type { PlayerAnalytics };
