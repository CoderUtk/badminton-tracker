import * as SecureStore from "expo-secure-store";

const KEY = "guest_match_ids";
const MAX = 40;

/** Record a quick-match id created during the current guest session, newest first. */
export async function recordGuestMatch(matchId: string): Promise<void> {
  const ids = await getGuestMatchIds();
  await SecureStore.setItemAsync(KEY, JSON.stringify([matchId, ...ids].slice(0, MAX)));
}

/** Match ids created during the current guest session, newest first. */
export async function getGuestMatchIds(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

/** Called when leaving guest mode (or starting a fresh guest session) so history doesn't leak across sessions. */
export async function clearGuestMatchIds(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
