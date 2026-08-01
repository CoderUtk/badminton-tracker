import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// SecureStore rejects values over 2048 bytes. A Supabase session carrying Google
// provider tokens routinely exceeds that, which silently loses the session and
// bounces the user back to sign-in on the next launch. Split large values across
// numbered chunks so credentials still sit in encrypted storage.
const CHUNK_SIZE = 1500;
const MANIFEST = "__chunks__:";
const chunkKey = (key: string, i: number) => `${key}.${i}`;

const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith(MANIFEST)) return head;

    const count = Number(head.slice(MANIFEST.length));
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null; // torn write — treat as no session
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(key, `${MANIFEST}${count}`);
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key);
  },
};

/** Delete any chunk entries left by a previous write of `key`. */
async function clearChunks(key: string): Promise<void> {
  const head = await SecureStore.getItemAsync(key);
  if (head === null || !head.startsWith(MANIFEST)) return;
  const count = Number(head.slice(MANIFEST.length));
  if (!Number.isFinite(count)) return;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

/**
 * Null when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are not set. The app is
 * online-only, so that state renders a configuration error at sign-in.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: Platform.OS === "web" ? undefined : secureStoreAdapter,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === "web",
        },
      })
    : null;
