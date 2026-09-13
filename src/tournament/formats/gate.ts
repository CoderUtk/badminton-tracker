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
