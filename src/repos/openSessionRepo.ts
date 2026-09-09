import { getDb } from "../db/db";
import { supabase } from "../lib/supabase";
import { type SessionOpenPreview } from "../session/openJoin";
import { type SessionStatus } from "./sessionRepo";

/**
 * What a link holder sees before joining. Null when the session is closed or
 * gone — the RPC cannot tell those apart on purpose, so neither can we.
 */
export async function getSessionOpenPreview(sessionId: string): Promise<SessionOpenPreview | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("session_open_preview", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  const row = (data as {
    session_id: string; club_name: string; location: string | null;
    starts_at: string; status: SessionStatus; checked_in: number;
    max_players: number | null; already_in: boolean;
  }[] | null)?.[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    clubName: row.club_name,
    location: row.location,
    startsAt: Date.parse(row.starts_at),
    status: row.status,
    checkedIn: row.checked_in ?? 0,
    maxPlayers: row.max_players,
    alreadyIn: !!row.already_in,
  };
}

/** Claim a slot. Idempotent — rejoining returns the same club_player_id. */
export async function joinOpenSession(sessionId: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to join this session");
  const { data, error } = await supabase.rpc("join_open_session", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Give the slot back, so the cost split stops counting them. */
export async function leaveOpenSession(sessionId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to leave this session");
  const { error } = await supabase.rpc("leave_open_session", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
}

/** Organiser-only: open or close the link and set the cap. */
export async function setSessionOpenJoin(
  sessionId: string,
  input: { open: boolean; maxPlayers: number | null },
): Promise<void> {
  if (!supabase) throw new Error("Sign in to change this session");
  const maxPlayers = input.maxPlayers === null
    ? null
    : Math.max(1, Math.min(100, Math.round(input.maxPlayers)));
  const { error } = await supabase.rpc("set_session_open_join", {
    p_session_id: sessionId, p_open: input.open, p_max_players: maxPlayers,
  });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync(
    "update sessions_cache set open_join = ?, max_players = ? where id = ?",
    input.open ? 1 : 0, maxPlayers, sessionId
  );
}
