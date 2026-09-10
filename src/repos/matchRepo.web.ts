import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import { captureError } from "../lib/observability";
import { toast } from "../lib/toast";
import type { MatchConfig, MatchEvent, MatchState, TeamId } from "../engine";
import { replay } from "../engine";
import { winnerFromGames, type GameScore } from "../lib/scoreEntry";

export type { MatchRecord, SidePlayer } from "./matchRecord";
import type { MatchRecord, SidePlayer } from "./matchRecord";

/** Supabase row (jsonb already parsed, created_at an ISO string) -> MatchRecord. */
export function mapRow(row: Record<string, any>): MatchRecord {
  return {
    id: row.id,
    club_id: null,
    session_id: null,
    config: row.config as MatchConfig,
    side_a: row.side_a as SidePlayer[],
    side_b: row.side_b as SidePlayer[],
    status: row.status as MatchRecord["status"],
    winner: (row.winner as TeamId) ?? null,
    score_summary: row.score_summary ?? null,
    created_at: new Date(row.created_at).getTime(),
  };
}

export async function createMatch(
  config: MatchConfig,
  sideA: SidePlayer[],
  sideB: SidePlayer[],
  _clubId: string | null,
  _sessionId: string | null,
): Promise<string> {
  if (!supabase) throw new Error("The app is not configured to reach the server.");
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Still signing you in — try that again in a moment.");
  const id = Crypto.randomUUID();
  const { error } = await supabase.from("guest_matches").insert({
    id,
    config,
    side_a: sideA,
    side_b: sideB,
    created_by: data.user.id,
  });
  if (error) throw new Error(error.message);
  return id;
}

/**
 * Web twin of matchRepo's logMatch(): a match played but never scored here.
 * Insert-then-complete rather than one insert, so the row is created by the
 * same createMatch() the live path uses and only the finished fields differ.
 */
export async function logMatch(
  config: MatchConfig,
  sideA: SidePlayer[],
  sideB: SidePlayer[],
  clubId: string | null,
  sessionId: string | null,
  games: GameScore[],
): Promise<string> {
  const id = await createMatch(config, sideA, sideB, clubId, sessionId);
  const { error } = await supabase!
    .from("guest_matches")
    .update({ status: "completed", winner: winnerFromGames(games), score_summary: { games } })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return id;
}

export async function appendEvent(matchId: string, seq: number, event: MatchEvent): Promise<void> {
  if (!supabase) return;
  // ignoreDuplicates makes a re-dispatched seq a no-op, mirroring native
  // "insert or ignore".
  const { error } = await supabase
    .from("guest_match_events")
    .upsert({ match_id: matchId, seq, event }, { onConflict: "match_id,seq", ignoreDuplicates: true });
  if (error) captureError(new Error(error.message), { area: "matchRepo.web" });
}

/** Undo: physically remove events after the kept seq. No sync concept on web. */
export async function removeEventsAfter(matchId: string, lastKeptSeq: number): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("guest_match_events")
    .delete()
    .eq("match_id", matchId)
    .gt("seq", lastKeptSeq);
  if (error) captureError(new Error(error.message), { area: "matchRepo.web" });
}

export async function loadEvents(matchId: string): Promise<MatchEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("guest_match_events")
    .select("event")
    .eq("match_id", matchId)
    .order("seq", { ascending: true });
  if (error) {
    captureError(new Error(error.message), { area: "matchRepo.web" });
    return [];
  }
  return (data ?? []).map((r) => r.event as MatchEvent);
}

export async function getMatch(matchId: string): Promise<MatchRecord | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("guest_matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) {
    captureError(new Error(error.message), { area: "matchRepo.web" });
    return null;
  }
  return data ? mapRow(data) : null;
}

export async function finalizeMatch(matchId: string, state: MatchState): Promise<void> {
  if (!supabase) return;
  const summary = { games: state.gameHistory.map((g) => g.score) };
  const { error } = await supabase
    .from("guest_matches")
    .update({ status: "completed", winner: state.winner, score_summary: summary })
    .eq("id", matchId);
  if (error) {
    captureError(new Error(error.message), { area: "matchRepo.web" });
    toast("Could not save the match — check your connection.", "error");
  }
}

/**
 * Periodic live-score snapshot. The status='live' guard makes a stray tick
 * racing a just-finished match a no-op instead of resurrecting score_summary
 * after completion (same contract as matchRepo.ts).
 */
export async function updateLiveScore(matchId: string, state: MatchState): Promise<void> {
  if (!supabase) return;
  const summary = {
    games: state.gameHistory.map((g) => g.score),
    current: { A: state.score.A, B: state.score.B },
  };
  const { error } = await supabase
    .from("guest_matches")
    .update({ score_summary: summary })
    .eq("id", matchId)
    .eq("status", "live");
  if (error) captureError(new Error(error.message), { area: "matchRepo.web" });
}

/**
 * End a match before a natural finish. The in-progress game joins the summary;
 * the winner is decided by games won, falling back to the current game's leader
 * (null if dead level). Logic duplicated verbatim from matchRepo.ts.
 */
export async function endMatchEarly(matchId: string, state: MatchState): Promise<void> {
  if (!supabase) return;
  const games = state.gameHistory.map((g) => g.score);
  if (state.phase !== "match_over" && (state.score.A > 0 || state.score.B > 0)) {
    games.push({ A: state.score.A, B: state.score.B });
  }
  const winner: TeamId | null =
    state.winner ??
    (state.gamesWon.A !== state.gamesWon.B
      ? state.gamesWon.A > state.gamesWon.B
        ? "A"
        : "B"
      : state.score.A === state.score.B
        ? null
        : state.score.A > state.score.B
          ? "A"
          : "B");
  const { error } = await supabase
    .from("guest_matches")
    .update({ status: "completed", winner, score_summary: { games } })
    .eq("id", matchId);
  if (error) {
    captureError(new Error(error.message), { area: "matchRepo.web" });
    toast("Could not save the match — check your connection.", "error");
  }
}

export async function listMatches(): Promise<MatchRecord[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("guest_matches")
    .select("*")
    .eq("created_by", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    captureError(new Error(error.message), { area: "matchRepo.web" });
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function replayMatch(matchId: string): Promise<MatchState | null> {
  const events = await loadEvents(matchId);
  return events.length ? replay(events) : null;
}

// Guest web sessions never navigate to club, session, tournament, or
// profile-analytics screens, so these have no rows to serve.
export async function listAllMatches(): Promise<MatchRecord[]> {
  return [];
}
export async function listMatchesForSession(_sessionId: string): Promise<MatchRecord[]> {
  return [];
}
export async function listMatchesForClub(_clubId: string): Promise<MatchRecord[]> {
  return [];
}
export async function endLiveMatchesForSession(_sessionId: string): Promise<void> {
  return;
}
