import { Image } from "react-native";
import type { ClubPlayer } from "../../repos/clubRepo";

/**
 * Roster rows to an id-keyed avatar lookup.
 *
 * Keyed by club player id, never by display name: two players in one club can
 * share a name, and a name-keyed map hands one of them the other's photo.
 */
export function avatarMap(players: ClubPlayer[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const p of players) out[p.id] = p.avatar_url;
  return out;
}

/**
 * Warm the image cache before a card is captured.
 *
 * Avatar renders a network Image, and captureRef fires synchronously on tap.
 * Without this the capture can win the race and bake an empty circle into the
 * shared PNG - wrong, and silent. A failed prefetch is deliberately swallowed:
 * an unreachable avatar should degrade to the initials fallback, not block the
 * share.
 */
export async function preloadAvatars(urls: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  await Promise.all(unique.map((u) => Image.prefetch(u).catch(() => false)));
}
