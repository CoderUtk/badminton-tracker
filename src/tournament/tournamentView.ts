import type { BracketMatch } from "./types";
import type { Standing } from "./formats/types";

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
 * accessibilityLabel for a standings row. React Native's explicit
 * accessibilityLabel REPLACES a row's child-text aggregation rather than
 * adding to it, so a label naming only the tie would drop the
 * rank/name/record/diff a bare row announces by aggregation. This restates
 * that information, in the same order, and appends the level marker when the
 * split was non-sporting.
 *
 * EVERY row gets one, tied or not. Passing `undefined` for the untied rows
 * does not clear the native contentDescription a previous render set, so a
 * row that was tied and then won a match kept announcing its old rank,
 * record and "level with the next player" — on device, a row reading
 * "1 · Maya Patel · 1–0" announced "2, Maya Patel, 0–0, level with the next
 * player". A label that is always present is always replaced.
 */
export function standingRowLabel(row: Standing, name: string): string {
  const base = `${row.rank}, ${name}, ${row.wins}–${row.losses}, ${signedDiff(row.gameDiff)}`;
  return row.tied ? `${base}, level with the next player` : base;
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
 * True when this bracket actually carries the loss-routing edge a
 * double-elimination split needs. Every real winners-bracket row gets a
 * non-null lossToMatchId the moment the bracket is built (see
 * doubleElim.build) — it never depends on a match having been played — so a
 * bracket where every row's lossToMatchId is null did not come with that
 * column at all (e.g. the spectator payload, which doesn't select it) rather
 * than being a genuine double-elim bracket with no losers side yet.
 */
export function hasDoubleElimRouting(bracket: BracketMatch[]): boolean {
  return bracket.some((m) => m.lossToMatchId !== null);
}

/**
 * Splits a double-elimination bracket into its winners bracket, grand final,
 * and losers bracket so each can render as its own tree/cell under its own
 * heading. The winners bracket is every round that reaches the grand final by
 * win edges from round 1 (identified by `lossToMatchId` set — see
 * `hasDoubleElimRouting`); everything numbered above that is the losers
 * bracket, EXCEPT the grand final itself.
 *
 * The grand final needs its own bucket, not "the top of the losers bracket":
 * `doubleElim.build` gives it both `winToMatchId` and `lossToMatchId` null —
 * the same shape as an eliminated losers-bracket row (nowhere left to send
 * either a winner or a loser) — so a two-way round-number split sweeps the
 * decisive championship match in with the losers bracket. It is unique by
 * construction (`winToMatchId === null` on exactly one row: the single match
 * that ends the tournament), which is what makes carving it out a safe,
 * purely structural rule rather than a guess.
 */
/**
 * Renumber a slice's rounds to start at 1, preserving order and gaps-as-steps.
 *
 * BracketView's computeCenters walks `for (r = 2; r <= maxRound; r++)` and so
 * assumes a slice's rounds start at 1. The losers and grand-final slices carry
 * ABSOLUTE round numbers (4, 5, 6 in a 4-draw), which made the renderer lay out
 * phantom columns and draw no cells at all — on device the losers bracket and
 * grand final showed "0/0" and were empty, hiding half a double-elimination
 * tournament. It also fed roundName absolute numbers, so a 4-player draw
 * announced "ROUND OF 16".
 */
export function renumberRounds(matches: BracketMatch[]): BracketMatch[] {
  if (matches.length === 0) return matches;
  const order = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const to = new Map(order.map((r, i) => [r, i + 1]));
  return matches.map((m) => ({ ...m, round: to.get(m.round)! }));
}

export function splitDoubleElimRounds(
  bracket: BracketMatch[]
): { winners: BracketMatch[]; grandFinal: BracketMatch[]; losers: BracketMatch[] } {
  if (bracket.length === 0) return { winners: [], grandFinal: [], losers: [] };
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  const wMax = Math.max(...bracket.filter((m) => m.lossToMatchId !== null).map((m) => m.round), rounds[0]);
  const grandFinal = bracket.filter((m) => m.winToMatchId === null);
  const finalIds = new Set(grandFinal.map((m) => m.id));
  return {
    winners: bracket.filter((m) => m.round <= wMax),
    grandFinal,
    losers: bracket.filter((m) => m.round > wMax && !finalIds.has(m.id)),
  };
}
