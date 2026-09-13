import type { BracketMatch, BracketSize, Entrant } from "./types";

// Standard single-elim seed order for a bracket of `size` (1-based seeds).
// e.g. size 4 -> [1,4,2,3]; size 8 -> [1,8,4,5,2,7,3,6].
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

export function buildBracket(
  entrants: Entrant[], size: BracketSize, tournamentId: string, gen: () => string,
): BracketMatch[] {
  const bySeed = new Map(entrants.map((e) => [e.seed, e]));
  const order = seedOrder(size); // length === size, values are seed numbers
  const out: BracketMatch[] = [];

  // Round 1: pair adjacent slots in seed order. Missing seed => bye (null).
  const r1: BracketMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const a = bySeed.get(order[i * 2]) ?? null;
    const b = bySeed.get(order[i * 2 + 1]) ?? null;
    const present = a && b ? null : (a ?? b);
    r1.push({
      id: gen(), tournamentId, round: 1, index: i, matchId: null,
      entrantA: a ? a.id : null, entrantB: b ? b.id : null,
      winnerEntrant: present ? present.id : null, // bye auto-resolves
      court: null, scoredBy: null,
      winToMatchId: null, winToSlot: null,
      lossToMatchId: null, lossToSlot: null,
      groupIdx: null, srcA: null, srcB: null,
    });
  }
  out.push(...r1);

  // Empty later rounds.
  let count = size / 2;
  let round = 2;
  let prev = r1;
  while (count > 1) {
    count = count / 2;
    const cur: BracketMatch[] = [];
    for (let i = 0; i < count; i++) {
      cur.push({ id: gen(), tournamentId, round, index: i, matchId: null, entrantA: null, entrantB: null, winnerEntrant: null, court: null, scoredBy: null, winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null, groupIdx: null, srcA: null, srcB: null });
    }
    out.push(...cur);
    // Propagate byes already resolved in prev round into this round.
    for (const m of prev) {
      if (m.winnerEntrant) applyInto(cur, m.index, m.winnerEntrant);
    }
    prev = cur; round++;
  }
  return out;
}

function applyInto(round: BracketMatch[], childIndexFrom: number, winner: string): void {
  const target = round[Math.floor(childIndexFrom / 2)];
  if (!target) return;
  if (childIndexFrom % 2 === 0) target.entrantA = winner;
  else target.entrantB = winner;
}

export function advanceWinner(bracket: BracketMatch[], bracketMatchId: string, winnerEntrant: string): BracketMatch[] {
  const copy = bracket.map((m) => ({ ...m }));
  const m = copy.find((x) => x.id === bracketMatchId);
  if (!m) return bracket;
  m.winnerEntrant = winnerEntrant;
  const child = copy.find((x) => x.round === m.round + 1 && x.index === Math.floor(m.index / 2));
  if (child) {
    if (m.index % 2 === 0) child.entrantA = winnerEntrant;
    else child.entrantB = winnerEntrant;
  }
  return copy;
}

export function bracketStatus(bracket: BracketMatch[]): { status: "pending" | "live" | "done"; champion: string | null } {
  if (bracket.length === 0) return { status: "pending", champion: null };
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const final = bracket.find((m) => m.round === maxRound && m.index === 0)!;
  if (final.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
  const anyPlayed = bracket.some((m) => m.matchId || (m.winnerEntrant && m.round === 1));
  return { status: anyPlayed ? "live" : "pending", champion: null };
}
