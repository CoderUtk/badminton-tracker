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
 * Every key the comparator sorts on is a SCALAR property of one entrant, not
 * a pairwise fact about a pair of entrants. That matters: `Array.prototype.
 * sort`'s comparator must be transitive, and a pairwise "x beat y" test is
 * not transitive whenever three entrants form a head-to-head cycle
 * (e2 beat e1, e1 beat e3, e3 beat e2 — every real round-robin group can
 * produce this). Fed a non-transitive comparator, `sort` still returns *a*
 * permutation, but which one depends on the incoming order of `entrants` —
 * exactly the kind of divergence two offline devices with the same match
 * results must never produce. So head-to-head is folded into a scalar
 * per-entrant count (wins against other members of the same win-rate group,
 * the standard "mini-league" rule) before sorting, not compared pairwise
 * inside the comparator.
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

  // Mini-league head-to-head: for each entrant, count wins against OTHER
  // entrants who share its exact win rate. This is the standard tournament
  // tiebreak, it's a scalar (so it sorts transitively, unlike a pairwise
  // "beat" test), and it degrades gracefully on a cycle — every entrant in a
  // 3-cycle wins exactly one match within the group, so they tie on this key
  // too and fall through to game diff, which is genuinely correct: a cycle
  // does not sportingly separate anyone.
  const allAcc = [...acc.values()];
  const rateGroups = new Map<number, Acc[]>();
  for (const x of allAcc) {
    const r = rate(x);
    const g = rateGroups.get(r);
    if (g) g.push(x); else rateGroups.set(r, [x]);
  }
  const h2h = new Map<string, number>();
  for (const group of rateGroups.values()) {
    const ids = new Set(group.map((x) => x.entrantId));
    for (const x of group) {
      let wins = 0;
      for (const beaten of beat.get(x.entrantId)!) if (ids.has(beaten)) wins++;
      h2h.set(x.entrantId, wins);
    }
  }

  const rows = allAcc.sort((x, y) => {
    if (rate(y) !== rate(x)) return rate(y) - rate(x);
    const hx = h2h.get(x.entrantId)!, hy = h2h.get(y.entrantId)!;
    if (hy !== hx) return hy - hx;
    if (y.gameDiff !== x.gameDiff) return y.gameDiff - x.gameDiff;
    if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
    if (x.seed !== y.seed) return x.seed - y.seed;
    return x.entrantId < y.entrantId ? -1 : 1;
  });

  // `tied` must mean "no SPORTING tiebreak separated this row from its
  // neighbour" — and head-to-head (now the scalar mini-league count above) is
  // a sporting tiebreak, sitting between win rate and game diff in the
  // comparator. Only seed and id — the two non-sporting keys — may mark a
  // row tied.
  //
  // `played` is part of it because `rate` maps an entrant who has not played
  // at all to 0 — the same rate as one who has played and lost. Without this,
  // a 0–0 row and a 0–1 row below it were both marked level, and the chip
  // read as nonsense next to two visibly different records. Requiring an
  // equal match count means LEVEL only ever appears on rows whose W–L a
  // reader can see is identical, which is the only case where it explains
  // anything.
  const sportingTie = (x: Acc, y: Acc): boolean =>
    x.played === y.played &&
    rate(x) === rate(y) && h2h.get(x.entrantId) === h2h.get(y.entrantId) &&
    x.gameDiff === y.gameDiff && x.pointDiff === y.pointDiff;

  return rows.map((x, i) => ({
    entrantId: x.entrantId, rank: i + 1,
    played: x.played, wins: x.wins, losses: x.losses,
    gameDiff: x.gameDiff, pointDiff: x.pointDiff,
    tied:
      (i > 0 && sportingTie(rows[i - 1], x)) ||
      (i < rows.length - 1 && sportingTie(x, rows[i + 1])),
  }));
}
