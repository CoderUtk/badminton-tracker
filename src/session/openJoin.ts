import type { SessionStatus } from "../repos/sessionRepo";

/**
 * What someone holding an open-session link is allowed to see. Mirrors the
 * columns returned by the session_open_preview RPC.
 *
 * Deliberately carries no player names, no cost, and nothing about any other
 * session — a forwarded link discloses a count, never a guest list.
 */
export interface SessionOpenPreview {
  sessionId: string;
  clubName: string;
  location: string | null;
  startsAt: number;
  status: SessionStatus;
  checkedIn: number;
  maxPlayers: number | null;
  alreadyIn: boolean;
}

export type JoinBlockReason = "finished" | "full" | "already-in";

export type JoinEligibility =
  | { ok: true }
  | { ok: false; reason: JoinBlockReason; message: string };

/**
 * Whether this viewer can claim a slot right now.
 *
 * A courtesy check so the button can disable before a round trip. The RPC
 * enforces every one of these clauses again server-side and is the real gate —
 * this function being wrong makes the UI misleading, never insecure.
 *
 * Order matters: already-in is tested first so someone who already holds a slot
 * in a full session is told they are in, not that it is full.
 */
export function joinEligibility(p: SessionOpenPreview): JoinEligibility {
  if (p.alreadyIn) {
    return { ok: false, reason: "already-in", message: "You are already in this session." };
  }
  if (p.status === "done" || p.status === "cancelled") {
    return { ok: false, reason: "finished", message: "This session has already finished." };
  }
  // >= not ===: the organiser may lower max_players below the current head
  // count, and that must not read as room having opened up.
  if (p.maxPlayers !== null && p.checkedIn >= p.maxPlayers) {
    return { ok: false, reason: "full", message: "This session is full." };
  }
  return { ok: true };
}
