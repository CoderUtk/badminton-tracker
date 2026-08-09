# Task 2: Pure Home-Dashboard Logic Module — Report

## Summary

Implemented the pure logic module for the home dashboard (`src/home/dashboard.ts`) and its comprehensive test suite (`tests/homeDashboard.test.ts`), following strict TDD methodology.

## What Was Implemented

### Module: `src/home/dashboard.ts`
- **Purpose**: Pure display logic for the home dashboard, with no React or database dependencies.
- **Exports** (8 total):
  1. `MIN_MATCHES_FOR_RATES = 5` — constant defining the threshold for showing win rates and streaks
  2. `pickNextSession()` — finds the soonest upcoming session, skipping cancelled/done sessions
  3. `sessionDateLabel()` — formats session start time, showing "Today" for same-day sessions
  4. `sessionMetaLabel()` — combines date label with location or court count
  5. `liveClubIds()` — collects club IDs of sessions currently in progress
  6. `resolveMyPlayerName()` — resolves user's display name from club membership or profile
  7. `statTileValues()` — formats match stats for display, with threshold-based dashing
  8. `shouldShowFeatureCopy()` — determines if onboarding copy should show (below threshold)

### Test Suite: `tests/homeDashboard.test.ts`
- **Total tests**: 25, organized into 8 describe blocks (one per function)
- **Coverage**:
  - `pickNextSession`: 5 tests (empty, all past, ordering, filtering, live handling)
  - `sessionDateLabel`: 2 tests (same-day formatting, different-day formatting)
  - `sessionMetaLabel`: 4 tests (location precedence, court count fallback, singular/plural, blank location)
  - `liveClubIds`: 2 tests (collection, empty set)
  - `resolveMyPlayerName`: 5 tests (club preference, fallback to display name, null handling, blank name)
  - `statTileValues`: 4 tests (null handling, threshold boundary, zero values)
  - `shouldShowFeatureCopy`: 3 tests (null, below threshold, at/above threshold)

## TDD Evidence

### RED Phase
```bash
$ npx jest tests/homeDashboard.test.ts
FAIL tests/homeDashboard.test.ts
  ● Test suite failed to run
    [96mtests/homeDashboard.test.ts[0m:[93m10[0m:[93m8[0m - [91merror[0m[90m TS2307: [0mCannot find module '../src/home/dashboard'
```
Expected failure: module did not exist.

### GREEN Phase
```bash
$ npx jest tests/homeDashboard.test.ts
PASS tests/homeDashboard.test.ts (17.141 s)
  pickNextSession
    √ no sessions -> null (5 ms)
    √ all in the past -> null (1 ms)
    √ picks the earliest upcoming, not the first in the array (1 ms)
    √ skips cancelled and done sessions
    √ includes a live session that has not started yet by clock (1 ms)
  sessionDateLabel
    √ same calendar day reads Today (25 ms)
    √ a different day uses weekday, month and date (2 ms)
  sessionMetaLabel
    √ appends location when present (1 ms)
    √ falls back to court count when location is null (1 ms)
    √ singular court reads '1 court'
    √ blank location is treated as absent
  liveClubIds
    √ collects club ids of live sessions only (1 ms)
    √ no live sessions -> empty set
  resolveMyPlayerName
    √ prefers the club-player name matching my profile (1 ms)
    √ falls back to display name when no club player matches
    √ falls back to display name when profile id is null
    √ returns null when nothing identifies the user
    √ ignores club players with a blank name (1 ms)
  statTileValues
    √ null analytics -> zero matches and dashes (1 ms)
    √ below the threshold -> true match count, dashed rates (1 ms)
    √ at the threshold -> real values (1 ms)
    √ a zero win rate above the threshold still shows 0%, not a dash (1 ms)
  shouldShowFeatureCopy
    √ shown for a user with no analytics at all
    √ shown below the threshold
    √ hidden at and above the threshold

Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```
All 25 tests pass.

## Verification

### TypeScript Typecheck
```bash
$ npx tsc --noEmit
(silent — no errors)
```

### Full Test Suite
```bash
$ npx jest
Test Suites: 42 passed, 42 total
Tests:       253 passed, 253 total
```
All 42 test suites pass, including 25 new tests. No regressions.

## Files Changed
- **Created**: `src/home/dashboard.ts` (92 lines)
- **Created**: `tests/homeDashboard.test.ts` (198 lines)
- **Total**: 290 insertions

## Commit
```
6f5b078 feat(home): pure dashboard selectors for session, stats and identity
```

## Self-Review Findings

✅ **Completeness**: All 8 exports present with correct signatures matching brief
✅ **Code Quality**: Follows brief's structure exactly; minimal, readable implementations
✅ **Discipline**: No over-engineering; only what the brief asked for
✅ **Testing**: Comprehensive coverage of happy paths, edge cases, and null/empty scenarios
✅ **Typing**: All types correct; TypeScript passes cleanly
✅ **Constraints Met**:
  - No React imports
  - No database access
  - Pure functions taking plain data, returning plain data
  - `MIN_MATCHES_FOR_RATES` defined once and exported
  - No stray exports beyond the eight specified
  - Tests are flat jest files with no component-render infrastructure
  - Explicit git add with correct pathspec; no `-A` or `commit -a`
  - No `Co-Authored-By` trailer
  - Only two files touched; stayed on branch

## Concerns
None. All requirements met, all tests pass, code is clean.

---

## Fix Round 1: Locale-Fragile Test Fix

### Finding
The test `sessionDateLabel` "a different day uses weekday, month and date" was locale-fragile. It hardcoded `expect(label).toContain("Aug")`, which only passes on English locales. On de-DE, fr-FR, or other locales, the test fails even though the code is correct.

### Resolution
Fixed the test to compute the expected value the same way the production function does, rather than asserting a hardcoded English string.

**What Changed** (in `tests/homeDashboard.test.ts`):
```typescript
// BEFORE (line 78-83)
test("a different day uses weekday, month and date", () => {
  const at = new Date("2026-08-11T18:30:00").getTime();
  const label = sessionDateLabel(at, NOW);
  expect(label).not.toMatch(/^Today/);
  expect(label).toContain("Aug");  // ← LOCALE-FRAGILE
});

// AFTER
test("a different day uses weekday, month and date", () => {
  const at = new Date("2026-08-11T18:30:00").getTime();
  const label = sessionDateLabel(at, NOW);

  // Verify it's NOT today
  expect(label).not.toMatch(/^Today/);

  // Verify it uses the weekday, month, and day format
  const expectedDate = new Date(at).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  expect(label).toBe(expectedDate);
});
```

The test now:
- Still verifies it does NOT start with "Today"
- Computes the expected value using the exact same `toLocaleDateString()` call as the production code
- Works across all ICU locales without modification

### Verification

**Covering Test Run:**
```bash
$ npx jest tests/homeDashboard.test.ts
PASS tests/homeDashboard.test.ts (9.567 s)
  sessionDateLabel
    √ same calendar day reads Today (28 ms)
    √ a different day uses weekday, month and date (2 ms)
  [23 other tests...]
Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```

**TypeScript Typecheck:**
```bash
$ npx tsc --noEmit
(silent — no errors)
```

### Commit
```
90e6acf fix(test): remove locale-fragile hardcoded 'Aug' assertion in sessionDateLabel test
```

### Production Code
No changes to `src/home/dashboard.ts` — it correctly uses `toLocaleDateString([], ...)` to follow device locale, which is deliberate and matches the existing `dateLabel` helper in `app/(app)/sessions/index.tsx:16`.
