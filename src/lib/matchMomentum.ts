import type { MatchEvent, TeamId } from "../engine";

/**
 * The story of a match, derived from the rally log alone.
 *
 * The engine records who won each rally and nothing else (MatchEvent is four
 * variants), so everything here is a fold over RALLY_WON. No new event types,
 * no extra taps for the scorer, and it works retroactively on every match ever
 * scored.
 *
 * Pure and React-Native-free, same as matchStats.ts, so the node-env Jest
 * suite can import it.
 */

export type MomentumGame = {
  game: number;
  /** Cumulative (A − B) after each rally. Starts at 0 before the first point,
   *  so a game of n rallies yields n + 1 samples and the line always begins on
   *  the baseline. */
  diff: number[];
};

export type Momentum = {
  games: MomentumGame[];
  /** Largest points-ahead either side ever was, and who. null for a match with
   *  no rallies or one that never left level. */
  biggestLead: { side: TeamId; points: number } | null;
  /** The deepest hole the eventual winner climbed out of, within a single
   *  game. 0 when they were never behind. */
  comebackFrom: number;
  /** Longest run of consecutive points by either side, and who. */
  longestRun: { side: TeamId; points: number } | null;
};

/**
 * @param winner the side that won the match, used only for comebackFrom.
 *   Pass null for a live or forfeited match and comebackFrom stays 0.
 */
export function buildMomentum(events: MatchEvent[], winner: TeamId | null): Momentum {
  const games: MomentumGame[] = [{ game: 1, diff: [0] }];
  let a = 0;
  let b = 0;
  let biggest: Momentum["biggestLead"] = null;
  let deepest = 0;
  let runSide: TeamId | null = null;
  let run = 0;
  let bestRun: Momentum["longestRun"] = null;

  for (const e of events) {
    if (e.type === "GAME_STARTED") {
      games.push({ game: games.length + 1, diff: [0] });
      a = 0;
      b = 0;
      continue;
    }
    if (e.type !== "RALLY_WON") continue;

    if (e.by === "A") a++;
    else b++;
    games[games.length - 1].diff.push(a - b);

    const gap = Math.abs(a - b);
    if (gap > 0 && (!biggest || gap > biggest.points)) {
      biggest = { side: a > b ? "A" : "B", points: gap };
    }

    // Measured per game, like leadChanges: a deficit does not carry across a
    // scoreboard reset, so "came back from 5 down" must mean 5 down in one game.
    if (winner) {
      const behind = winner === "A" ? b - a : a - b;
      if (behind > deepest) deepest = behind;
    }

    // Runs deliberately survive GAME_STARTED, matching longestStreak in
    // matchStats.ts — carrying momentum into the next game is real.
    run = e.by === runSide ? run + 1 : 1;
    runSide = e.by;
    if (!bestRun || run > bestRun.points) bestRun = { side: e.by, points: run };
  }

  return {
    games: games.filter((g) => g.diff.length > 1),
    biggestLead: biggest,
    comebackFrom: deepest,
    longestRun: bestRun,
  };
}

/**
 * One-line headline, or null when the match had no story worth telling — a
 * straight-sets walkover produces no sentence rather than a limp one.
 *
 * @param nameOf renders a side's label (a player or pair name).
 */
export function momentumHeadline(m: Momentum, nameOf: (side: TeamId) => string): string | null {
  if (m.comebackFrom >= 4) return `Came back from ${m.comebackFrom} points down.`;
  if (m.longestRun && m.longestRun.points >= 6) {
    return `${nameOf(m.longestRun.side)} reeled off ${m.longestRun.points} straight.`;
  }
  if (m.biggestLead && m.biggestLead.points <= 3) return "Never more than 3 points apart.";
  return null;
}
