import { getDb } from "../db/db";
import { insertMany } from "../db/batch";
import { supabase } from "../lib/supabase";
import { isStaleLive } from "../session/autoFinish";
import { listRealClubs, type ClubPlayer } from "./clubRepo";
import {
  endLiveMatchesForSession, listMatchesForClub, listMatchesForSession,
  type MatchRecord, type SidePlayer,
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
  /** Total cost of the night in minor units (paise/cents). 0 = not recorded. */
  cost_total_cents: number;
  shuttles: number;
  /** club_player_id of whoever fronted the money, or null. */
  paid_by: string | null;
}

export interface Attendance extends ClubPlayer {
  status: AttendanceStatus;
  settled: boolean;
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
      .select("id, club_id, starts_at, ends_at, location, courts, status, created_at, created_by, cost_total_cents, shuttles, paid_by")
      .in("club_id", clubIds);
    if (sErr) return; // stay on cache

    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    const attendance = sessionIds.length > 0
      ? await supabase.from("attendance").select("session_id, club_player_id, status, settled").in("session_id", sessionIds)
      : { data: [] as { session_id: string; club_player_id: string; status: string; settled: boolean }[], error: null };
    if (attendance.error) return; // stay on cache

    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from sessions_cache");
      await db.runAsync("delete from attendance_cache");
      // `synced` was a literal 1 in the old VALUES clause; it becomes an
      // explicit column here. Column order matches the table definition in
      // src/db/db.ts.
      await insertMany(
        db, "sessions_cache",
        ["id", "club_id", "starts_at", "ends_at", "location", "courts",
         "status", "created_at", "created_by", "cost_total_cents", "shuttles",
         "paid_by", "synced"],
        (sessions ?? []).map((s) => [
          s.id as string, s.club_id as string, new Date(s.starts_at as string).getTime(),
          s.ends_at ? new Date(s.ends_at as string).getTime() : null,
          s.location as string | null, s.courts as number, s.status as string,
          new Date(s.created_at as string).getTime(), s.created_by as string,
          (s.cost_total_cents as number) ?? 0, (s.shuttles as number) ?? 0,
          s.paid_by as string | null, 1,
        ]),
      );
      await insertMany(
        db, "attendance_cache", ["session_id", "club_player_id", "status", "settled", "synced"],
        (attendance.data ?? []).map((a) => [
          a.session_id as string, a.club_player_id as string, a.status as string,
          a.settled ? 1 : 0, 1,
        ]),
      );
    });
  } finally {
    refreshing = false;
  }
}

/**
 * Cache-only read. A stale-live session is *reported* as "done" without
 * persisting that — isStaleLive is a pure local computation over rows already
 * in hand, so it costs nothing.
 *
 * Persisting the auto-finish is sweepStaleLiveSessions' job, which runs once at
 * app start. It used to happen inline here, which meant a plain cache read
 * could fire N match replays and N Supabase RPCs before returning — on Home's
 * critical path (app/(app)/index.tsx).
 */
export async function listSessions(clubId?: string): Promise<ClubSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = clubId
    ? await db.getAllAsync<ClubSession>(
        "select * from sessions_cache where club_id = ? order by starts_at desc", clubId
      )
    : await db.getAllAsync<ClubSession>("select * from sessions_cache order by starts_at desc");
  const now = Date.now();
  return rows.map((row) => (isStaleLive(row, now) ? { ...row, status: "done" as const } : row));
}

export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>("select * from sessions_cache where id = ?", id)) ?? null;
  if (row && isStaleLive(row, Date.now())) return { ...row, status: "done" };
  return row;
}

/**
 * Persists the auto-finish of sessions left live past AUTO_FINISH_HOURS.
 * Fire-and-forget, called once at app start from app/_layout.tsx.
 *
 * Failures are swallowed per session: one session that cannot be ended must
 * not stop the others, and the next app open retries. This is strictly more
 * reliable than the previous inline sweep, which only ran when someone
 * happened to open a screen that listed sessions.
 */
export async function sweepStaleLiveSessions(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.getAllAsync<ClubSession>(
    "select * from sessions_cache where status = 'live'"
  );
  const now = Date.now();
  for (const row of rows) {
    if (!isStaleLive(row, now)) continue;
    try {
      await endSession(row.id);
    } catch {
      // Retried on the next app open.
    }
  }
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
  /**
   * Stable identity for grouping. The club_player_id when the player is on a
   * roster, otherwise `guest:<name>`.
   *
   * Grouping used to key on display name, which silently merged two players
   * called "Rahul" into a single row with their records added together.
   * Guests genuinely have no identity beyond their name, so two same-named
   * guests still merge -- they are transient, un-rostered entries and giving
   * them synthetic ids would change what a guest is.
   */
  id: string;
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

/** Grouping key for a player appearing on a match side. */
export function playerStatId(p: SidePlayer): string {
  return p.club_player_id ?? `guest:${p.name}`;
}

/** Aggregate per-player win/loss stats across a set of completed matches. */
function aggregate(matches: MatchRecord[]): SessionStats {
  const done = matches.filter((m) => m.status === "completed");
  const byId = new Map<string, PlayerStat>();
  const bump = (p: SidePlayer, field: "wins" | "losses") => {
    const id = playerStatId(p);
    const stat = byId.get(id) ?? { id, name: p.name, wins: 0, losses: 0, played: 0 };
    stat[field] += 1;
    stat.played += 1;
    byId.set(id, stat);
  };
  let gameCount = 0;
  for (const m of done) {
    gameCount += m.score_summary?.games.length ?? 0;
    if (!m.winner) continue;
    const winners = m.winner === "A" ? m.side_a : m.side_b;
    const losers = m.winner === "A" ? m.side_b : m.side_a;
    winners.forEach((p) => bump(p, "wins"));
    losers.forEach((p) => bump(p, "losses"));
  }
  // id is the final tiebreak so two players with the same name AND the same
  // record sort deterministically rather than by Map insertion order.
  const players = [...byId.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.played - a.played ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
  return { matchCount: done.length, gameCount, players };
}

// Exported for the node-env unit tests; not part of the module's public API.
export { aggregate as aggregateForTest };

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
  const rows = await db.getAllAsync<Omit<Attendance, "settled"> & { settled: number }>(
    `select p.id, p.club_id, p.profile_id, p.name, coalesce(a.status, 'out') as status,
            coalesce(a.settled, 0) as settled
     from club_players_cache p
     left join attendance_cache a on a.club_player_id = p.id and a.session_id = ?
     where p.club_id = ? order by p.name`,
    sessionId, clubId
  );
  // SQLite has no boolean; the column is an integer flag.
  return rows.map((r) => ({ ...r, settled: !!r.settled }));
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

export interface CostShare {
  playerId: string;
  name: string;
  /** This player's slice of the total, in minor units. */
  cents: number;
  /** Settled explicitly, or implicitly because they fronted the money. */
  settled: boolean;
  isPayer: boolean;
}

export interface CostSplit {
  totalCents: number;
  shuttles: number;
  paidBy: string | null;
  headCount: number;
  shares: CostShare[];
  /** Still owed to the payer: unsettled shares, excluding the payer's own. */
  outstandingCents: number;
}

/**
 * Split a session's cost across everyone checked in.
 *
 * The remainder is handed out one minor unit at a time to the first players in
 * a stable id order rather than rounded per head, so the shares always sum to
 * exactly the total. Rounding each head independently makes 800/3 come to
 * 801 or 798 and invites "why doesn't this add up".
 *
 * The payer is never counted as owing: they already put the whole amount in.
 * Their share still appears, as their own contribution.
 *
 * Pure — no I/O — so the arithmetic is unit-testable on its own.
 */
export function splitCost(
  session: Pick<ClubSession, "cost_total_cents" | "shuttles" | "paid_by">,
  attendance: Attendance[],
): CostSplit {
  const total = Math.max(0, Math.floor(session.cost_total_cents || 0));
  const paidBy = session.paid_by ?? null;
  const present = attendance
    .filter((a) => a.status === "in")
    .sort((a, b) => a.id.localeCompare(b.id));
  const n = present.length;
  if (n === 0 || total === 0) {
    return {
      totalCents: total, shuttles: session.shuttles || 0, paidBy,
      headCount: n, shares: [], outstandingCents: 0,
    };
  }
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  let outstanding = 0;
  const shares = present.map((p, i): CostShare => {
    const isPayer = !!paidBy && p.id === paidBy;
    const settled = p.settled || isPayer;
    const cents = base + (i < remainder ? 1 : 0);
    if (!settled) outstanding += cents;
    return { playerId: p.id, name: p.name, cents, settled, isPayer };
  });
  return {
    totalCents: total, shuttles: session.shuttles || 0, paidBy,
    headCount: n, shares, outstandingCents: outstanding,
  };
}

/**
 * Set what the night cost, how many shuttles it burned, and who fronted it.
 * RPC-gated to the session creator or a club admin — the table's own UPDATE
 * policy is admin-only, so a non-admin creator could not do this directly.
 */
export async function setSessionCost(
  sessionId: string,
  input: { totalCents: number; shuttles: number; paidBy: string | null },
): Promise<void> {
  if (!supabase) throw new Error("Sign in to record a session cost");
  const totalCents = Math.max(0, Math.min(100_000_000, Math.round(input.totalCents)));
  const shuttles = Math.max(0, Math.min(500, Math.round(input.shuttles)));
  const { error } = await supabase.rpc("set_session_cost", {
    p_session_id: sessionId,
    p_cost_total_cents: totalCents,
    p_shuttles: shuttles,
    p_paid_by: input.paidBy,
  });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync(
    "update sessions_cache set cost_total_cents = ?, shuttles = ?, paid_by = ? where id = ?",
    totalCents, shuttles, input.paidBy, sessionId
  );
}

/** Mark one player's share paid up. Same creator-or-admin gate as the cost itself. */
export async function setAttendanceSettled(
  sessionId: string,
  playerId: string,
  settled: boolean,
): Promise<void> {
  if (!supabase) throw new Error("Sign in to settle a share");
  const { error } = await supabase.rpc("set_attendance_settled", {
    p_session_id: sessionId,
    p_club_player_id: playerId,
    p_settled: settled,
  });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync(
    "update attendance_cache set settled = ? where session_id = ? and club_player_id = ?",
    settled ? 1 : 0, sessionId, playerId
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
