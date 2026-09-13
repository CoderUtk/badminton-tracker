import type { BracketMatch, Entrant, Slot } from "../types";
import type { MatchScore } from "./types";
import { recordStandings } from "./standings";

export type SlotFill = { matchId: string; slot: Slot; entrantId: string };

/** 'G2#1' — first place in group 2. Groups are 0-based, ranks 1-based. */
export const srcToken = (group: number, rank: number): string => `G${group}#${rank}`;

export function parseSrc(token: string): { group: number; rank: number } | null {
  const m = /^G(\d+)#(\d+)$/.exec(token);
  return m ? { group: Number(m[1]), rank: Number(m[2]) } : null;
}

/**
 * Fill knockout slots whose feeding group has finished.
 *
 * A knockout slot is fed by "whoever finishes first in group 2" — a standings
 * outcome, not one match's winner, so no routing edge can express it. This is
 * the only place the edge model needs help.
 *
 * MUST be deterministic: two devices offline in the same hall can both finish
 * the last group match and both run this before syncing. recordStandings
 * guarantees a total order, which is what makes their answers identical.
 * Returns only slots that are still empty, so it is safe to run after every
 * result.
 */
export function settleGroups(
  bracket: BracketMatch[], entrants: Entrant[], scores?: Map<string, MatchScore>,
): SlotFill[] {
  const groups = new Map<number, BracketMatch[]>();
  for (const m of bracket) {
    if (m.groupIdx === null) continue;
    groups.set(m.groupIdx, [...(groups.get(m.groupIdx) ?? []), m]);
  }

  const rankings = new Map<number, string[]>();
  for (const [g, matches] of groups) {
    if (!matches.every((m) => m.winnerEntrant)) continue; // group unfinished
    const ids = new Set(matches.flatMap((m) => [m.entrantA, m.entrantB])
      .filter((x): x is string => !!x));
    const inGroup = entrants.filter((e) => ids.has(e.id));
    rankings.set(g, recordStandings(matches, inGroup, scores).map((s) => s.entrantId));
  }

  const fills: SlotFill[] = [];
  for (const m of bracket) {
    for (const slot of ["a", "b"] as const) {
      const token = slot === "a" ? m.srcA : m.srcB;
      const occupied = slot === "a" ? m.entrantA : m.entrantB;
      if (!token || occupied) continue;
      const src = parseSrc(token);
      if (!src) continue;
      const entrantId = rankings.get(src.group)?.[src.rank - 1];
      if (entrantId) fills.push({ matchId: m.id, slot, entrantId });
    }
  }
  // Sorted so two devices emit the same array, not merely the same set.
  return fills.sort((x, y) => x.matchId.localeCompare(y.matchId) || x.slot.localeCompare(y.slot));
}

export type ByeWin = { matchId: string; winnerEntrant: string };

/**
 * Resolve knockout byes: a first-round slot whose source token was null from
 * the start (no qualifier was ever assigned there — see groupsKnockout's
 * seeding) never gets filled by settleGroups. Once the OTHER slot in that
 * match is known, the present entrant has no opponent coming and must be
 * declared the winner so the tree keeps moving; otherwise the bracket stalls
 * on it forever (single elimination avoids this because buildBracket can
 * resolve a bye at build time — here the qualifier isn't known until its
 * group finishes, so this gate is the only place it can happen).
 *
 * Only the seeded first knockout round can be a genuine bye. A later round's
 * empty slot is always fed by an undecided EARLIER knockout match, and that
 * match is guaranteed to eventually produce a winner (by real play or by
 * this same bye rule) — so a later round's empty slot is a WAIT, never a
 * dead end, and auto-advancing it would hand someone a walkover against an
 * opponent who is still playing.
 *
 * Every first-round match's bye eligibility depends only on its own srcA/
 * srcB/entrantA/entrantB — not on any other match's result — so a single
 * pass over the bracket already finds every bye ready to resolve, including
 * two siblings that are both byes feeding the same next match. The caller
 * applies each entry with `advanceWinner` (same as a played result), which
 * both records the winner and routes it along the match's existing win edge
 * — so a resolved bye's winner reaching the next round is exactly one more
 * `settleByes` + `advanceWinner` cycle away, and calling this again after
 * applying is a no-op (idempotent) because an already-decided match is
 * skipped.
 */
export function settleByes(bracket: BracketMatch[]): ByeWin[] {
  const knockout = bracket.filter((m) => m.groupIdx === null);
  if (knockout.length === 0) return [];
  const firstRound = Math.min(...knockout.map((m) => m.round));

  const wins: ByeWin[] = [];
  for (const m of knockout) {
    if (m.round !== firstRound || m.winnerEntrant) continue;
    const aReady = m.entrantA !== null;
    const bReady = m.entrantB !== null;
    if (aReady && !bReady && m.srcB === null) wins.push({ matchId: m.id, winnerEntrant: m.entrantA! });
    else if (bReady && !aReady && m.srcA === null) wins.push({ matchId: m.id, winnerEntrant: m.entrantB! });
  }
  // Sorted so two devices emit the same array, not merely the same set.
  return wins.sort((x, y) => x.matchId.localeCompare(y.matchId));
}
