import { Share } from "react-native";
import * as Linking from "expo-linking";
import { toast } from "./toast";
import { getMyProfile } from "../repos/profileRepo";

/**
 * Vercel-hosted domain for join links. Falls back to the badminton:// custom
 * scheme when unset, so sharing keeps working before the Vercel site exists —
 * see docs/superpowers/specs/2026-08-05-share-links-design.md.
 */
const JOIN_LINK_DOMAIN = process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN;

/**
 * The domain to *display* on a share card, or null when unconfigured.
 *
 * Read at call time rather than module scope so it tracks the env var the way
 * the tests (and an app restart) expect. Deliberately returns null instead of
 * the badminton:// fallback shareJoinLink uses: a custom-scheme URL is a dead
 * end for a stranger scrolling a story, so the card shows the wordmark alone.
 */
export function joinLinkDisplayDomain(): string | null {
  return process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN || null;
}

/**
 * Turn a join path into a shareable link and hand it to the OS share sheet.
 * `action` is the clause after the sharer's name, e.g. `invited you to join
 * the roster` or `invited you to compete in "Nasdaq7"` — this function owns
 * the greeting and name so every message credits who sent it. Shared by the
 * club and tournament screens so the two cannot drift. Failures are toasted,
 * not thrown — a failed share is not worth a crash.
 */
export async function shareJoinLink(path: string, action: string): Promise<void> {
  try {
    const url = JOIN_LINK_DOMAIN ? `https://${JOIN_LINK_DOMAIN}/${path}` : Linking.createURL(path);
    const profile = await getMyProfile();
    const name = profile?.displayName || "Someone";
    await Share.share({ message: `🏸 Hey,\n${name} ${action} on CourtSide:\n${url}` });
  } catch (e) {
    toast((e as Error).message || "Could not share the link", "error");
  }
}
