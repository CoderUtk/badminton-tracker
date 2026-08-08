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
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("requester_id", requesterId)
      .eq("addressee_id", uid);
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
