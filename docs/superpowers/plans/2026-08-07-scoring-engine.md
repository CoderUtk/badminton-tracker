# Configurable Badminton Scoring Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a generic, config-driven badminton scoring engine (rally → point → score → deuce/advantage → sudden death → winner) for the 11/15/21-point formats, wire it into the existing match engine, fix the resulting max-score bug in the new-match screen, and add a right-court-only first-serve picker.

**Architecture:** All scoring rules live in one new pure file, `src/engine/scoring.ts`, with zero dependency on serving/rotation/interval/match-level logic. `src/engine/engine.ts`'s `applyRally` calls into it instead of its current ad-hoc win check. Two UI files (`app/new-match.tsx`, `src/screens/MatchScreen.tsx`) consume the new exports.

**Tech Stack:** TypeScript, Jest, React Native/Expo Router.

## Global Constraints

- Keep every scoring rule (deuce/advantage/sudden-death/win thresholds) in the single file `src/engine/scoring.ts` — this is the spec's core requirement, so future rule changes touch one place.
- The scoring engine must stay fully decoupled from singles/doubles rules, service rules, service court selection, player rotation, change of ends, match-level best-of-X, intervals, fouls, lets, and match statistics.
- Never allow a score above the configured maximum: 11-point → max 15, 15-point → max 20, 21-point → max 30.
- The engine must be deterministic: same initial state + same rally sequence → same score, state, and winner, always.
- Do not show "Advantage" at the sudden-death score.
- Run `npx tsc --noEmit` and `npm test -- --silent` after every task; both must be clean before moving on.

---

### Task 1: `src/engine/scoring.ts` — the generic scoring engine

**Files:**
- Create: `src/engine/scoring.ts`
- Test: Create `tests/scoring.test.ts`

**Interfaces:**
- Produces: `ScoreState` type, `ScoringConfig` interface, `GameFormat` type,
  `GAME_FORMATS` constant, `deriveScoringConfig(targetScore, maxScore): ScoringConfig`,
  `scoreState(score, cfg): ScoreState`,
  `applyPoint(score, winner, cfg): { score; state; gameWinner }`. Task 2
  imports all of these by exact name from `./scoring`.

- [ ] **Step 1: Write the failing tests**

Create `tests/scoring.test.ts`:

```typescript
import { applyPoint, deriveScoringConfig, GAME_FORMATS } from "../src/engine/scoring";

type Score = { A: number; B: number };

/** Replay a sequence of rally winners through applyPoint, returning the
 *  score/state/gameWinner after each step. */
function play(format: 11 | 15 | 21, winners: ("A" | "B")[]) {
  const cfg = GAME_FORMATS[format];
  let score: Score = { A: 0, B: 0 };
  const steps: { score: Score; state: string; gameWinner: string | null }[] = [];
  for (const w of winners) {
    const r = applyPoint(score, w, cfg);
    score = r.score;
    steps.push({ score: r.score, state: r.state, gameWinner: r.gameWinner });
  }
  return steps;
}

describe("GAME_FORMATS table", () => {
  test("matches the spec exactly", () => {
    expect(GAME_FORMATS[11]).toEqual({ targetScore: 11, maxScore: 15, deuceScore: 10, suddenDeathAt: 14 });
    expect(GAME_FORMATS[15]).toEqual({ targetScore: 15, maxScore: 20, deuceScore: 14, suddenDeathAt: 19 });
    expect(GAME_FORMATS[21]).toEqual({ targetScore: 21, maxScore: 30, deuceScore: 20, suddenDeathAt: 29 });
  });
});

describe("deriveScoringConfig", () => {
  test("deuceScore is targetScore - 1, suddenDeathAt is maxScore - 1", () => {
    expect(deriveScoringConfig(11, 15)).toEqual(GAME_FORMATS[11]);
    expect(deriveScoringConfig(15, 20)).toEqual(GAME_FORMATS[15]);
    expect(deriveScoringConfig(21, 30)).toEqual(GAME_FORMATS[21]);
  });
});

describe("normal game-winning rule", () => {
  test("11-point: 11-8 is a win, 10-9 is not", () => {
    const cfg = GAME_FORMATS[11];
    expect(applyPoint({ A: 10, B: 8 }, "A", cfg).gameWinner).toBe("A"); // 11-8
    expect(applyPoint({ A: 9, B: 9 }, "A", cfg).gameWinner).toBeNull(); // 10-9
  });
});

describe("11-point acceptance table", () => {
  // A wins every rally in this trace; scores below are cumulative.
  const winners: ("A" | "B")[] = [
    ..."A".repeat(10).split(""), // A: 0->10
    ..."B".repeat(9).split(""),  // B: 0->9   => 10-9
    "A",                          // 11-9      GAME WON
  ] as ("A" | "B")[];

  test("10-9 -> next point gives 11-9 -> GAME WON", () => {
    const steps = play(11, winners);
    const last = steps[steps.length - 1];
    expect(last.score).toEqual({ A: 11, B: 9 });
    expect(last.gameWinner).toBe("A");
    expect(last.state).toBe("GAME_OVER");
  });

  test("10-10 -> DEUCE, 11-10 -> ADVANTAGE, 11-11 -> DEUCE, 12-11 -> ADVANTAGE, 13-11 -> GAME WON", () => {
    const cfg = GAME_FORMATS[11];
    let score: Score = { A: 10, B: 9 };
    let r = applyPoint(score, "B", cfg); // 10-10
    expect(r.score).toEqual({ A: 10, B: 10 });
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 11-10
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 11-11
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 12-11
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 13-11
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
  });

  test("14-14 -> SUDDEN DEATH, 15-14 -> GAME WON, score never exceeds 15", () => {
    const cfg = GAME_FORMATS[11];
    let score: Score = { A: 13, B: 13 };
    let r = applyPoint(score, "A", cfg); // 14-13
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 14-14
    expect(r.score).toEqual({ A: 14, B: 14 });
    expect(r.state).toBe("SUDDEN_DEATH");
    expect(r.gameWinner).toBeNull();
    score = r.score;

    r = applyPoint(score, "A", cfg); // 15-14
    expect(r.score).toEqual({ A: 15, B: 14 });
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
    expect(r.score.A).toBeLessThanOrEqual(cfg.maxScore);
    expect(r.score.B).toBeLessThanOrEqual(cfg.maxScore);
  });
});

describe("15-point acceptance table", () => {
  test("14-13 -> 15-13 GAME WON", () => {
    const cfg = GAME_FORMATS[15];
    const r = applyPoint({ A: 14, B: 13 }, "A", cfg);
    expect(r.score).toEqual({ A: 15, B: 13 });
    expect(r.gameWinner).toBe("A");
  });

  test("14-14 DEUCE -> 15-14 ADVANTAGE -> 15-15 DEUCE -> 16-15 ADVANTAGE -> 17-15 GAME WON", () => {
    const cfg = GAME_FORMATS[15];
    let score: Score = { A: 13, B: 14 };
    let r = applyPoint(score, "A", cfg); // 14-14
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 15-14
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 15-15
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 16-15
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 17-15
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
  });

  test("19-19 -> SUDDEN DEATH, 20-19 -> GAME WON, score never exceeds 20", () => {
    const cfg = GAME_FORMATS[15];
    let score: Score = { A: 18, B: 19 };
    let r = applyPoint(score, "A", cfg); // 19-19
    expect(r.score).toEqual({ A: 19, B: 19 });
    expect(r.state).toBe("SUDDEN_DEATH");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 20-19
    expect(r.score).toEqual({ A: 20, B: 19 });
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
    expect(r.score.A).toBeLessThanOrEqual(cfg.maxScore);
  });
});

describe("21-point acceptance table", () => {
  test("20-19 -> 21-19 GAME WON", () => {
    const cfg = GAME_FORMATS[21];
    const r = applyPoint({ A: 20, B: 19 }, "A", cfg);
    expect(r.score).toEqual({ A: 21, B: 19 });
    expect(r.gameWinner).toBe("A");
  });

  test("20-20 DEUCE -> 21-20 ADVANTAGE -> 21-21 DEUCE -> 22-21 ADVANTAGE -> 23-21 GAME WON", () => {
    const cfg = GAME_FORMATS[21];
    let score: Score = { A: 19, B: 20 };
    let r = applyPoint(score, "A", cfg); // 20-20
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 21-20
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "B", cfg); // 21-21
    expect(r.state).toBe("DEUCE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 22-21
    expect(r.state).toBe("ADVANTAGE");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 23-21
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
  });

  test("29-29 -> SUDDEN DEATH, 30-29 -> GAME WON, score never exceeds 30", () => {
    const cfg = GAME_FORMATS[21];
    let score: Score = { A: 28, B: 29 };
    let r = applyPoint(score, "A", cfg); // 29-29
    expect(r.score).toEqual({ A: 29, B: 29 });
    expect(r.state).toBe("SUDDEN_DEATH");
    score = r.score;

    r = applyPoint(score, "A", cfg); // 30-29
    expect(r.score).toEqual({ A: 30, B: 29 });
    expect(r.state).toBe("GAME_OVER");
    expect(r.gameWinner).toBe("A");
    expect(r.score.A).toBeLessThanOrEqual(cfg.maxScore);
  });
});

describe("determinism", () => {
  test("the same sequence always produces the same result", () => {
    const cfg = GAME_FORMATS[21];
    const winners: ("A" | "B")[] = ["A", "B", "A", "A", "B", "B", "A"];
    const run = () => {
      let score: Score = { A: 0, B: 0 };
      let last;
      for (const w of winners) {
        last = applyPoint(score, w, cfg);
        score = last.score;
      }
      return last;
    };
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/scoring.test.ts --silent`
Expected: FAIL — `Cannot find module '../src/engine/scoring'`

- [ ] **Step 3: Write the implementation**

Create `src/engine/scoring.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/scoring.test.ts --silent`
Expected: PASS (all tests green — 11/15/21 acceptance tables, GAME_FORMATS
table, deriveScoringConfig, determinism).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/engine/scoring.ts tests/scoring.test.ts
git commit -m "feat(engine): add generic configurable scoring engine"
```

---

### Task 2: Wire the scoring engine into `engine.ts`

**Files:**
- Modify: `src/engine/engine.ts:35-90` (delete `isGameOver`, update `applyRally`, add `gameScoreState` selector)
- Modify: `src/engine/index.ts` (barrel export)

**Interfaces:**
- Consumes: `deriveScoringConfig`, `applyPoint`, `scoreState`, `ScoreState` from Task 1's `./scoring`.
- Produces: `gameScoreState(s: MatchState): ScoreState`, exported from `src/engine/engine.ts` and re-exported via `src/engine/index.ts`. Task 5 (MatchScreen) imports this exact name.

No new test file for this task — `tests/engine.test.ts` already covers
`applyRally`'s behavior end-to-end (game/match win, 20-20 lead
requirement, 29-29 golden point) using the default 21/30 config, and this
task's whole point is that those existing tests keep passing unchanged
after the internal swap. Task 1's `tests/scoring.test.ts` already covers
the algorithm itself directly.

- [ ] **Step 1: Add the import**

In `src/engine/engine.ts`, add to the top of the file (after the existing
`import type { ... } from "./types";` block):

```typescript
import { applyPoint, deriveScoringConfig, scoreState, type ScoreState } from "./scoring";
```

- [ ] **Step 2: Delete `isGameOver`**

Remove this whole function from `src/engine/engine.ts` (currently at
lines 35-44):

```typescript
function isGameOver(s: MatchState, score: Record<TeamId, number>): TeamId | null {
  const { pointsToWin, cap } = s.config;
  for (const t of ["A", "B"] as TeamId[]) {
    const mine = score[t];
    const theirs = score[other(t)];
    if (mine === cap) return t;
    if (mine >= pointsToWin && mine - theirs >= 2) return t;
  }
  return null;
}
```

- [ ] **Step 3: Update `applyRally` to use the scoring engine**

Replace the start of `applyRally` (currently):

```typescript
function applyRally(s: MatchState, by: TeamId): MatchState {
  if (s.phase !== "playing") {
    throw new Error(`Cannot score a rally while phase is "${s.phase}"`);
  }
  const score = { ...s.score, [by]: s.score[by] + 1 };
  const rallies = [...s.rallies, by];
```

with:

```typescript
function applyRally(s: MatchState, by: TeamId): MatchState {
  if (s.phase !== "playing") {
    throw new Error(`Cannot score a rally while phase is "${s.phase}"`);
  }
  const cfg = deriveScoringConfig(s.config.pointsToWin, s.config.cap);
  const { score, gameWinner } = applyPoint(s.score, by, cfg);
  const rallies = [...s.rallies, by];
```

Then, further down in the same function, replace:

```typescript
  const gameWinner = isGameOver(s, score);
  if (gameWinner) {
```

with just:

```typescript
  if (gameWinner) {
```

(the `gameWinner` variable now comes from the destructuring above — do
not declare it twice).

- [ ] **Step 4: Add the `gameScoreState` selector**

Add near the other selectors at the bottom of `src/engine/engine.ts`
(after `serverName`, before `pointSituation` — anywhere in the
"selectors" section is fine):

```typescript
/** Current DEUCE/ADVANTAGE/SUDDEN_DEATH/NORMAL/GAME_OVER classification of the live score. */
export function gameScoreState(s: MatchState): ScoreState {
  const cfg = deriveScoringConfig(s.config.pointsToWin, s.config.cap);
  return scoreState(s.score, cfg);
}
```

- [ ] **Step 5: Update the barrel export**

`src/engine/index.ts` currently reads:

```typescript
export * from "./types";
export * from "./engine";
```

Add the scoring module:

```typescript
export * from "./types";
export * from "./engine";
export * from "./scoring";
```

- [ ] **Step 6: Run the full existing engine test suite to verify no regression**

Run: `npx jest tests/engine.test.ts --silent`
Expected: PASS — all pre-existing tests (basic scoring, intervals,
service/doubles rotation, games and match, game/match point detection,
undo/replay determinism) pass unchanged, proving the swap from
`isGameOver` to `scoring.applyPoint` is behavior-preserving for the
default 21/30 config.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/engine/engine.ts src/engine/index.ts
git commit -m "refactor(engine): delegate win/deuce/advantage logic to scoring.ts"
```

---

### Task 3: Fix the max-score bug in `app/new-match.tsx`

**Files:**
- Modify: `app/new-match.tsx:4` (import), `app/new-match.tsx:76` (cap calculation)

**Interfaces:**
- Consumes: `GAME_FORMATS` from Task 2's barrel export (`../src/engine`).

No new test file — this screen has no existing test coverage (Expo Router
screens aren't unit-tested in this repo), and the fix is a one-line
constant lookup. Verified manually in Step 3 below by inspecting the
built `MatchConfig`.

- [ ] **Step 1: Import `GAME_FORMATS`**

In `app/new-match.tsx`, change line 4:

```typescript
import { defaultConfig, MatchConfig, replay } from "../src/engine";
```

to:

```typescript
import { defaultConfig, GAME_FORMATS, MatchConfig, replay } from "../src/engine";
```

- [ ] **Step 2: Fix the cap calculation**

In `buildConfig` (currently around line 76), replace:

```typescript
    return defaultConfig({
      matchType: doubles ? "doubles" : "singles",
      teams,
      pointsToWin: points,
      cap: points + 9, // 21→30 per BWF; shorter formats scale the same way
      intervalAt: points === 21 ? 11 : 0,
      bestOf,
      firstServer: { team: serverTeam, playerIndex: serverPlayer },
    });
```

with:

```typescript
    return defaultConfig({
      matchType: doubles ? "doubles" : "singles",
      teams,
      pointsToWin: points,
      cap: GAME_FORMATS[points].maxScore, // 11->15, 15->20, 21->30
      intervalAt: points === 21 ? 11 : 0,
      bestOf,
      firstServer: { team: serverTeam, playerIndex: serverPlayer },
    });
```

- [ ] **Step 3: Manual verification**

With `npx tsc --noEmit` clean, add a temporary `console.log(buildConfig().cap)`
in the component, or check via the existing `preview` memo in a debugger,
for each of the three "Points per game" selections — confirm the resulting
`cap` is 15, 20, and 30 respectively. Remove any temporary debug code
before committing.

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
git add app/new-match.tsx
git commit -m "fix(new-match): correct max score cap for 11/15-point formats"
```

---

### Task 4: Restrict first-serve picker to right-court players

**Files:**
- Modify: `app/new-match.tsx` (the "First serve" section)

**Interfaces:**
- Consumes: existing `names`, `label`, `doubles`, `needed`, `firstServerIdx` state from this same file (unchanged from before this task).

No new test — same reasoning as Task 3.

- [ ] **Step 1: Replace the "First serve" chip row**

In `app/new-match.tsx`, replace this block (currently around lines
202-215):

```typescript
      <Text style={s.h}>First serve</Text>
      <View style={s.clubRow}>
        {Array.from({ length: needed }, (_, i) => (
          <Pressable
            key={i}
            style={[s.chip, firstServerIdx === i && s.chipOn]}
            onPress={() => setFirstServerIdx(i)}
          >
            <Text style={s.chipText}>
              {names[i].trim() || label(i)}
            </Text>
          </Pressable>
        ))}
      </View>
```

with:

```typescript
      <Text style={s.h}>First serve</Text>
      <Text style={s.hint}>Service always starts from the right court.</Text>
      <View style={s.clubRow}>
        {/* Doubles: only the right-court player of each team (slots 0 and 2)
            can serve first — the laws of badminton require the first serve
            of a game to come from the right service court. Use "Swap
            Team A/B" above to change who stands on the right before picking.
            Singles has no left/right player distinction, so both slots stay. */}
        {(doubles ? [0, 2] : Array.from({ length: needed }, (_, i) => i)).map((i) => (
          <Pressable
            key={i}
            style={[s.chip, firstServerIdx === i && s.chipOn]}
            onPress={() => setFirstServerIdx(i)}
          >
            <Text style={s.chipText}>
              {names[i].trim() || label(i)}
            </Text>
          </Pressable>
        ))}
      </View>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual verification**

With the dev server running, open "New match", switch to Doubles, and
confirm the "First serve" row shows exactly 2 chips (Team A's and Team
B's first-named player) instead of 4. Use "Swap Team A" / "Swap Team B"
to confirm the chip's name updates to whichever player is now on the
right in the court preview above. Switch to Singles and confirm both
chips still show (unchanged behavior).

- [ ] **Step 4: Commit**

```bash
git add app/new-match.tsx
git commit -m "feat(new-match): restrict first-serve picker to right-court players"
```

---

### Task 5: Score-state pill in `MatchScreen.tsx`

**Files:**
- Modify: `src/screens/MatchScreen.tsx`

**Interfaces:**
- Consumes: `gameScoreState(s: MatchState): ScoreState` from Task 2's `../engine` barrel export.

No new test — `MatchScreen.tsx` has no existing test coverage in this
repo (screen components aren't unit-tested here); verified manually per
Step 4.

- [ ] **Step 1: Import `gameScoreState`**

In `src/screens/MatchScreen.tsx`, change line 7:

```typescript
import { MatchState, pointSituation, serverName, TeamId } from "../engine";
```

to:

```typescript
import { gameScoreState, MatchState, pointSituation, serverName, TeamId } from "../engine";
```

- [ ] **Step 2: Compute the pill text and insert it into `scoreBlock`**

Add this just before the `const scoreBlock = (` declaration (after the
`banner`/`playing` computation, so it can use `playing`):

```typescript
  const scoreState = playing ? gameScoreState(state) : null;
  const statePillText =
    !scoreState || scoreState === "NORMAL" || scoreState === "GAME_OVER"
      ? null
      : scoreState === "ADVANTAGE"
      ? `ADVANTAGE — ${teamName(state.score.A > state.score.B ? "A" : "B")}`
      : scoreState === "SUDDEN_DEATH"
      ? "SUDDEN DEATH"
      : "DEUCE";
```

Then, inside `scoreBlock`'s `<View style={s.scoreWrap}>`, add the pill
right after the closing tag of `<View style={s.scoreRibbon}>...</View>`:

```typescript
      <View style={s.scoreRibbon}>
        <View style={[s.ribbonTeam, s.ribbonTeamA]}>
          <View style={s.serveSlot}>{state.servingTeam === "A" && <View style={[s.serveDot, { backgroundColor: C.red }]} />}</View>
          <Text style={[s.ribbonName, { color: C.red }]} numberOfLines={1}>{teamName("A")}</Text>
        </View>
        <Text style={[s.ribbonScore, { color: C.red }, textGlow(C.red, 16)]}>{state.score.A}</Text>
        <Text style={s.scoreDivider}>—</Text>
        <Text style={[s.ribbonScore, { color: C.blue }, textGlow(C.blue, 16)]}>{state.score.B}</Text>
        <View style={[s.ribbonTeam, s.ribbonTeamB]}>
          <Text style={[s.ribbonName, { color: C.blue }]} numberOfLines={1}>{teamName("B")}</Text>
          <View style={s.serveSlot}>{state.servingTeam === "B" && <View style={[s.serveDot, { backgroundColor: C.blue }]} />}</View>
        </View>
      </View>
      {statePillText && (
        <View style={s.statePill}>
          <Text style={s.statePillText}>{statePillText}</Text>
        </View>
      )}
```

- [ ] **Step 3: Add the pill styles**

In the `StyleSheet.create` block at the bottom of the file, add next to
`scoreDivider`:

```typescript
  scoreDivider: { color: C.text3, fontSize: 20, marginHorizontal: 2 },
  statePill: {
    alignSelf: "center", backgroundColor: C.card, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.red,
  },
  statePillText: { color: C.red, fontSize: 12, fontFamily: F.bold, letterSpacing: 0.6 },
```

- [ ] **Step 4: Typecheck and manual verification**

Run: `npx tsc --noEmit` — must be clean.

With the dev server running, start a match, and drive the score (via the
`+1` rails) to a deuce/advantage/sudden-death sequence for whichever
format is configured (e.g. play both sides to 20-20 in a 21-point game).
Confirm the pill shows "DEUCE", then "ADVANTAGE — <team>" after the next
rally, then disappears if the score returns to a tie below the max, and
shows "SUDDEN DEATH" at 29-29 with no "ADVANTAGE" ever shown at that
score.

- [ ] **Step 5: Commit**

```bash
git add src/screens/MatchScreen.tsx
git commit -m "feat(match-screen): show deuce/advantage/sudden-death state pill"
```

---

## Self-Review Notes

- **Spec coverage:** §1-2 (formats, rally scoring) → Task 1's
  `GAME_FORMATS`/`applyPoint`. §3-6 (normal win, deuce, advantage,
  sudden death) → Task 1's `applyPoint`/`scoreState`, verified against
  every example score pair from those sections. §7 (algorithm) →
  `applyPoint`'s check order directly mirrors the pseudocode. §8
  (config model) → `GAME_FORMATS` matches the spec's JSON exactly
  (Task 1's own test asserts this). §9 (states) → `ScoreState` type.
  §10 (UI) → Task 5's pill (DEUCE/ADVANTAGE—team/SUDDEN DEATH, no
  ADVANTAGE at sudden-death score since `scoreState` returns
  `SUDDEN_DEATH` not `ADVANTAGE` at that score by construction). §11
  (architecture separation) → `scoring.ts` has no imports beyond its own
  types; `engine.ts` keeps all serving/rotation/interval logic exactly
  where it was, only substituting the win-check internals. §12
  (acceptance tests) → Task 1's test file encodes every documented
  transition for all three formats, plus the "never exceed max" checks
  and a determinism test. The new-match max-score bug and the
  right-court first-serve restriction (raised after the initial spec)
  are Tasks 3 and 4.
- **Placeholder scan:** none found on the final pass — the test file has
  no TBDs, and every step has literal code, not a description of code.
- **Type consistency:** `applyPoint(score: Score, winner: "A" | "B", cfg: ScoringConfig)`
  defined in Task 1 is called identically in Task 2's `engine.ts` (with
  `by: TeamId`, which is exactly `"A" | "B"`) and in every Task 1 test.
  `gameScoreState(s: MatchState): ScoreState` defined in Task 2 is
  imported by that exact name in Task 5.
