import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "has_seen_tab_tour_v1";

// expo-secure-store has no native module on web, and the web build runs
// every visitor as a guest — mirror the fallback used by lastLineup.ts and
// guestMatches.ts.
const store = {
  async get(key: string): Promise<string | null> {
    return Platform.OS === "web" ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
};

/** Whether the first-run tab tour has already been shown on this device. Never throws. */
export async function hasSeenTabTour(): Promise<boolean> {
  try {
    return (await store.get(KEY)) === "1";
  } catch {
    return false;
  }
}

/** Marks the tab tour as seen. Never throws — storage is best effort. */
export async function setSeenTabTour(): Promise<void> {
  try {
    await store.set(KEY, "1");
  } catch {
    // A storage failure must never block finishing the tour.
  }
}
