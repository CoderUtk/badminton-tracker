import * as Crypto from "expo-crypto";
import { getDb } from "../db/db";
import type { MatchConfig, MatchEvent, MatchState, TeamId } from "../engine";
import { replay } from "../engine";
import { winnerFromGames, type GameScore } from "../lib/scoreEntry";

export type { MatchRecord, SidePlayer } from "./matchRecord";
import type { MatchRecord, SidePlayer } from "./matchRecord";

export async function createMatch(
  config: MatchConfig,
  sideA: SidePlayer[],
  sideB: SidePlayer[],
  clubId: string | null,
  sessionId: string | null
): Promise<string> {
  const id = Crypto.randomUUID();
  const db = await getDb();
  await db?.runAsync(
    `insert into matches (id, club_id, session_id, config, side_a, side_b, status, created_at)
     values (?, ?, ?, ?, ?, ?, 'live', ?)`,
    id, clubId, sessionId, JSON.stringify(config),
    JSON.stringify(sideA), JSON.stringify(sideB), Date.now()
  );
  // A session with a match in progress is itself in progress: promote it out of
  // the "scheduled" state so its status reflects the live play.
  if (sessionId) {
    await db?.runAsync(
      "update sessions_cache set status = 'live', synced = 0 where id = ? and status = 'scheduled'",
      sessionId
    );
  }
  return id;
}

/**
 * Record a match that was played but never scored in the app — the host types
 * the final games and we store the finished row directly. No events are
 * written, so replayMatch() returns null for it; every consumer that matters
 * (leaderboards, session stats, analytics) reads status/winner/score_summary,
 * which are exactly what a live match writes when it finishes.
 */
export async function logMatch(
  config: MatchConfig,
  sideA: SidePlayer[],
  sideB: SidePlayer[],
  clubId: string | null,
  sessionId: string | null,
  games: GameScore[]
): Promise<string> {
  const id = Crypto.randomUUID();
  const db = await getDb();
  await db?.runAsync(
    `insert into matches (id, club_id, session_id, config, side_a, side_b, status, winner, score_summary, created_at)
     values (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
    id, clubId, sessionId, JSON.stringify(config),
    JSON.stringify(sideA), JSON.stringify(sideB),
    winnerFromGames(games), JSON.stringify({ games }), Date.now()
  );
  // Same promotion createMatch() does: a session someone is logging results
  // into is under way, whatever its stored status says.
  if (sessionId) {
    await db?.runAsync(
      "update sessions_cache set status = 'live', synced = 0 where id = ? and status = 'scheduled'",
      sessionId
    );
  }
  return id;
}

export async function appendEvent(matchId: string, seq: number, event: MatchEvent) {
  const db = await getDb();
  await db?.runAsync(
    "insert or ignore into match_events (match_id, seq, event) values (?, ?, ?)",
    matchId, seq, JSON.stringify(event)
  );
}

/** Undo: physically remove the last event locally (never synced rows). */
export async function removeEventsAfter(matchId: string, lastKeptSeq: number) {
  const db = await getDb();
  await db?.runAsync(
    "delete from match_events where match_id = ? and seq > ? and synced = 0",
    matchId, lastKeptSeq
  );
}

export async function loadEvents(matchId: string): Promise<MatchEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<{ event: string }>(
    "select event from match_events where match_id = ? order by seq",
    matchId
  );
  return rows.map((r) => JSON.parse(r.event));
}

export async function finalizeMatch(matchId: string, state: MatchState) {
  const db = await getDb();
  const summary = { games: state.gameHistory.map((g) => g.score) };
  await db?.runAsync(
    "update matches set status = 'completed', winner = ?, score_summary = ?, synced = 0 where id = ?",
    state.winner, JSON.stringify(summary), matchId
  );
}

/**
 * Periodic live-score snapshot written while a match is in progress — not a
 * status change. Called every ~15s by matchStore's live tick so other
 * devices' next sync sees the current score without waiting for the match
 * to finish. The `status = 'live'` guard makes a stray tick that races a
 * just-finished match's finalizeMatch() a silent no-op instead of
 * resurrecting score_summary after completion.
 */
export async function updateLiveScore(matchId: string, state: MatchState) {
  const db = await getDb();
  const summary = {
    games: state.gameHistory.map((g) => g.score),
    current: { A: state.score.A, B: state.score.B },
  };
  await db?.runAsync(
    "update matches set score_summary = ?, synced = 0 where id = ? and status = 'live'",
    JSON.stringify(summary), matchId
  );
}

/**
 * End a match before it reaches a natural finish (user taps "End"). The current
 * in-progress game is included in the summary, and the winner is decided by
 * games won, falling back to the current game's leader (null if dead level).
 */
export async function endMatchEarly(matchId: string, state: MatchState) {
  const db = await getDb();
  const games = state.gameHistory.map((g) => g.score);
  if (state.phase !== "match_over" && (state.score.A > 0 || state.score.B > 0)) {
    games.push({ A: state.score.A, B: state.score.B });
  }
  const winner: TeamId | null =
    state.winner ??
    (state.gamesWon.A !== state.gamesWon.B
      ? state.gamesWon.A > state.gamesWon.B ? "A" : "B"
      : state.score.A === state.score.B
      ? null
      : state.score.A > state.score.B ? "A" : "B");
  await db?.runAsync(
    "update matches set status = 'completed', winner = ?, score_summary = ?, synced = 0 where id = ?",
    winner, JSON.stringify({ games }), matchId
  );
}

/** End every still-live match belonging to a session (used when a session ends). */
export async function endLiveMatchesForSession(sessionId: string) {
  const live = (await listMatchesForSession(sessionId)).filter((m) => m.status === "live");
  for (const m of live) {
    const state = await replayMatch(m.id);
    if (state) {
      await endMatchEarly(m.id, state);
    } else {
      const db = await getDb();
      await db?.runAsync(
        "update matches set status = 'completed', synced = 0 where id = ?", m.id
      );
    }
  }
}

export async function getMatch(matchId: string): Promise<MatchRecord | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "select * from matches where id = ?", matchId
  );
  return row ? rowToRecord(row) : null;
}

export async function listMatches(): Promise<MatchRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "select * from matches order by created_at desc limit 100"
  );
  return rows.map(rowToRecord);
}

/** Every match on the device, uncapped — unlike listMatches(), which caps at
 *  100 rows for the Matches list screen's performance. Used by achievement
 *  analytics, which needs full lifetime history to correctly evaluate
 *  milestone badges (e.g. 100 wins). */
export async function listAllMatches(): Promise<MatchRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "select * from matches order by created_at desc"
  );
  return rows.map(rowToRecord);
}

export async function listMatchesForSession(sessionId: string): Promise<MatchRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "select * from matches where session_id = ? order by created_at desc", sessionId
  );
  return rows.map(rowToRecord);
}

export async function listMatchesForClub(clubId: string): Promise<MatchRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "select * from matches where club_id = ? order by created_at desc", clubId
  );
  return rows.map(rowToRecord);
}

/**
 * Personal matches (no club) are local-only — never pushed by syncNow (see
 * sync/runner.ts's `club_id is not null` filter) — so deleting one is a plain
 * local delete. Club matches are shared history synced to other members and
 * have no delete path yet; the `club_id is null` guard keeps this function
 * from silently doing a local-only "delete" that syncNow just re-pulls back.
 */
export async function deleteMatch(matchId: string): Promise<void> {
  const db = await getDb();
  await db?.withTransactionAsync(async () => {
    await db.runAsync("delete from match_events where match_id = ?", matchId);
    await db.runAsync("delete from matches where id = ? and club_id is null", matchId);
  });
}

export async function replayMatch(matchId: string): Promise<MatchState | null> {
  const events = await loadEvents(matchId);
  return events.length ? replay(events) : null;
}

function rowToRecord(row: Record<string, unknown>): MatchRecord {
  return {
    id: row.id as string,
    club_id: (row.club_id as string) ?? null,
    session_id: (row.session_id as string) ?? null,
    config: JSON.parse(row.config as string),
    side_a: JSON.parse(row.side_a as string),
    side_b: JSON.parse(row.side_b as string),
    status: row.status as MatchRecord["status"],
    winner: (row.winner as TeamId) ?? null,
    score_summary: row.score_summary ? JSON.parse(row.score_summary as string) : null,
    created_at: row.created_at as number,
  };
}
