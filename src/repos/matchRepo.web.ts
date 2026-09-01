import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import type { MatchConfig, MatchEvent, MatchState, TeamId } from "../engine";
import { replay } from "../engine";

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
    status: row.status,
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

export async function appendEvent(matchId: string, seq: number, event: MatchEvent): Promise<void> {
  if (!supabase) return;
  // ignoreDuplicates makes a re-dispatched seq a no-op, mirroring native
  // "insert or ignore".
  await supabase
    .from("guest_match_events")
    .upsert({ match_id: matchId, seq, event }, { onConflict: "match_id,seq", ignoreDuplicates: true });
}

/** Undo: physically remove events after the kept seq. No sync concept on web. */
export async function removeEventsAfter(matchId: string, lastKeptSeq: number): Promise<void> {
  if (!supabase) return;
  await supabase.from("guest_match_events").delete().eq("match_id", matchId).gt("seq", lastKeptSeq);
}

export async function loadEvents(matchId: string): Promise<MatchEvent[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("guest_match_events")
    .select("event")
    .eq("match_id", matchId)
    .order("seq", { ascending: true });
  return (data ?? []).map((r) => r.event as MatchEvent);
}

export async function getMatch(matchId: string): Promise<MatchRecord | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("guest_matches").select("*").eq("id", matchId).maybeSingle();
  return data ? mapRow(data) : null;
}
