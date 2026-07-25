export interface MatchPlayer {
  id: string;
  name: string;
}

export type MatchMode = "singles" | "doubles";

export interface GeneratedMatch {
  court: number;
  mode: MatchMode;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
}

export interface MatchmakingResult {
  matches: GeneratedMatch[];
  waiting: MatchPlayer[];
}

type Pairing = [[MatchPlayer, MatchPlayer], [MatchPlayer, MatchPlayer]];

/**
 * Build a deterministic round. Doubles pairs four players per court while
 * avoiding repeat partnerships; singles pits two players per court. When mode
 * is omitted it is chosen automatically: doubles if four+ players are available,
 * otherwise singles.
 */
export function generateMatchups(
  players: MatchPlayer[],
  courts: number,
  previous: GeneratedMatch[] = [],
  round = 0,
  mode?: MatchMode
): MatchmakingResult {
  const resolved: MatchMode = mode ?? (players.length >= 4 ? "doubles" : "singles");
  const per = resolved === "singles" ? 2 : 4;
  const usable = Math.max(0, Math.min(Math.floor(courts), Math.floor(players.length / per)) * per);
  const rotated = rotate(players, players.length ? (round * 2) % players.length : 0);
  const active = rotated.slice(0, usable);
  const pairCounts = buildPairCounts(previous);
  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < active.length; i += per) {
    if (resolved === "singles") {
      matches.push({ court: matches.length + 1, mode: resolved, teamA: [active[i]], teamB: [active[i + 1]] });
    } else {
      const group = active.slice(i, i + 4) as [MatchPlayer, MatchPlayer, MatchPlayer, MatchPlayer];
      const pairing = bestPairing(group, pairCounts, round);
      matches.push({ court: matches.length + 1, mode: resolved, teamA: pairing[0], teamB: pairing[1] });
    }
  }
  return { matches, waiting: rotated.slice(usable) };
}

function rotate<T>(items: T[], offset: number): T[] {
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function buildPairCounts(matches: GeneratedMatch[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      const key = pairKey(team[0], team[1]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function bestPairing(
  [a, b, c, d]: [MatchPlayer, MatchPlayer, MatchPlayer, MatchPlayer],
  pairCounts: Map<string, number>,
  round: number
): Pairing {
  const candidates: Pairing[] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  const score = (candidate: Pairing) =>
    (pairCounts.get(pairKey(...candidate[0])) ?? 0) +
    (pairCounts.get(pairKey(...candidate[1])) ?? 0);
  const lowest = Math.min(...candidates.map(score));
  const tied = candidates.filter((candidate) => score(candidate) === lowest);
  return tied[round % tied.length];
}

function pairKey(a: MatchPlayer, b: MatchPlayer): string {
  return [a.id, b.id].sort().join(":");
}
