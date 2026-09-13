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
  cell: Pick<BracketMatch, "entrantA" | "entrantB" | "winnerEntrant" | "srcA" | "srcB">,
  nameA: string,
  nameB: string
): string {
  const { entrantA, entrantB, winnerEntrant, srcA, srcB } = cell;
  const wonA = !!winnerEntrant && winnerEntrant === entrantA;
  const wonB = !!winnerEntrant && winnerEntrant === entrantB;

  if (entrantA && entrantB) {
    if (wonA) return `${nameA} versus ${nameB}, ${nameA} won`;
    if (wonB) return `${nameA} versus ${nameB}, ${nameB} won`;
    return `${nameA} versus ${nameB}, in progress`;
  }
  if (entrantA) return wonA ? `${nameA}, bye` : `${nameA}, waiting for opponent`;
  if (entrantB) return wonB ? `${nameB}, bye` : `${nameB}, waiting for opponent`;
  // Falls through to "Empty match slot" for every format that has no gate.
  return srcSlotLabel(srcA) ?? srcSlotLabel(srcB) ?? "Empty match slot";
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

/**
 * Human name for a knockout slot the seeding gate has not filled yet.
 * 'G1#2' becomes "2nd, Group B". Returns null for a slot with no source token,
 * which is every format except groups → knockout.
 */
export function srcSlotLabel(token: string | null): string | null {
  const m = token ? /^G(\d+)#(\d+)$/.exec(token) : null;
  if (!m) return null;
  const rank = Number(m[2]);
  return `${ORDINAL[rank] ?? `${rank}th`}, Group ${String.fromCharCode(65 + Number(m[1]))}`;
}

/**
 * Column heading for a round, derived from how many rounds remain rather than
 * from the round number: "round 3" means the quarter-finals in an 8-entrant
 * bracket and the semis in a 16-entrant one, so the absolute number is not a
 * name.
 */
export function roundName(round: number, maxRound: number): string {
  switch (maxRound - round) {
    case 0: return "FINAL";
    case 1: return "SEMIS";
    case 2: return "QUARTERS";
    case 3: return "ROUND OF 16";
    default: return `ROUND ${round}`;
  }
}

/**
 * SVG path from a parent cell's right edge to its child's left edge: out to
 * the middle of the column gutter, a rounded corner, a vertical run, a second
 * corner, then in. Orthogonal rather than diagonal because the elbow is the
 * convention every viewer already reads as "bracket".
 *
 * A flat run (the parent and child share a centre, which happens whenever a
 * round has a single child) returns a straight horizontal line: a quadratic
 * across a segment with zero vertical travel renders as a visible wobble
 * rather than as the straight line it mathematically is.
 */
export function elbowPath(
  x1: number, y1: number, x2: number, y2: number, r = 6
): string {
  if (y1 === y2) return `M${x1} ${y1} H${x2}`;
  const mx = (x1 + x2) / 2;
  // Never let the corners overrun each other on a short vertical run, or the
  // two curves cross and the elbow renders as a bowtie.
  const c = Math.min(r, Math.abs(y2 - y1) / 2, Math.abs(mx - x1));
  const dir = y2 > y1 ? 1 : -1;
  return [
    `M${x1} ${y1}`,
    `H${mx - c}`,
    `Q${mx} ${y1} ${mx} ${y1 + c * dir}`,
    `V${y2 - c * dir}`,
    `Q${mx} ${y2} ${mx + c} ${y2}`,
    `H${x2}`,
  ].join(" ");
}

/**
 * Splits an entrant's display name into its players. Entrant.name is a
 * pre-joined "Ana / Bo" string for doubles (see sideOf in tournamentRepo), so
 * a bracket cell that wants to lay the two names out on their own lines has to
 * take them back apart. Singles return a single-element array.
 */
export function splitPairName(name: string): string[] {
  const parts = name.split(" / ").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [name];
}

/**
 * True when the decided match went against the seeding — the winner carries a
 * numerically larger seed than the loser. Both sides must be present and the
 * match decided; a bye is not an upset.
 *
 * Seeds are 1-based and lower is stronger, so the comparison reads backwards
 * from the usual "bigger wins" intuition, which is exactly why it lives here
 * behind a name instead of inline in the cell.
 */
export function isUpset(winnerSeed?: number, loserSeed?: number): boolean {
  if (winnerSeed == null || loserSeed == null) return false;
  return winnerSeed > loserSeed;
}
