import type { BracketMatch } from "./types";

/**
 * Composes the "Round N, ..." accessibility label body (everything after the
 * round/court prefix) for a bracket cell. Pulled out because a bye match
 * (bracket.ts auto-resolves a single-entrant match by setting winnerEntrant
 * immediately) has both "one entrant" and "a decided winner" true at once —
 * treating those as separate branches produced a self-contradictory label
 * ("waiting for opponent" + "won" in the same sentence). This handles the
 * five cases explicitly instead. Kept in this plain .ts module (not
 * BracketView.tsx) so it can be unit tested directly: ts-jest emits raw
 * JSX for .tsx files under this project's `jsx: "react-native"` tsconfig,
 * which Node can't parse, so anything importable from a component file is
 * untestable under the existing Jest setup.
 */
export function bracketCellLabel(
  cell: Pick<BracketMatch, "entrantA" | "entrantB" | "winnerEntrant">,
  nameA: string,
  nameB: string
): string {
  const { entrantA, entrantB, winnerEntrant } = cell;
  const wonA = !!winnerEntrant && winnerEntrant === entrantA;
  const wonB = !!winnerEntrant && winnerEntrant === entrantB;

  if (entrantA && entrantB) {
    if (wonA) return `${nameA} versus ${nameB}, ${nameA} won`;
    if (wonB) return `${nameA} versus ${nameB}, ${nameB} won`;
    return `${nameA} versus ${nameB}, in progress`;
  }
  if (entrantA) return wonA ? `${nameA}, bye` : `${nameA}, waiting for opponent`;
  if (entrantB) return wonB ? `${nameB}, bye` : `${nameB}, waiting for opponent`;
  return "Empty match slot";
}
