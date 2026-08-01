import { supabase } from "../lib/supabase";
import { refreshClubs } from "./clubRepo";

export type ClubPreview = { id: string; name: string; memberCount: number };
export type RequestOutcome = "member" | "pending" | "denied";
export type JoinRequest = {
  id: string;
  clubId: string;
  profileId: string;
  displayName: string;
  createdAt: string;
};

/** Club name + size for someone who is not a member yet. Null if it is gone. */
export async function getClubPreview(clubId: string): Promise<ClubPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("club_preview", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  const row = (data as { id: string; name: string; member_count: number }[] | null)?.[0];
  if (!row) return null;
  return { id: row.id, name: row.name, memberCount: row.member_count ?? 0 };
}

/** Ask to join. Idempotent — re-requesting reports the current state. */
export async function requestJoinClub(clubId: string): Promise<RequestOutcome> {
  if (!supabase) throw new Error("Sign in to request access");
  const { data, error } = await supabase.rpc("request_club_join", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  return data as RequestOutcome;
}

/**
 * The admin queue. Joined to profiles for a human name; RLS already limits the
 * rows to clubs the caller administers.
 */
export async function listPendingRequests(clubId: string): Promise<JoinRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("club_join_requests")
    .select("id, club_id, profile_id, created_at, profiles(display_name)")
    .eq("club_id", clubId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string; club_id: string; profile_id: string; created_at: string;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      clubId: row.club_id,
      profileId: row.profile_id,
      displayName: profile?.display_name || "Player",
      createdAt: row.created_at,
    };
  });
}

export async function approveRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage requests");
  const { error } = await supabase.rpc("approve_club_join", { p_request_id: requestId });
  if (error) throw new Error(error.message);
  // The approved member gains a club_members row; refresh so caches agree.
  await refreshClubs();
}

export async function denyRequest(requestId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage requests");
  const { error } = await supabase.rpc("deny_club_join", { p_request_id: requestId });
  if (error) throw new Error(error.message);
}
