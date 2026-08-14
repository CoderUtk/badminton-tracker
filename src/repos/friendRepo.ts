import { supabase } from "../lib/supabase";

export interface Friend {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FriendRequestRow {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase!.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Sign in to use friends");
  return uid;
}

async function profilesById(ids: string[]): Promise<Map<string, { displayName: string; avatarUrl: string | null }>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase!
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((p) => [p.id, { displayName: p.display_name ?? "Player", avatarUrl: p.avatar_url }])
  );
}

/** Sends a friend request by exact username match. Throws if the username doesn't exist, is your own, or a request/friendship already exists in either direction. */
export async function sendFriendRequest(username: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to add a friend");
  const uid = await currentUserId();
  const trimmed = username.trim().toLowerCase();
  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", trimmed)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!target) throw new Error(`No player found with username "${trimmed}"`);
  if (target.id === uid) throw new Error("You can't friend yourself");
  const { error } = await supabase.from("friendships").insert({ requester_id: uid, addressee_id: target.id });
  if (error) {
    if (error.code === "23505") throw new Error("Already friends or request already pending");
    throw new Error(error.message);
  }
}

/** Accept or decline an incoming request. Only the addressee may call this. */
export async function respondToRequest(requesterId: string, accept: boolean): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage friend requests");
  const uid = await currentUserId();
  if (accept) {
    const { error } = await supabase.rpc("accept_friend_request", { p_requester_id: requesterId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("requester_id", requesterId)
      .eq("addressee_id", uid);
    if (error) throw new Error(error.message);
  }
}

/** Cancels a request you sent that hasn't been responded to yet. */
export async function cancelRequest(addresseeId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage friend requests");
  const uid = await currentUserId();
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", uid)
    .eq("addressee_id", addresseeId);
  if (error) throw new Error(error.message);
}

/** Removes an accepted friendship. Either party may call this. */
export async function removeFriend(friendId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage friends");
  const uid = await currentUserId();
  const { error } = await supabase
    .from("friendships")
    .delete()
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${uid})`);
  if (error) throw new Error(error.message);
}

export async function listFriends(): Promise<Friend[]> {
  if (!supabase) return [];
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  if (error) throw new Error(error.message);
  const otherIds = (data ?? []).map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
  const profiles = await profilesById(otherIds);
  return otherIds.map((id) => ({ id, ...(profiles.get(id) ?? { displayName: "Player", avatarUrl: null }) }));
}

export async function listIncomingRequests(): Promise<FriendRequestRow[]> {
  if (!supabase) return [];
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("requester_id")
    .eq("status", "pending")
    .eq("addressee_id", uid);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.requester_id);
  const profiles = await profilesById(ids);
  return ids.map((id) => ({ profileId: id, ...(profiles.get(id) ?? { displayName: "Player", avatarUrl: null }) }));
}

export async function listOutgoingRequests(): Promise<FriendRequestRow[]> {
  if (!supabase) return [];
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("addressee_id")
    .eq("status", "pending")
    .eq("requester_id", uid);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => r.addressee_id);
  const profiles = await profilesById(ids);
  return ids.map((id) => ({ profileId: id, ...(profiles.get(id) ?? { displayName: "Player", avatarUrl: null }) }));
}

/** Strips characters that are significant to PostgREST's `.or()` filter grammar
 *  (`,` `(` `)` split/terminate clauses; `"` breaks quoting; `%` is an ilike
 *  wildcard) so a literal search term can't rewrite the query. `_` and `.` are
 *  left intact — both are legal in real usernames/display names, and `_` at
 *  worst widens an ilike match rather than breaking anything. */
export function sanitizeSearchTerm(s: string): string {
  return s.replace(/[,()"%]/g, "");
}

/** Live username/display-name prefix search. profiles are readable by any
 *  authenticated user (0001_init.sql), so no RLS change was needed for this. */
export async function searchUsers(prefix: string): Promise<{ id: string; username: string; displayName: string }[]> {
  const trimmed = prefix.trim();
  if (!supabase || trimmed.length < 2) return [];
  const safe = sanitizeSearchTerm(trimmed);
  if (safe.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .or(`username.ilike."${safe}%",display_name.ilike."${safe}%"`)
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ id: p.id, username: p.username, displayName: p.display_name }));
}
