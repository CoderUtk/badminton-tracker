import { playerAnalytics, type PlayerAnalytics } from "../analytics/player";
import { listMatches } from "./matchRepo";

/** Lifetime analytics for one player, across every match on the device. */
export async function getPlayerAnalytics(name: string): Promise<PlayerAnalytics> {
  return playerAnalytics(await listMatches(), name);
}

export type { PlayerAnalytics };
