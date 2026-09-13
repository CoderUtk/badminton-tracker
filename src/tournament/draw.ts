import type { BracketSize, FormatId } from "./types";
import type { MatchType } from "../repos/tournamentRepo";
import { formatOrDefault } from "./formats";

const SIZES: BracketSize[] = [4, 8, 16, 32, 64];

/**
 * Smallest draw that holds `entrants`. Anything short of the draw becomes a
 * bye, which buildBracket already auto-advances.
 *
 * Floors at 4: BracketSize has no 2, and the startBlocker minimums guarantee
 * at least 3 entrants before this is ever called in anger.
 */
export function drawSizeFor(entrants: number): BracketSize {
  return SIZES.find((s) => s >= entrants) ?? 64;
}

/**
 * Why this tournament cannot start yet, or null when it can. Shared by the
 * Start button and the start_tournament guard so the UI and the database
 * cannot disagree about the rule.
 *
 * `players` counts people, not entrants: a doubles entrant is two players.
 * Minimums are per format — round-robin is fine with three, a knockout is not.
 */
export function startBlocker(
  players: number, matchType: MatchType, format: FormatId = "single_elim",
): string | null {
  const perEntrant = matchType === "doubles" ? 2 : 1;
  const mod = formatOrDefault(format);
  const min = mod.minPlayers(matchType);
  if (players < min) return `Add at least ${min} players to start`;
  if (players % perEntrant !== 0) return "Pair every player to start";
  if (players / perEntrant > 64) return "A tournament holds at most 64 entrants";
  return null;
}

/** Court label for the Nth round-one match, cycling 1..courts. */
export function courtForIndex(index: number, courts: number): string {
  return String((index % Math.max(1, courts)) + 1);
}
