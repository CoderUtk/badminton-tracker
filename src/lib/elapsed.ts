/**
 * Elapsed match time.
 *
 * Pure so the node-env Jest suite can test it, and so ElapsedChip and the pause
 * overlay share one definition of "how long has this match been going".
 *
 * Paused spans are subtracted rather than the clock being restarted, because
 * elapsed is derived from the match's MATCH_STARTED timestamp — that is what
 * lets it survive leaving and resuming the screen without resetting to zero.
 * Pause itself is local, non-persisted state (spec 4a): the event log is
 * reduced, synced and replayed, and must not carry a UI affordance.
 */
export type ElapsedInput = {
  /** MATCH_STARTED timestamp, in epoch ms. */
  startedAt: number;
  /** Current wall clock, in epoch ms. */
  now: number;
  /** Total of every already-completed paused span, in ms. */
  pausedMs: number;
  /** Start of the currently-open paused span, or null when running. */
  pausedSince: number | null;
};

export function elapsedMs({ startedAt, now, pausedMs, pausedSince }: ElapsedInput): number {
  const openPause = pausedSince === null ? 0 : now - pausedSince;
  const ms = now - startedAt - pausedMs - openPause;
  // A backwards clock step (NTP correction, manual change) must not render a
  // negative duration on the one screen that stays open for an hour.
  return ms > 0 ? ms : 0;
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
