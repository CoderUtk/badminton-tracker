import type { BracketMatch, Entrant } from "../types";
import type { MatchScore, Standing } from "./types";

type Acc = {
  entrantId: string; seed: number;
  played: number; wins: number; losses: number;
  gameDiff: number; pointDiff: number;
};

/**
 * Rank entrants from finished matches.
 *
 * The comparator MUST be a total order. Two phones can be offline in the same
 * hall, both finish the last group match, both run the seeding gate, and both
 * sync. Identical inputs have to produce byte-identical fills or the knockout
 * draw forks. Seed and id are the final two keys: they are not sporting
 * tiebreaks and the UI marks entrants split by them as level, but they
 * guarantee no tie reaches the caller.
 *
 * `scores` is optional because BracketMatch carries only the winner — game and
 * point difference live in the matches table. Without it, those two keys are
 * zero for everyone and the order falls through to seed.
 */
export function recordStandings(
  bracket: BracketMatch[], entrants: Entrant[], scores?: Map<string, MatchScore>,
): Standing[] {
  const acc = new Map<string, Acc>(entrants.map((e) => [e.id, {
    entrantId: e.id, seed: e.seed, played: 0, wins: 0, losses: 0, gameDiff: 0, pointDiff: 0,
  }]));
  // entrantId -> set of entrants it has beaten, for head-to-head.
  const beat = new Map<string, Set<string>>(entrants.map((e) => [e.id, new Set()]));

  for (const m of bracket) {
    if (!m.winnerEntrant || !m.entrantA || !m.entrantB) continue;
    const a = acc.get(m.entrantA);
    const b = acc.get(m.entrantB);
    if (!a || !b) continue;
    const loserId = m.winnerEntrant === m.entrantA ? m.entrantB : m.entrantA;
    a.played++; b.played++;
    acc.get(m.winnerEntrant)!.wins++;
    acc.get(loserId)!.losses++;
    beat.get(m.winnerEntrant)!.add(loserId);

    const sc = m.matchId ? scores?.get(m.matchId) : undefined;
    if (sc) {
      a.gameDiff += sc.gamesA - sc.gamesB;
      b.gameDiff += sc.gamesB - sc.gamesA;
      a.pointDiff += sc.pointsA - sc.pointsB;
      b.pointDiff += sc.pointsB - sc.pointsA;
    }
  }

  // Win RATE, not win count: groups differ in size by up to one, and counting
  // raw wins would penalise the entrant with the longer schedule.
  const rate = (x: Acc) => (x.played === 0 ? 0 : x.wins / x.played);

  const rows = [...acc.values()].sort((x, y) => {
    if (rate(y) !== rate(x)) return rate(y) - rate(x);
    const xBeatY = beat.get(x.entrantId)!.has(y.entrantId);
    const yBeatX = beat.get(y.entrantId)!.has(x.entrantId);
    if (xBeatY !== yBeatX) return xBeatY ? -1 : 1;
    if (y.gameDiff !== x.gameDiff) return y.gameDiff - x.gameDiff;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    if (x.seed !== y.seed) return x.seed - y.seed;
    return x.entrantId < y.entrantId ? -1 : 1;
  });

  // `tied` must mean "no SPORTING tiebreak separated this row from its
  // neighbour" — and head-to-head is a sporting tiebreak (it sits between win
  // rate and game diff in the comparator above), so it must be checked here
  // too. A plain `rate|gameDiff|pointDiff` key (the win-rate/game-diff/
  // point-diff triple alone) would mark two entrants "tied" even when one
  // beat the other head-to-head, which is exactly the kind of real result the
  // UI must not present as level. Only seed and id — the two non-sporting
  // keys — may mark a row tied.
  const sportingTie = (x: Acc, y: Acc): boolean => {
    if (rate(x) !== rate(y)) return false;
    const xBeatY = beat.get(x.entrantId)!.has(y.entrantId);
    const yBeatX = beat.get(y.entrantId)!.has(x.entrantId);
    if (xBeatY !== yBeatX) return false;
    return x.gameDiff === y.gameDiff && x.pointDiff === y.pointDiff;
  };

  return rows.map((x, i) => ({
    entrantId: x.entrantId, rank: i + 1,
    played: x.played, wins: x.wins, losses: x.losses,
    gameDiff: x.gameDiff, pointDiff: x.pointDiff,
    tied:
      (i > 0 && sportingTie(rows[i - 1], x)) ||
      (i < rows.length - 1 && sportingTie(x, rows[i + 1])),
  }));
}
