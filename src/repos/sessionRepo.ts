import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import { isStaleLive } from "../session/autoFinish";
import type { ClubPlayer } from "./clubRepo";
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
  const id = Crypto.randomUUID();
  const db = await getDb();
  await db?.runAsync(
    `insert into sessions_cache (id, club_id, starts_at, location, courts, status, created_at)
     values (?, ?, ?, ?, ?, 'scheduled', ?)`,
    id, input.clubId, input.startsAt, input.location?.trim() || null,
    Math.max(1, Math.min(20, Math.floor(input.courts))), Date.now()
  );
  return id;
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
    if (isStaleLive(row, now)) {
      await endSession(row.id);
      row.status = "done";
    }
  }
  return rows;
}

export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>("select * from sessions_cache where id = ?", id)) ?? null;
  if (row && isStaleLive(row, Date.now())) {
    await endSession(row.id);
    row.status = "done";
  }
  return row;
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  const db = await getDb();
  await db?.runAsync(
    "update sessions_cache set status = ?, ends_at = case when ? = 'done' then ? else ends_at end, synced = 0 where id = ?",
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
 * Hard-delete a session. Matches created under it survive, unlinked — SQLite
 * has no FK enforcement locally, so this mirrors in code the same
 * on-delete-set-null relationship the Supabase schema already declares for
 * matches.session_id (0001_init.sql:77).
 */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync("update matches set session_id = null where session_id = ?", id);
  await db?.runAsync("delete from sessions_cache where id = ?", id);
}

export async function setAttendance(
  sessionId: string,
  playerId: string,
  status: AttendanceStatus
): Promise<void> {
  const db = await getDb();
  await db?.runAsync(
    `insert into attendance_cache (session_id, club_player_id, status, synced)
     values (?, ?, ?, 0)
     on conflict(session_id, club_player_id) do update set status = excluded.status, synced = 0`,
    sessionId, playerId, status
  );
}
