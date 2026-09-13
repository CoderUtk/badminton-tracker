import { circleRounds } from "./roundRobin";
import type { BracketMatch, Entrant } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";
import { srcToken, parseSrc } from "./gate";

const DEFAULTS = { groupSize: 4, advancePerGroup: 2 };

/** Group sizes differ by at most one: 13 entrants in groups of 4 becomes
 *  4/3/3/3. Snake assignment by seed keeps strong entrants apart. */
export function assignGroups(entrants: Entrant[], groupSize: number): Entrant[][] {
  const count = Math.max(1, Math.round(entrants.length / groupSize));
  const groups: Entrant[][] = Array.from({ length: count }, () => []);
  const bySeed = [...entrants].sort((a, b) => a.seed - b.seed);
  bySeed.forEach((e, i) => {
    const row = Math.floor(i / count);
    const col = i % count;
    groups[row % 2 === 0 ? col : count - 1 - col].push(e);
  });
  return groups;
}

const nextPowerOfTwo = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

// Duplicated from bracket.ts's private `seedOrder` (that file is off-limits —
// tests/tournament.singleElimRegression.test.ts pins it as ground truth for
// the whole plan, so it is not touched or exported from here). Standard
// single-elim seed order for a bracket of `size` slots (1-based seeds), e.g.
// size 4 -> [1,4,2,3]; size 8 -> [1,8,4,5,2,7,3,6].
function seedOrder(size: number): number[] {
  let rounds = [1, 2];
  while (rounds.length < size) {
    const n = rounds.length * 2;
    const next: number[] = [];
    for (const s of rounds) { next.push(s); next.push(n + 1 - s); }
    rounds = next;
  }
  return rounds;
}

/**
 * Build the ordered list of qualifier tokens to seed, best first: every
 * group's rank-1 qualifier (group winners), in group order, then every
 * group's rank-2 qualifier (runners-up), and so on for deeper `advance`.
 * Treating "rank" as the primary seeding axis is what gives group winners
 * the byes ahead of runners-up when the draw doesn't fill (I2).
 */
function qualifierTokens(groupCount: number, advance: number): string[] {
  const tokens: string[] = [];
  for (let r = 1; r <= advance; r++) {
    for (let g = 0; g < groupCount; g++) tokens.push(srcToken(g, r));
  }
  return tokens;
}

/**
 * Place qualifier tokens into knockout slots and repair any first-round
 * meeting between two qualifiers from the same group.
 *
 * Placement uses the standard seed order, which — because tokens are ordered
 * best-seed-first (see qualifierTokens) — already gives completeness (I1),
 * correct bye distribution (I2), and determinism (I4) for free: it is a pure
 * function of `groupCount`/`advance`, no randomness or object iteration
 * involved. It does not by itself guarantee I3 (same-group separation), so a
 * deterministic repair pass follows: for each first-round match whose two
 * slots came from the same group, swap one of them with a same-rank token
 * from a later match, choosing the first candidate swap (in slot-index order)
 * that removes the collision without creating a new one. The swap only ever
 * exchanges two non-null tokens of equal rank, so it can't disturb which
 * slots are byes (I2) or duplicate/drop a token (I1).
 */
function seedKnockoutSlots(groupCount: number, advance: number): (string | null)[] {
  const tokens = qualifierTokens(groupCount, advance);
  const slots = nextPowerOfTwo(Math.max(1, groupCount * advance));
  const order = seedOrder(slots);
  const placed: (string | null)[] = order.map((seedNum) =>
    seedNum <= tokens.length ? tokens[seedNum - 1] : null);

  const groupOf = (token: string | null): number | null =>
    token ? parseSrc(token)!.group : null;

  for (let m = 0; m < placed.length / 2; m++) {
    const iA = m * 2;
    const iB = m * 2 + 1;
    const a = placed[iA];
    const b = placed[iB];
    if (!a || !b || groupOf(a) !== groupOf(b)) continue;

    const rankB = parseSrc(b)!.rank;
    for (let j = 0; j < placed.length; j++) {
      if (j === iA || j === iB) continue;
      const cand = placed[j];
      if (!cand || parseSrc(cand)!.rank !== rankB) continue;
      if (groupOf(cand) === groupOf(a)) continue; // still collides with a
      const partnerIdx = j % 2 === 0 ? j + 1 : j - 1;
      const partner = placed[partnerIdx];
      if (partner && groupOf(partner) === groupOf(b)) continue; // creates a new collision
      placed[iB] = cand;
      placed[j] = b;
      break;
    }
  }
  return placed;
}

export const groupsKnockout: FormatModule = {
  id: "groups_knockout",
  label: "Groups → knockout",
  blurb: "Group stage, then a knockout",
  minPlayers: (matchType) => (matchType === "doubles" ? 12 : 6),
  matchCount: (entrants, o) => {
    const groupSize = o?.groupSize ?? DEFAULTS.groupSize;
    const advance = o?.advancePerGroup ?? DEFAULTS.advancePerGroup;
    const count = Math.max(1, Math.round(entrants / groupSize));
    const base = Math.floor(entrants / count);
    const bigger = entrants % count;
    let group = 0;
    for (let g = 0; g < count; g++) {
      const size = base + (g < bigger ? 1 : 0);
      group += (size * (size - 1)) / 2;
    }
    return group + nextPowerOfTwo(count * advance) - 1;
  },
  build: ({ entrants, tournamentId, gen, groupSize, advancePerGroup }: GenOpts): BracketMatch[] => {
    const size = groupSize ?? DEFAULTS.groupSize;
    const advance = advancePerGroup ?? DEFAULTS.advancePerGroup;
    const groups = assignGroups(entrants, size);
    const out: BracketMatch[] = [];

    const blank = (round: number, index: number): BracketMatch => ({
      id: gen(), tournamentId, round, index, matchId: null,
      entrantA: null, entrantB: null, winnerEntrant: null,
      court: null, scoredBy: null,
      winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
      groupIdx: null, srcA: null, srcB: null,
    });

    // Group stage: a round-robin per group, no edges.
    let round = 1;
    let maxGroupRound = 1;
    groups.forEach((members, g) => {
      circleRounds(members.map((e) => e.id)).forEach((pairs, r) => {
        pairs.forEach(([a, b], i) => {
          out.push({
            ...blank(round + r, i), entrantA: a, entrantB: b, groupIdx: g,
          });
        });
        maxGroupRound = Math.max(maxGroupRound, round + r);
      });
    });

    // Knockout: a standard tree over count * advance slots, rounds numbered
    // above the group stage so `round` stays one ascending axis.
    const slots = nextPowerOfTwo(groups.length * advance);
    const koRounds: BracketMatch[][] = [];
    let width = slots / 2;
    let koRound = maxGroupRound + 1;
    while (width >= 1) {
      koRounds.push(Array.from({ length: width }, (_, i) => blank(koRound, i)));
      koRound++;
      width = width / 2;
    }

    // Wire the tree.
    koRounds.forEach((rows, r) => {
      const next = koRounds[r + 1];
      for (const m of rows) {
        if (!next) continue; // the final: null edge ends the tournament
        m.winToMatchId = next[Math.floor(m.index / 2)].id;
        m.winToSlot = m.index % 2 === 0 ? "a" : "b";
      }
    });

    // Seed the first knockout round from standings tokens (see
    // seedKnockoutSlots for how completeness, byes, group-separation and
    // determinism are all satisfied).
    const first = koRounds[0];
    const placed = seedKnockoutSlots(groups.length, advance);
    first.forEach((m, i) => {
      m.srcA = placed[i * 2] ?? null;
      m.srcB = placed[i * 2 + 1] ?? null;
    });

    return [...out, ...koRounds.flat()];
  },
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket.filter((m) => m.groupIdx !== null), entrants, scores),
  status: (bracket, _entrants?: Entrant[]) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const final = bracket.find((m) => m.groupIdx === null && m.winToMatchId === null);
    if (final?.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
    const anyPlayed = bracket.some((m) => m.matchId || m.winnerEntrant);
    return { status: anyPlayed ? "live" : "pending", champion: null };
  },
};
