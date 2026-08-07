import { getDb } from "../db/db";
import { supabase } from "../lib/supabase";
import { isStaleLive } from "../session/autoFinish";
import { listRealClubs, type ClubPlayer } from "./clubRepo";
import {
  endLiveMatchesForSession, listMatchesForClub, listMatchesForSession,
  type MatchRecord,
} from "./matchRepo";

export type SessionStatus = "scheduled" | "live" | "done" | "cancelled";
export type AttendanceStatus = "in" | "maybe" | "out";

export interface ClubSession {
  id: string;
  club_id: string;
  starts_at: number;
  ends_at: number | null;
  location: string | null;
  courts: number;
  status: SessionStatus;
  created_at: number;
  // Nullable: a session whose creator's account was later deleted keeps the
  // session (0016_profile_delete_cascade.sql sets this null rather than
  // cascading), but no one is "the creator" anymore — isCreator checks in
  // Task 2 naturally evaluate false, which is the correct, safe behavior.
  created_by: string | null;
}

export interface Attendance extends ClubPlayer {
  status: AttendanceStatus;
}

export async function createSession(input: {
  clubId: string;
  startsAt: number;
  location?: string;
  courts: number;
}): Promise<string> {
  if (!supabase) throw new Error("Sign in to plan a session");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to plan a session");
  const courts = Math.max(1, Math.min(20, Math.floor(input.courts)));
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      club_id: input.clubId,
      starts_at: new Date(input.startsAt).toISOString(),
      location: input.location?.trim() || null,
      courts,
      created_by: uid,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await refreshSessions();
  return data.id as string;
}

/**
 * Pull sessions + attendance for every club the user belongs to into the
 * local cache. No-op offline or with no real clubs. Mirrors
 * clubRepo.refreshClubs's write-through-then-refresh shape.
 */
let refreshing = false;
export async function refreshSessions(): Promise<void> {
  if (!supabase || refreshing) return;
  refreshing = true;
  try {
    const db = await getDb();
    if (!db) return;
    const clubs = await listRealClubs();
    if (clubs.length === 0) return;
    const clubIds = clubs.map((c) => c.id);

    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, club_id, starts_at, ends_at, location, courts, status, created_at, created_by")
      .in("club_id", clubIds);
    if (sErr) return; // stay on cache

    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    const attendance = sessionIds.length > 0
      ? await supabase.from("attendance").select("session_id, club_player_id, status").in("session_id", sessionIds)
      : { data: [] as { session_id: string; club_player_id: string; status: string }[], error: null };
    if (attendance.error) return; // stay on cache

    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from sessions_cache");
      await db.runAsync("delete from attendance_cache");
      for (const s of sessions ?? []) {
        await db.runAsync(
          `insert into sessions_cache
             (id, club_id, starts_at, ends_at, location, courts, status, created_at, created_by, synced)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          s.id as string, s.club_id as string, new Date(s.starts_at as string).getTime(),
          s.ends_at ? new Date(s.ends_at as string).getTime() : null,
          s.location as string | null, s.courts as number, s.status as string,
          new Date(s.created_at as string).getTime(), s.created_by as string,
        );
      }
      for (const a of attendance.data ?? []) {
        await db.runAsync(
          "insert into attendance_cache (session_id, club_player_id, status, synced) values (?, ?, ?, 1)",
          a.session_id as string, a.club_player_id as string, a.status as string,
        );
      }
    });
  } finally {
    refreshing = false;
  }
}

export async function listSessions(clubId?: string): Promise<ClubSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = clubId
    ? await db.getAllAsync<ClubSession>(
        "select * from sessions_cache where club_id = ? order by starts_at desc", clubId
      )
    : await db.getAllAsync<ClubSession>("select * from sessions_cache order by starts_at desc");
  const now = Date.now();
  for (const row of rows) {
    if (!isStaleLive(row, now)) continue;
    try {
      await endSession(row.id);
      row.status = "done";
    } catch {
      // Leave this row live; the next read retries it. A failed sweep must
      // never prevent the rest of the list from loading.
    }
  }
  return rows;
}

export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>("select * from sessions_cache where id = ?", id)) ?? null;
  if (row && isStaleLive(row, Date.now())) {
    try {
      await endSession(row.id);
      row.status = "done";
    } catch {
      // Leave this row live; the next read retries it. A failed sweep must
      // never prevent the rest of the list from loading.
    }
  }
  return row;
}

/** Change a session's status. Any club member may call this (RPC-gated, not admin-only). */
export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  if (!supabase) throw new Error("Sign in to update a session");
  const { error } = await supabase.rpc("set_session_status", { p_session_id: id, p_status: status });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync(
    "update sessions_cache set status = ?, ends_at = case when ? = 'done' then ? else ends_at end where id = ?",
    status, status, Date.now(), id
  );
}

/** End a session: finish any still-live matches, then mark the session done. */
export async function endSession(id: string): Promise<void> {
  await endLiveMatchesForSession(id);
  await updateSessionStatus(id, "done");
}

export interface PlayerStat {
  name: string;
  wins: number;
  losses: number;
  played: number;
}

export interface SessionStats {
  matchCount: number;
  gameCount: number;
  players: PlayerStat[];
}

/** Aggregate per-player win/loss stats across a set of completed matches. */
function aggregate(matches: MatchRecord[]): SessionStats {
  const done = matches.filter((m) => m.status === "completed");
  const byName = new Map<string, PlayerStat>();
  const bump = (name: string, field: "wins" | "losses") => {
    const stat = byName.get(name) ?? { name, wins: 0, losses: 0, played: 0 };
    stat[field] += 1;
    stat.played += 1;
    byName.set(name, stat);
  };
  let gameCount = 0;
  for (const m of done) {
    gameCount += m.score_summary?.games.length ?? 0;
    if (!m.winner) continue;
    const winners = m.winner === "A" ? m.side_a : m.side_b;
    const losers = m.winner === "A" ? m.side_b : m.side_a;
    winners.forEach((p) => bump(p.name, "wins"));
    losers.forEach((p) => bump(p.name, "losses"));
  }
  const players = [...byName.values()].sort(
    (a, b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name)
  );
  return { matchCount: done.length, gameCount, players };
}

export async function getSessionStats(sessionId: string): Promise<SessionStats> {
  return aggregate(await listMatchesForSession(sessionId));
}

/** Lifetime per-player stats across every completed match in a club. */
export async function getClubStats(clubId: string): Promise<SessionStats> {
  return aggregate(await listMatchesForClub(clubId));
}

export async function listAttendance(sessionId: string, clubId: string): Promise<Attendance[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<Attendance>(
    `select p.id, p.club_id, p.profile_id, p.name, coalesce(a.status, 'out') as status
     from club_players_cache p
     left join attendance_cache a on a.club_player_id = p.id and a.session_id = ?
     where p.club_id = ? order by p.name`,
    sessionId, clubId
  );
}

/**
 * Delete a session. Creator only (enforced by RLS — a blocked delete returns
 * zero rows, which the .select() + throw-on-empty check turns into a real
 * error rather than a silent no-op). Matches created under it survive,
 * unlinked, mirroring the on-delete-set-null relationship already declared
 * for matches.session_id (0001_init.sql:77).
 */
export async function deleteSession(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to delete a session");
  const { data, error } = await supabase.from("sessions").delete().eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete session");
  const db = await getDb();
  await db?.runAsync("update matches set session_id = null where session_id = ?", id);
  await db?.runAsync("delete from attendance_cache where session_id = ?", id);
  await db?.runAsync("delete from sessions_cache where id = ?", id);
}

/** Check a player in/out. Any club member may mark any player (shared check-in board). */
export async function setAttendance(
  sessionId: string,
  playerId: string,
  status: AttendanceStatus
): Promise<void> {
  if (!supabase) throw new Error("Sign in to update attendance");
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      { session_id: sessionId, club_player_id: playerId, status },
      { onConflict: "session_id,club_player_id" },
    )
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not update attendance");
  const db = await getDb();
  await db?.runAsync(
    `insert into attendance_cache (session_id, club_player_id, status, synced)
     values (?, ?, ?, 1)
     on conflict(session_id, club_player_id) do update set status = excluded.status, synced = 1`,
    sessionId, playerId, status
  );
}

/** Non-empty locations for the given session ids, keyed by session id. Used
 *  by achievements (Explorer) to count distinct venues without matches
 *  needing to carry their own venue field. */
export async function getSessionLocations(sessionIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (sessionIds.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = await db.getAllAsync<{ id: string; location: string | null }>(
    `select id, location from sessions_cache where id in (${placeholders})`,
    ...sessionIds
  );
  for (const r of rows) {
    if (r.location && r.location.trim()) map.set(r.id, r.location);
  }
  return map;
}
