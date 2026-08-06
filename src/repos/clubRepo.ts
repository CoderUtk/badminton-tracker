import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import { getDb } from "../db/db";

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
    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from clubs_cache");
      await db.runAsync("delete from club_players_cache");
      for (const c of clubs.data ?? []) {
        await db.runAsync(
          "insert into clubs_cache (id, name, invite_code, role, personal) values (?, ?, ?, ?, ?)",
          c.id, c.name, c.invite_code, roleByClub.get(c.id) ?? "member", c.personal ? 1 : 0
        );
      }
      for (const p of players.data ?? []) {
        await db.runAsync(
          "insert into club_players_cache (id, club_id, profile_id, name) values (?, ?, ?, ?)",
          p.id, p.club_id, p.profile_id, p.name
        );
      }
    });
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
 * the owner or has tournament history (see 0026_leave_club.sql).
 */
export async function leaveClub(clubId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to leave a club");
  const { error } = await supabase.rpc("leave_club", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync("delete from clubs_cache where id = ?", clubId);
  await db?.runAsync("delete from club_players_cache where club_id = ?", clubId);
}
