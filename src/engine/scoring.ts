/**
 * Generic, configuration-driven badminton game-scoring engine. Every
 * scoring rule (deuce, advantage, sudden death, win conditions) lives in
 * this one file so future rule changes touch nothing else. Deliberately
 * has zero knowledge of singles/doubles, serving, rotation, intervals,
 * fouls, lets, or match-level best-of-X — see src/engine/engine.ts for
 * where those live.
 */

export type ScoreState = "NORMAL" | "DEUCE" | "ADVANTAGE" | "SUDDEN_DEATH" | "GAME_OVER";

export interface ScoringConfig {
  targetScore: number;
  maxScore: number;
  deuceScore: number;
  suddenDeathAt: number;
}

export type GameFormat = 11 | 15 | 21;

export type Score = { A: number; B: number };

/** deuceScore = targetScore - 1, suddenDeathAt = maxScore - 1 — holds for
 *  every supported format. Lets any (targetScore, maxScore) pair — not
 *  just the three presets — get correct deuce/sudden-death thresholds. */
export function deriveScoringConfig(targetScore: number, maxScore: number): ScoringConfig {
  return {
    targetScore,
    maxScore,
    deuceScore: targetScore - 1,
    suddenDeathAt: maxScore - 1,
  };
}

export const GAME_FORMATS: Record<GameFormat, ScoringConfig> = {
  11: deriveScoringConfig(11, 15),
  15: deriveScoringConfig(15, 20),
  21: deriveScoringConfig(21, 30),
};

/** The scoring state implied by a score alone (no rally context needed). */
export function scoreState(score: Score, cfg: ScoringConfig): ScoreState {
  const { A, B } = score;
  if (A === cfg.maxScore || B === cfg.maxScore) return "GAME_OVER";
  if (A === cfg.suddenDeathAt && B === cfg.suddenDeathAt) return "SUDDEN_DEATH";
  if (A === B && A >= cfg.deuceScore) return "DEUCE";
  if (Math.abs(A - B) === 1 && Math.min(A, B) >= cfg.deuceScore) return "ADVANTAGE";
  return "NORMAL";
}

/**
 * Award one rally's point to `winner` and return the resulting score,
 * scoring state, and game winner (null if the game continues).
 *
 * Order of checks mirrors the rulebook exactly:
 * 1. If the score *before* this rally already had both sides at
 *    suddenDeathAt, this rally decides the game outright.
 * 2. Otherwise award the point. If the new score has both sides at
 *    suddenDeathAt, the game enters SUDDEN_DEATH (no winner yet).
 * 3. Otherwise, normal win check: winner's score >= targetScore and
 *    lead >= 2.
 * 4. Otherwise classify the new score as DEUCE / ADVANTAGE / NORMAL.
 */
export function applyPoint(
  score: Score,
  winner: "A" | "B",
  cfg: ScoringConfig
): { score: Score; state: ScoreState; gameWinner: "A" | "B" | null } {
  const loser: "A" | "B" = winner === "A" ? "B" : "A";

  if (score.A === cfg.suddenDeathAt && score.B === cfg.suddenDeathAt) {
    const finalScore = { ...score, [winner]: score[winner] + 1 };
    return { score: finalScore, state: "GAME_OVER", gameWinner: winner };
  }

  const next = { ...score, [winner]: score[winner] + 1 };

  if (next[winner] === cfg.suddenDeathAt && next[loser] === cfg.suddenDeathAt) {
    return { score: next, state: "SUDDEN_DEATH", gameWinner: null };
  }

  if (next[winner] >= cfg.targetScore && next[winner] - next[loser] >= 2) {
    return { score: next, state: "GAME_OVER", gameWinner: winner };
  }

  return { score: next, state: scoreState(next, cfg), gameWinner: null };
}
