import type { MatchEvent, TeamId } from "../engine";

/**
 * Match-detail formatting, pulled out of app/(app)/matches/[id].tsx so it can
 * be unit-tested in the node-only Jest environment.
 *
 * Audit M6: the screen showed "Total rallies: 1" and "Status: completed" as
 * raw key-value strings, with no date, no duration, and no rally-by-rally
 * view despite Home advertising "rally history".
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local calendar date, spelled out manually rather than via
 *  toLocaleDateString: the latter depends on the runtime's ICU data, which
 *  makes a pure-function test non-deterministic across environments. */
export function formatMatchDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatMatchStatus(status: "live" | "completed" | "forfeited"): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Wall-clock span from the first logged event to the last. Feed the result
 *  to formatElapsed (src/lib/elapsed.ts) for a HH:MM:SS string — this module
 *  does not duplicate that formatter. */
export function matchDurationMs(events: MatchEvent[]): number {
  if (events.length === 0) return 0;
  const ms = events[events.length - 1].at - events[0].at;
  return ms > 0 ? ms : 0;
}

export type RallyTimelineGame = { game: number; rallies: TeamId[] };

/** Rally winners grouped by game, in play order — the "rally history" Home
 *  promises. A game with zero logged rallies (a GAME_STARTED with nothing
 *  after it) is dropped rather than shown as an empty row. */
export function buildRallyTimeline(events: MatchEvent[]): RallyTimelineGame[] {
  const games: RallyTimelineGame[] = [{ game: 1, rallies: [] }];
  for (const e of events) {
    if (e.type === "RALLY_WON") {
      games[games.length - 1].rallies.push(e.by);
    } else if (e.type === "GAME_STARTED") {
      games.push({ game: games.length + 1, rallies: [] });
    }
  }
  return games.filter((g) => g.rallies.length > 0);
}
