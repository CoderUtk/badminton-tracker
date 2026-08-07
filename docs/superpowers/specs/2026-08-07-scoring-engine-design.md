# Configurable Badminton Scoring Engine

## Problem

The app needs a badminton game-scoring engine supporting three selectable
point formats (11/15/21) with correct deuce, advantage, and sudden-death
behavior, driven by one generic, config-based algorithm — not per-format
special-casing. All scoring rules must live in a single file so future rule
changes touch one place.

Two related issues surfaced while reading the current implementation:

1. `app/new-match.tsx`'s existing 11/15/21 picker computes
   `cap: points + 9`, giving max scores of 20 and 24 for the 11- and
   15-point formats instead of the correct 15 and 20. This violates the
   hard "never exceed max score" rule for two of the three formats.
2. The "First serve" picker lets the user pick any of the 4 doubles
   players, including one who was just shown on the left in the court
   preview — even though the laws of badminton require the first serve of
   a game to come from the right service court.

## Current engine, for context

`src/engine/engine.ts`'s `applyRally` increments the score inline, then
calls a private `isGameOver(state, score)` that checks
`mine === cap` (hard win, no lead required) OR
`mine >= pointsToWin && mine - theirs >= 2`. This turns out to be
behaviorally equivalent to full deuce/advantage/sudden-death for the
existing default 21/30 config (verified by hand-tracing the sequence and
confirmed by the untouched `tests/engine.test.ts` suite), but it has no
explicit state (DEUCE/ADVANTAGE/SUDDEN_DEATH), isn't config-driven per
format, and mixes score logic with serving/position logic in one function.

## Design

### 1. New file: `src/engine/scoring.ts`

Pure, stateless, zero dependency on serving/rotation/interval/match-level
concerns — this is the single file holding every scoring rule.

```ts
export type ScoreState = "NORMAL" | "DEUCE" | "ADVANTAGE" | "SUDDEN_DEATH" | "GAME_OVER";

export interface ScoringConfig {
  targetScore: number;
  maxScore: number;
  deuceScore: number;
  suddenDeathAt: number;
}

export type GameFormat = 11 | 15 | 21;

export const GAME_FORMATS: Record<GameFormat, ScoringConfig>;

/** deuceScore = targetScore - 1, suddenDeathAt = maxScore - 1 (holds for all
 *  three supported formats — verified against the spec table). Used to build
 *  a ScoringConfig from any MatchConfig's pointsToWin/cap, including custom
 *  non-preset values, without adding new fields to MatchConfig. */
export function deriveScoringConfig(targetScore: number, maxScore: number): ScoringConfig;

export function scoreState(score: { A: number; B: number }, cfg: ScoringConfig): ScoreState;

export function applyPoint(
  score: { A: number; B: number },
  winner: "A" | "B",
  cfg: ScoringConfig
): { score: { A: number; B: number }; state: ScoreState; gameWinner: "A" | "B" | null };
```

`applyPoint` implements the rulebook's algorithm directly:
1. If the score *before* this rally already had both sides at
   `suddenDeathAt`, the rally winner wins the game outright.
2. Else, award the point. If the new score has both sides at
   `suddenDeathAt`, state becomes `SUDDEN_DEATH` (no win yet).
3. Else, if the winner's new score `>= targetScore` and their lead
   `>= 2`, they win the game.
4. Else classify: `DEUCE` when tied at or above `deuceScore`;
   `ADVANTAGE` when the score difference is 1 and the lower score is at
   or above `deuceScore`; otherwise `NORMAL`.

This is a pure function of `(score, winner, cfg)` — same inputs always
produce the same output, satisfying the determinism requirement with no
extra bookkeeping.

### 2. Wiring into `src/engine/engine.ts`

`applyRally` replaces its inline score increment and the `isGameOver` call
with one call to `scoring.applyPoint(s.score, by, deriveScoringConfig(s.config.pointsToWin, s.config.cap))`.
The private `isGameOver` function is deleted. A new selector,
`gameScoreState(s: MatchState): ScoreState`, wraps
`scoring.scoreState` for UI consumption, added next to the existing
`pointSituation`/`serviceCourt`/`serverName` selectors.

No changes to `MatchConfig`, `MatchEvent`, persistence, or any consumer
that only reads `score`/`phase`/`winner` — this is a pure internal
substitution.

### 3. Fix the max-score bug: `app/new-match.tsx`

`cap: points + 9` becomes `cap: GAME_FORMATS[points].maxScore`, giving the
correct 15/20/30 caps for the three formats.

### 4. First-serve picker restricted to right-court players: `app/new-match.tsx`

For doubles, the "First serve" chip row currently renders all 4 names
(`Array.from({ length: needed })`). It changes to render only indices
`[0, 2]` (each team's right-court player, matching `Court`'s existing
preview and `engine.ts`'s existing fixed `right = index0` convention for
the non-serving team). `firstServerIdx` becomes one of `{0, 2}`, and
`buildConfig`'s `serverPlayer` (`firstServerIdx % 2`) is therefore always
`0` — no `engine.ts` change needed, since passing `playerIndex: 0` for
either team now makes `right = index0` true for whichever team ends up
serving too, matching the non-serving team's existing fixed convention.
`swapTeam()` remains the mechanism for choosing which physical player
occupies the right-court slot before picking who serves. Singles is
unaffected — its 2 existing chips already just mean "which side serves,"
with no left/right player distinction.

### 5. UI: score-state pill (`src/screens/MatchScreen.tsx`)

A small status pill near the score ribbon shows `DEUCE`,
`ADVANTAGE — <team name>`, or `SUDDEN DEATH`, driven by
`gameScoreState(state)`. Hidden during `NORMAL` play. The existing
game-over banner ("Game to X — tap to start game N+1" /
"X win the match") already covers the `GAME_OVER` state from the spec, so
no separate "GAME WON" pill is added — this reuses what's already there
rather than duplicating it.

## Testing

New `tests/scoring.test.ts`, encoding the acceptance table verbatim for
all three formats (11/15/21): each documented score transition
(`10–9 → 11–9 GAME WON`, `10–10 → DEUCE`, `14–14 → SUDDEN DEATH`,
`15–14 → GAME WON`, etc.) as an explicit assertion against `applyPoint`,
plus a property test that `score` never exceeds `maxScore` across a long
randomized rally sequence for each format.

`tests/engine.test.ts` needs no changes — its existing cases (21/30
config) were hand-verified to produce identical results under the new
algorithm, and running the suite after the swap confirms it.

## Out of scope

- Any change to service-court rotation, player positions, change of ends,
  match-level best-of-X, intervals, fouls, lets, or match statistics — the
  scoring engine stays fully decoupled from all of these, per the
  architecture requirement.
- Configurable/custom point targets beyond 11/15/21 in the UI (the engine
  itself supports any `pointsToWin`/`cap` pair via `deriveScoringConfig`,
  but the picker itself stays a fixed 3-choice format selector, matching
  the existing UI and the spec's UI requirement).
