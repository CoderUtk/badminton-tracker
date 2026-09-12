/**
 * How long a guest's matches survive, and when to ask them to save.
 *
 * The purge is real: 0044 schedules a daily job that hard-deletes
 * guest_matches older than 30 days. Guest mode currently earns a user, lets
 * them score real matches, and then throws the history away without ever
 * telling them — this module is the honest half of that bargain.
 *
 * Pure so the node-env Jest suite can cover the boundaries.
 */

/** Mirrors the interval in 0044_guest_matches_purge.sql. */
export const GUEST_RETENTION_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days a guest match has left before the purge takes it.
 *
 * Rounds up, so a match with six hours left reads "1 day" rather than "0" —
 * the number is a warning, and rounding it down understates the deadline on
 * the last day, which is exactly the day it matters. 0 means it is already
 * past the window and the next nightly run will take it.
 */
export function guestDaysLeft(createdAtMs: number, nowMs: number): number {
  const deadline = createdAtMs + GUEST_RETENTION_DAYS * DAY;
  if (nowMs >= deadline) return 0;
  return Math.ceil((deadline - nowMs) / DAY);
}

/** Under a week left is worth colouring differently. */
export function isGuestExpiringSoon(daysLeft: number): boolean {
  return daysLeft <= 7;
}

/**
 * Whether to ask a guest to create an account right now.
 *
 * Two moments, not a nag: the third match (they have invested enough that
 * losing it would sting) and any point past that where they have never been
 * asked. `dismissedAtCount` records the match count at the last dismissal, so
 * a "not now" buys silence until they have played three more.
 */
export function shouldPromptUpgrade(matchCount: number, dismissedAtCount: number): boolean {
  if (matchCount < 3) return false;
  return matchCount >= dismissedAtCount + 3;
}
