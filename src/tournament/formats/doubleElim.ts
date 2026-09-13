import { buildBracket } from "../bracket";
import { drawSizeFor } from "../draw";
import type { BracketMatch, Entrant, Slot } from "../types";
import type { FormatModule, GenOpts, MatchScore, Standing } from "./types";
import { recordStandings } from "./standings";

/**
 * Winners bracket exactly as single elimination, plus a losers bracket fed by
 * every winners match's loss edge, plus a grand final.
 *
 * Losers-bracket rounds are numbered above the winners bracket so `round`
 * stays a single ascending axis the tree renderer can group by. A losers round
 * alternates: an "absorb" round takes fresh droppers from the winners bracket
 * (merged in against last round's survivors, or standalone for round 1's
 * droppers), and a "playoff" round plays those survivors off against each
 * other before the next absorb round.
 *
 * No bracket reset: if the losers-bracket winner beats the winners-bracket
 * winner in the grand final, they win. The reset doubles the explaining for a
 * minority of finals and a club night cannot absorb an unscheduled match.
 */
export const doubleElim: FormatModule = {
  id: "double_elim",
  label: "Double elimination",
  blurb: "Two lives — one loss isn't the end",
  minPlayers: (matchType) => (matchType === "doubles" ? 6 : 4),
  // A double-elimination draw of size S plays (S-1) winners matches, (S-2)
  // losers matches, and 1 grand final.
  matchCount: (entrants) => 2 * drawSizeFor(entrants) - 2,
  build: ({ entrants, tournamentId, gen }: GenOpts): BracketMatch[] => {
    const size = drawSizeFor(entrants.length);
    const winners = buildBracket(entrants, size, tournamentId, gen);
    const wMaxRound = Math.max(...winners.map((m) => m.round));

    const blank = (round: number, index: number): BracketMatch => ({
      id: gen(), tournamentId, round, index, matchId: null,
      entrantA: null, entrantB: null, winnerEntrant: null,
      court: null, scoredBy: null,
      winToMatchId: null, winToSlot: null, lossToMatchId: null, lossToSlot: null,
      groupIdx: null, srcA: null, srcB: null,
    });

    // Losers rounds: for a size-S draw there are 2*(log2(S)-1) of them,
    // alternating absorb (take droppers) and playoff (play off). Widths halve
    // each pair.
    const losers: BracketMatch[][] = [];
    let width = size / 4;
    let round = wMaxRound + 1;
    while (width >= 1) {
      losers.push(Array.from({ length: width }, (_, i) => blank(round, i)));       // absorb
      round++;
      losers.push(Array.from({ length: width }, (_, i) => blank(round, i)));       // playoff
      round++;
      width = width / 2;
    }
    const grandFinal = blank(round, 0);

    const all = [...winners, ...losers.flat(), grandFinal];
    const byId = new Map(all.map((m) => [m.id, m]));
    const set = (m: BracketMatch, k: "win" | "loss", target: BracketMatch | null, slot: Slot) => {
      const row = byId.get(m.id)!;
      if (k === "win") { row.winToMatchId = target?.id ?? null; row.winToSlot = target ? slot : null; }
      else { row.lossToMatchId = target?.id ?? null; row.lossToSlot = target ? slot : null; }
    };

    // Winners bracket: winners advance up the tree; final winner goes to the
    // grand final's slot a.
    for (const m of winners) {
      const parent = winners.find((p) => p.round === m.round + 1 && p.index === Math.floor(m.index / 2));
      if (parent) set(m, "win", parent, m.index % 2 === 0 ? "a" : "b");
      else set(m, "win", grandFinal, "a");
    }

    // Winners-bracket losers drop in. Round 1 losers pair off into the first
    // absorb round; each later winners round feeds the absorb round that
    // follows its own depth.
    for (const m of winners) {
      if (m.round === 1) {
        const target = losers[0][Math.floor(m.index / 2)];
        set(m, "loss", target, m.index % 2 === 0 ? "a" : "b");
      } else {
        const absorbIdx = (m.round - 1) * 2 - 1;
        const target = losers[absorbIdx]?.[m.index];
        if (!target) {
          throw new Error(
            `doubleElim: no losers-bracket target for winners round ${m.round} index ${m.index} ` +
            `(absorb round ${absorbIdx})`,
          );
        }
        set(m, "loss", target, "b");
      }
    }

    // Inside the losers bracket: absorb round winners go to the playoff round
    // at the same index (slot a); playoff round winners go to the next absorb
    // round, halving the index.
    losers.forEach((rows, r) => {
      const next = losers[r + 1];
      for (const m of rows) {
        if (!next) { set(m, "win", grandFinal, "b"); continue; }
        const isAbsorb = r % 2 === 0;
        const target = isAbsorb ? next[m.index] : next[Math.floor(m.index / 2)];
        set(m, "win", target, isAbsorb ? "a" : (m.index % 2 === 0 ? "a" : "b"));
      }
    });

    return all;
  },
  standings: (bracket, entrants, scores?: Map<string, MatchScore>): Standing[] =>
    recordStandings(bracket, entrants, scores),
  // Its champion is the winner of the match with no win edge — entrants are
  // irrelevant here, but the param is accepted to satisfy FormatModule.
  status: (bracket, _entrants?: Entrant[]) => {
    if (bracket.length === 0) return { status: "pending", champion: null };
    const final = bracket.find((m) => m.winToMatchId === null)!;
    if (final.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
    const anyPlayed = bracket.some((m) => m.matchId || (m.winnerEntrant && m.round === 1));
    return { status: anyPlayed ? "live" : "pending", champion: null };
  },
};
