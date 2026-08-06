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
 * Turn a join path into a shareable link and hand it to the OS share sheet.
 * Shared by the club and tournament screens so the two cannot drift.
 * Failures are toasted, not thrown — a failed share is not worth a crash.
 */
export async function shareJoinLink(path: string, message: string): Promise<void> {
  try {
    const url = JOIN_LINK_DOMAIN ? `https://${JOIN_LINK_DOMAIN}/${path}` : Linking.createURL(path);
    const profile = await getMyProfile();
    const from = profile?.displayName ? `\n\n— ${profile.displayName}` : "";
    await Share.share({ message: `${message}\n${url}${from}` });
  } catch (e) {
    toast((e as Error).message || "Could not share the link", "error");
  }
}
