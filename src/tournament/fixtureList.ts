import type { BracketMatch } from "./types";

export type FixtureGroup = { round: number; matches: BracketMatch[] };

/**
 * Groups a format's matches by scheduling round, ascending, each round's
 * matches ordered by their index within it. Round-robin and the group stage
 * of groups → knockout are the only callers — both number `round` as a
 * scheduling round (no tree edges), so grouping by it is exactly "which
 * night/slot is this fixture in".
 *
 * Kept in this plain .ts module (not FixtureList.tsx) so it is unit testable:
 * ts-jest emits raw JSX for .tsx files under this project's `jsx:
 * "react-native"` tsconfig, which Node can't parse — see bracketLabel.ts's
 * header for the same reasoning.
 */
export function fixtureRounds(bracket: BracketMatch[]): FixtureGroup[] {
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((round) => ({
    round,
    matches: bracket.filter((m) => m.round === round).sort((a, b) => a.index - b.index),
  }));
}

/**
 * "Ana versus Bo, not yet played" / "Ana versus Bo, Ana won" — both the
 * display text and the accessibilityLabel for one fixture row.
 *
 * Unlike bracketCellLabel, a fixture-list match has no bye/TBD case:
 * round-robin and group-stage matches always arrive with both entrants
 * filled in (circleRounds drops the bye pairing entirely rather than
 * emitting a one-sided row), so only two states exist.
 */
export function fixtureLabel(nameA: string, nameB: string, winnerName: string | null): string {
  if (!winnerName) return `${nameA} versus ${nameB}, not yet played`;
  return `${nameA} versus ${nameB}, ${winnerName} won`;
}
