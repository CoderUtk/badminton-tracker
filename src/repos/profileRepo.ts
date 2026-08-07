import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase } from "../lib/supabase";

export type Profile = { id: string; displayName: string; displayNameSet: boolean; age: number | null; hand: Hand | null; avatarUrl: string | null; username: string };
export type Hand = "left" | "right";

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
    .select("id, display_name, display_name_set, age, hand, avatar_url, username")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? "",
    displayNameSet: Boolean(data.display_name_set),
    age: (data.age as number | null) ?? null,
    hand: (data.hand as Hand | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    username: (data.username as string | null) ?? "",
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

/**
 * First-login save: name, optional age, and required hand, in one write.
 * Distinct from setDisplayName, which app/(app)/profile.tsx uses later to
 * edit only the name — that caller has no reason to touch age/hand.
 */
export async function completeOnboarding(name: string, age: number | null, hand: Hand): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name.trim(), display_name_set: true, age, hand })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
}

/** Update age and playing hand after onboarding — used by the profile screen's edit flow. */
export async function setProfileDetails(age: number | null, hand: Hand): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  const { error } = await supabase
    .from("profiles")
    .update({ age, hand })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
}

export async function uploadAvatar(localUri: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to set a profile picture");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to set a profile picture");

  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `${uid}/avatar.jpg`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, decode(base64), { contentType: "image/jpeg", upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;

  const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
  if (dbErr) throw new Error(dbErr.message);
  listeners.forEach((l) => l());
  return url;
}

export async function removeAvatar(): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage your profile picture");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to manage your profile picture");

  await supabase.storage.from("avatars").remove([`${uid}/avatar.jpg`]);
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", uid);
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
}

/**
 * Change the signed-in user's handle. Returns the canonical (lowercased)
 * value the server stored.
 *
 * Goes through the set_username RPC rather than a column update: the direct
 * update grant on profiles.username is revoked, and only the RPC enforces the
 * 30-day release hold and writes the username_history row (see
 * 0029_usernames.sql).
 */
export async function setUsername(username: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to change your username");
  const { data, error } = await supabase.rpc("set_username", {
    p_username: username.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
  return data as string;
}
