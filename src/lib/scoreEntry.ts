import type { TeamId } from "../engine";

export type GameScore = { A: number; B: number };

/**
 * Winner of a match from its per-game scores: games won, not points. A game
 * level on points counts for neither side, and a match level on games has no
 * winner (null) — the same contract endMatchEarly() uses for an abandoned
 * match, so leaderboards treat both the same way.
 */
export function winnerFromGames(games: GameScore[]): TeamId | null {
  let a = 0;
  let b = 0;
  for (const g of games) {
    if (g.A > g.B) a += 1;
    else if (g.B > g.A) b += 1;
  }
  return a === b ? null : a > b ? "A" : "B";
}

/**
 * Validate the typed score rows of a logged result. Returns the parsed games,
 * or null when the entry isn't savable — one bad or half-filled row rejects
 * the whole match rather than silently dropping a game.
 */
export function parseGames(rows: { A: string; B: string }[]): GameScore[] | null {
  if (rows.length === 0) return null;
  const games: GameScore[] = [];
  for (const row of rows) {
    const A = score(row.A);
    const B = score(row.B);
    // A tie is rejected: a badminton game always has a winner, so an equal row
    // is an unfinished entry, not a draw.
    if (A === null || B === null || A === B) return null;
    games.push({ A, B });
  }
  return games;
}

function score(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  return Number(trimmed);
}
