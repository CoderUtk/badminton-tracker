import { supabase } from "../lib/supabase";

export type PublicClubRating = { club: string; rating: number; rank: number };

export type PublicPlayerProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  played: number;
  won: number;
  clubs: PublicClubRating[];
};

/**
 * The public player page's data.
 *
 * Null covers "no such player", "not opted in" and "no username" without
 * distinguishing them — see 0052: a public endpoint that says "exists but
 * private" is a username enumeration oracle, so the caller must render one
 * not-found state for all three.
 */
export async function getPublicPlayerProfile(username: string): Promise<PublicPlayerProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("public_player_profile", { p_username: username });
  if (error || !data) return null;
  const p = data as PublicPlayerProfile;
  return p.username ? { ...p, clubs: p.clubs ?? [] } : null;
}

/** Owner's switch for their own page. */
export async function setPublicProfile(isPublic: boolean): Promise<void> {
  if (!supabase) throw new Error("Sign in to change this");
  const { error } = await supabase.rpc("set_public_profile", { p_public: isPublic });
  if (error) throw new Error(error.message);
}

export async function getPublicProfileEnabled(): Promise<boolean> {
  if (!supabase) return false;
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return false;
  const { data } = await supabase
    .from("profiles").select("public_profile").eq("id", uid).maybeSingle();
  return !!data?.public_profile;
}
