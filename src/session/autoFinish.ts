export const AUTO_FINISH_HOURS = 24;

/**
 * True when a session is still marked live long after it should have ended.
 * Strictly-greater-than the window, so a session exactly AUTO_FINISH_HOURS old
 * is not yet stale — it becomes stale on the next check after that instant.
 */
export function isStaleLive(session: { status: string; starts_at: number }, now: number): boolean {
  if (session.status !== "live") return false;
  return now - session.starts_at > AUTO_FINISH_HOURS * 60 * 60 * 1000;
}
