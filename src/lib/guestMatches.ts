import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "guest_match_ids";
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
