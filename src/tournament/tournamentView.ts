import type { BracketMatch } from "./types";

/**
 * Signed game/point difference for a standings row: "+3", "−0", "0". A
 * plain hyphen reads as a dash next to a "+", so the negative case uses the
 * real Unicode minus sign (U+2212), not ASCII "-".
 */
export function signedDiff(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/**
 * Distinct group indices present in a bracket, ascending. Null (every format
 * except groups → knockout, and the knockout rows within that one format) is
 * excluded — those rows are not part of any group heading.
 *
 * Kept in this plain .ts module (not TournamentView.tsx) so it is unit
 * testable: ts-jest emits raw JSX for .tsx files under this project's
 * `jsx: "react-native"` tsconfig, which Node can't parse — see
 * bracketLabel.ts's header for the same reasoning.
 */
export function groupOrder(bracket: BracketMatch[]): number[] {
  return [...new Set(bracket.map((m) => m.groupIdx))]
    .filter((g): g is number => g !== null)
    .sort((a, b) => a - b);
}

/** "GROUP 0" -> "GROUP A", "GROUP 1" -> "GROUP B", etc. */
export function groupLabel(groupIdx: number): string {
  return `GROUP ${String.fromCharCode(65 + groupIdx)}`;
}

/**
 * Splits a double-elimination bracket into its winners and losers sides so
 * each can render as its own tree. The winners bracket is every round that
 * reaches the grand final by win edges from round 1; everything numbered
 * above the highest round that still feeds a loser somewhere
 * (`lossToMatchId` set) is the losers bracket. Rounds are one ascending axis
 * by construction (see doubleElim.build) — there is no separate "losers
 * round 1" numbering to reconcile against.
 */
export function splitDoubleElimRounds(
  bracket: BracketMatch[]
): { winners: BracketMatch[]; losers: BracketMatch[] } {
  if (bracket.length === 0) return { winners: [], losers: [] };
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  const wMax = Math.max(...bracket.filter((m) => m.lossToMatchId !== null).map((m) => m.round), rounds[0]);
  return {
    winners: bracket.filter((m) => m.round <= wMax),
    losers: bracket.filter((m) => m.round > wMax),
  };
}
