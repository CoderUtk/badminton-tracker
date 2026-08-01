import { defaultConfig } from "../engine";
import type { MatchConfig } from "../engine";

export type SidePlayers = { id: string; name: string }[];

/** Build a MatchConfig for a bracket cell: 1 player per side for singles, 2 for doubles. */
export function buildTournamentConfig(
  a: SidePlayers, b: SidePlayers, matchType: "singles" | "doubles", bestOf: 1 | 3 | 5,
): MatchConfig {
  return defaultConfig({
    matchType,
    bestOf,
    teams: {
      A: a.map((p, i) => ({ id: `a${i}`, name: p.name })),
      B: b.map((p, i) => ({ id: `b${i}`, name: p.name })),
    },
  });
}
