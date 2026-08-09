import { playerAnalytics, type PlayerAnalytics } from "../analytics/player";
import { listAllMatches } from "./matchRepo";
import { getSessionLocations } from "./sessionRepo";
import { currentFingerprint, readCachedAnalytics, writeCachedAnalytics } from "./analyticsCache";

/**
 * Lifetime analytics for one player, across every match on the device.
 *
 * Gated on a cheap fingerprint over the completed-match rows: when nothing has
 * changed since the last computation, the cached payload is returned without
 * reading or JSON-parsing a single match row. On a cache miss this is exactly
 * the work it always did.
 */
export async function getPlayerAnalytics(name: string): Promise<PlayerAnalytics> {
  const fingerprint = await currentFingerprint();
  if (fingerprint) {
    const cached = await readCachedAnalytics(name, fingerprint);
    if (cached) return cached;
  }

  const matches = await listAllMatches();
  const sessionIds = [...new Set(
    matches.filter((m) => m.side_a.some((p) => p.name === name) || m.side_b.some((p) => p.name === name))
      .map((m) => m.session_id)
      .filter((id): id is string => !!id)
  )];
  const sessionLocations = await getSessionLocations(sessionIds);
  const result = playerAnalytics(matches, name, sessionLocations);
  if (fingerprint) await writeCachedAnalytics(name, fingerprint, result);
  return result;
}

export type { PlayerAnalytics };
