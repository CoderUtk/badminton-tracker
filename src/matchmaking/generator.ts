export interface MatchPlayer {
  id: string;
  name: string;
}

export interface GeneratedMatch {
  court: number;
  teamA: [MatchPlayer, MatchPlayer];
  teamB: [MatchPlayer, MatchPlayer];
}

export interface MatchmakingResult {
  matches: GeneratedMatch[];
  waiting: MatchPlayer[];
}

type Pairing = [[MatchPlayer, MatchPlayer], [MatchPlayer, MatchPlayer]];

/** Build a deterministic doubles round while avoiding repeat partnerships. */
export function generateMatchups(
  players: MatchPlayer[],
  courts: number,
  previous: GeneratedMatch[] = [],
  round = 0
): MatchmakingResult {
  const usable = Math.max(0, Math.min(Math.floor(courts), Math.floor(players.length / 4)) * 4);
  const rotated = rotate(players, players.length ? (round * 2) % players.length : 0);
  const active = rotated.slice(0, usable);
  const pairCounts = buildPairCounts(previous);
  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < active.length; i += 4) {
    const group = active.slice(i, i + 4) as [MatchPlayer, MatchPlayer, MatchPlayer, MatchPlayer];
    const pairing = bestPairing(group, pairCounts, round);
    matches.push({ court: matches.length + 1, teamA: pairing[0], teamB: pairing[1] });
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
