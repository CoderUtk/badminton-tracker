import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import { getDb } from "../db/db";
import { insertMany } from "../db/batch";
import { clearSetting, MATCH_PULL_KEY } from "./settingsRepo";

export interface Club {
  id: string;
  name: string;
  invite_code: string | null;
  role: string | null;
  personal: boolean;
}

export interface ClubPlayer {
  id: string;
  club_id: string;
  profile_id: string | null;
  name: string;
}

export async function createClub(name: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to create a club");
  const { data, error } = await supabase.rpc("create_club", { p_name: name });
  if (error) throw error;
  await refreshClubs();
  return data as string;
}

export async function joinClub(inviteCode: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to join a club");
  const { data, error } = await supabase.rpc("join_club", { p_invite_code: inviteCode });
  if (error) throw error;
  await refreshClubs();
  return data as string;
}

export async function addGuestPlayer(clubId: string, name: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to add players");
  const { error } = await supabase
    .from("club_players")
    .insert({ club_id: clubId, name });
  if (error) throw error;
  await refreshClubs();
}

/** Adds an accepted friend directly to a club's roster, skipping the invite-code flow. Owners/admins only (enforced by the RPC). */
export async function addFriendToClub(clubId: string, friendId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to add players");
  const { error } = await supabase.rpc("add_friend_to_club", { p_club_id: clubId, p_friend_id: friendId });
  if (error) throw new Error(error.message);
  await refreshClubs();
}

/** Pull clubs + players from Supabase into the local cache. No-op offline. */
let refreshing = false;
export async function refreshClubs(): Promise<void> {
  if (!supabase || refreshing) return;
  refreshing = true;
  try {
    const db = await getDb();
    if (!db) return;
    const [clubs, members, players] = await Promise.all([
      supabase.from("clubs").select("id, name, invite_code, personal"),
      supabase.from("club_members").select("club_id, role, profile_id"),
      supabase.from("club_players").select("id, club_id, profile_id, name"),
    ]);
    if (clubs.error || players.error) return; // stay on cache
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const roleByClub = new Map(
      (members.data ?? [])
        .filter((m) => m.profile_id === uid)
        .map((m) => [m.club_id, m.role])
    );
    // Gaining visibility of a club means its history is now readable but sits
    // entirely BEFORE this device's pull watermark, so the next pull would
    // return nothing and the club's leaderboard would stay empty -- the exact
    // bug src/sync/pull.ts exists to fix. Clearing the watermark makes the next
    // pull re-read everything. Doing it here covers every join route (invite
    // code, admin approval, being added as a friend) at once.
    //
    // Read the cached ids BEFORE the delete below, or every refresh looks like
    // a brand new set of clubs.
    const cachedIds = new Set(
      (await db.getAllAsync<{ id: string }>("select id from clubs_cache")).map((r) => r.id),
    );
    const gainedClub = (clubs.data ?? []).some((c) => !cachedIds.has(c.id));

    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from clubs_cache");
      await db.runAsync("delete from club_players_cache");
      await insertMany(
        db, "clubs_cache", ["id", "name", "invite_code", "role", "personal"],
        (clubs.data ?? []).map((c) => [
          c.id, c.name, c.invite_code, roleByClub.get(c.id) ?? "member", c.personal ? 1 : 0,
        ]),
      );
      await insertMany(
        db, "club_players_cache", ["id", "club_id", "profile_id", "name"],
        (players.data ?? []).map((p) => [p.id, p.club_id, p.profile_id, p.name]),
      );
    });
    if (gainedClub) await clearSetting(MATCH_PULL_KEY);
  } finally {
    refreshing = false;
  }
}

export async function listClubs(): Promise<Club[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Omit<Club, "personal"> & { personal: 0 | 1 }>(
    "select * from clubs_cache order by name"
  );
  return rows.map((r) => ({ ...r, personal: !!r.personal }));
}

/**
 * Clubs the user actually joined or created, excluding their hidden personal
 * club. Use this for anything the user sees; listClubs still returns
 * everything, because listAllTournaments must query personal clubs too.
 */
export async function listRealClubs(): Promise<Club[]> {
  return (await listClubs()).filter((c) => !c.personal);
}

export async function getClub(clubId: string): Promise<Club | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<Omit<Club, "personal"> & { personal: 0 | 1 }>(
    "select * from clubs_cache where id = ?", clubId
  );
  return row ? { ...row, personal: !!row.personal } : null;
}

/**
 * Delete a club. Owners only (enforced by RLS in 0008_club_delete.sql). The
 * .select() and row-count check are load-bearing: a policy-blocked delete
 * returns success with zero rows, so without this the caller would report a
 * delete that never happened.
 */
export async function deleteClub(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to delete a club");
  const { data, error } = await supabase.from("clubs").delete().eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete club");
  const db = await getDb();
  await db?.runAsync("delete from clubs_cache where id = ?", id);
  await db?.runAsync("delete from club_players_cache where club_id = ?", id);
}

export async function listPlayers(clubId: string): Promise<ClubPlayer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<ClubPlayer>(
    "select * from club_players_cache where club_id = ? order by name", clubId
  );
}

/** Every club-player row on this device, across all clubs — used to work out
 *  which name the signed-in user appears under in match records. */
export async function listMyClubPlayers(): Promise<ClubPlayer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<ClubPlayer>("select * from club_players_cache order by name");
}

/**
 * Role + avatar per club member, keyed by profile_id. Live query only —
 * club_players_cache (used by listPlayers) never synced these columns, and
 * this screen already requires a connection for add/remove actions, so a
 * supplementary live fetch is smaller than extending the offline cache.
 * Returns an empty map (not a throw) when offline — callers degrade to
 * name-only rows rather than failing the whole screen for a secondary field.
 */
export async function listPlayerRoles(clubId: string): Promise<Map<string, { role: string; avatarUrl: string | null }>> {
  if (!supabase) return new Map();
  const { data: members, error: mErr } = await supabase
    .from("club_members")
    .select("profile_id, role")
    .eq("club_id", clubId);
  if (mErr || !members) return new Map();
  const ids = members.map((m) => m.profile_id).filter(Boolean) as string[];
  if (ids.length === 0) return new Map();
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, avatar_url")
    .in("id", ids);
  const avatarById = new Map((profiles ?? []).map((p) => [p.id, p.avatar_url as string | null]));
  const out = new Map<string, { role: string; avatarUrl: string | null }>();
  for (const m of members) {
    if (!m.profile_id) continue;
    out.set(m.profile_id, { role: m.role, avatarUrl: pErr ? null : (avatarById.get(m.profile_id) ?? null) });
  }
  return out;
}

/** Distinct player names across every club (used to pick a profile identity). */
export async function listAllPlayerNames(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<{ name: string }>(
    "select distinct name from club_players_cache order by name"
  );
  return rows.map((r) => r.name);
}

export async function removePlayer(clubPlayerId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage players");
  const { error } = await supabase.rpc("remove_club_player", { p_club_player_id: clubPlayerId });
  if (error) throw new Error(error.message);
  await refreshClubs();
}

/**
 * A non-owner member leaves a club. Blocked server-side if the caller is
 * the owner or has tournament history (see 0028_leave_club.sql).
 */
export async function leaveClub(clubId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to leave a club");
  const { error } = await supabase.rpc("leave_club", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync("delete from clubs_cache where id = ?", clubId);
  await db?.runAsync("delete from club_players_cache where club_id = ?", clubId);
}
