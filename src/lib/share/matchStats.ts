import type { MatchEvent, TeamId } from "../../engine";

/**
 * Derived match stats for the share card.
 *
 * Pure and React-Native-free for the same reason as matchDetail.ts: the
 * node-env Jest suite has to be able to import them. The card renders these,
 * it never computes them.
 */

/** Points actually played, across every game. */
export function totalRallies(events: MatchEvent[]): number {
  return events.reduce((n, e) => (e.type === "RALLY_WON" ? n + 1 : n), 0);
}

/**
 * Longest run of consecutive points won by `side`.
 *
 * Deliberately not reset at GAME_STARTED: a run that carries from the end of
 * one game into the start of the next is real momentum, and reads that way on
 * the card.
 */
export function longestStreak(events: MatchEvent[], side: TeamId): number {
  let best = 0;
  let run = 0;
  for (const e of events) {
    if (e.type !== "RALLY_WON") continue;
    run = e.by === side ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * How many times the lead changed hands.
 *
 * A tie is not a lead change, and coming out of a tie only counts if the new
 * leader is not the side that led going in — so `lead` remembers the last
 * non-level state rather than being cleared when the scores meet.
 *
 * Reset per game, unlike longestStreak: every game starts level, so a
 * cross-game "change" would be an artefact of the scoreboard resetting rather
 * than anything that happened on court.
 */
export function leadChanges(events: MatchEvent[]): number {
  let changes = 0;
  let a = 0;
  let b = 0;
  let lead = 0; // sign of (a - b) at the last point where they differed
  for (const e of events) {
    if (e.type === "GAME_STARTED") {
      a = 0;
      b = 0;
      lead = 0;
      continue;
    }
    if (e.type !== "RALLY_WON") continue;
    if (e.by === "A") a++;
    else b++;
    const sign = a > b ? 1 : a < b ? -1 : 0;
    if (sign === 0) continue;
    if (lead !== 0 && sign !== lead) changes++;
    lead = sign;
  }
  return changes;
}

/**
 * Compact duration for a stat tile: "42′", or "1h 04′" past the hour.
 *
 * formatElapsed (src/lib/elapsed.ts) is the wrong shape here — it returns
 * HH:MM:SS, which is three segments of noise in a 76pt-wide tile.
 */
export function formatShortDuration(ms: number): string {
  const totalMin = ms > 0 ? Math.floor(ms / 60000) : 0;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}′`;
  return `${h}h ${String(m).padStart(2, "0")}′`;
}
