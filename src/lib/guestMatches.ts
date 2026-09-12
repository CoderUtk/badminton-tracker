import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "guest_match_ids";
const DISMISS_KEY = "guest_upgrade_dismissed_at";
const MAX = 40;

// expo-secure-store has no native module on web. Guest mode is the only mode
// on the web build (Gate signs every web visitor in anonymously), so every
// web user hit this on Start Match. localStorage isn't encrypted, but this
// is a non-sensitive, guest-session-scoped list of match ids, not a secret.
const store = {
  async get(key: string): Promise<string | null> {
    return Platform.OS === "web" ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

/** Record a quick-match id created during the current guest session, newest first. */
export async function recordGuestMatch(matchId: string): Promise<void> {
  const ids = await getGuestMatchIds();
  await store.set(KEY, JSON.stringify([matchId, ...ids].slice(0, MAX)));
}

/** Match ids created during the current guest session, newest first. */
export async function getGuestMatchIds(): Promise<string[]> {
  const raw = await store.get(KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

/** Called when leaving guest mode (or starting a fresh guest session) so history doesn't leak across sessions. */
export async function clearGuestMatchIds(): Promise<void> {
  await store.remove(KEY);
}

/**
 * Match count at which the guest last dismissed the save-your-matches prompt,
 * so "not now" buys real silence. 0 means never dismissed.
 *
 * Lives here rather than in settingsRepo because that is backed by SQLite,
 * which does not exist on web (src/db/db.web.ts) — and web is the platform
 * where guest mode is the only mode.
 */
export async function getUpgradeDismissedAt(): Promise<number> {
  const raw = await store.get(DISMISS_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function setUpgradeDismissedAt(matchCount: number): Promise<void> {
  await store.set(DISMISS_KEY, String(Math.max(0, Math.floor(matchCount))));
}
