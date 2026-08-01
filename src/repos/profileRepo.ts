import { supabase } from "../lib/supabase";

export type Profile = { id: string; displayName: string; displayNameSet: boolean };

// The root Gate caches the profile to decide whether to show the welcome
// screen. Writers announce changes so it can re-read instead of going stale.
const listeners = new Set<() => void>();

/** Subscribe to profile writes. Returns an unsubscribe function. */
export function subscribeProfile(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** The signed-in user's profile row, or null when offline / not configured. */
export async function getMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, display_name_set")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? "",
    displayNameSet: Boolean(data.display_name_set),
  };
}

/** Persist the user's chosen name and mark it as explicitly set. */
export async function setDisplayName(name: string): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name.trim(), display_name_set: true })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
}
