/**
 * Serialisation for cached PlayerAnalytics payloads.
 *
 * PlayerAnalytics carries `venues` as a Set, which JSON.stringify renders as
 * `{}` — silently losing it with no error anywhere. Every cached payload must
 * go through here rather than raw JSON. Pure, so it is unit tested directly.
 */
import type { PlayerAnalytics } from "./player";

export function serializeAnalytics(a: PlayerAnalytics): string {
  return JSON.stringify({ ...a, venues: [...a.venues] });
}

export function deserializeAnalytics(json: string): PlayerAnalytics | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    // A payload written by an older build, or a truncated write, must read as
    // a cache miss rather than surfacing undefined fields in the UI.
    if (typeof raw.played !== "number" || !Array.isArray(raw.venues)) return null;
    return { ...raw, venues: new Set(raw.venues as string[]) } as unknown as PlayerAnalytics;
  } catch {
    return null;
  }
}
