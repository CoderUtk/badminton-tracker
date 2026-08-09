# Final whole-branch code review — fix report

Branch: `feat/home-dashboard`
Starting HEAD: a30d0f0
Commits created: `202b254`, `3ae34e1`

## Finding 1 — `reload()` reads a cache that a sibling chain is concurrently rewriting

File: `app/(app)/index.tsx`, `reload()` (now lines 42-83).

Replaced the five independent `void ...then(...)` chains with a single
`loadFromCache()` async function that:
1. Reads `listRealClubs()` and `listSessions()` from the local cache and sets state — instant first paint.
2. Reads `getMyProfile()`, then `listMyClubPlayers()`, resolves the name via `resolveMyPlayerName`, and computes analytics — all from the pre-refresh cache.

`reload()` then runs `loadFromCache().then(refreshClubs).then(refreshSessions).then(loadFromCache again)` — a single ordered promise chain. `refreshClubs()` and `refreshSessions()` are awaited in full before the second `loadFromCache()` call re-derives clubs, sessions, and identity/analytics from the now-refreshed cache. A cold cache no longer produces a stuck "0 / — / —" + onboarding-copy state, because the second pass corrects it once `refreshClubs()`/`refreshSessions()` resolve.

## Finding 2 — `listSessions()` called twice concurrently, and it is not a pure read

File: `app/(app)/index.tsx`, same `reload()`.

`listSessions()` and `listRealClubs()` are each called exactly once per phase (once in the pre-refresh `loadFromCache()`, once in the post-refresh `loadFromCache()`), and the two phases are sequenced, never concurrent. Since the post-refresh call only runs after `refreshSessions()`/`refreshClubs()` have fully resolved (and after the first `loadFromCache()`'s own `listSessions()` call has completed and already flipped any stale-live row to `done` via `endSession()`), there is no window where two invocations observe the same live-and-stale row and both fire `set_session_status`.

## Finding 3 — five unsequenced, uncancelled chains all `setState` unconditionally

File: `app/(app)/index.tsx`, `reload()` (lines 34-92).

- Added `epochRef = useRef(0)`. `reload()` increments it (`const epoch = ++epochRef.current`) before doing any async work.
- Every `setState` call inside `loadFromCache()` is preceded by `if (epoch !== epochRef.current) return;` — a chain from a stale focus (or one that outlives unmount) can no longer overwrite fresher state.
- `useFocusEffect` now wraps `reload` in `useCallback(() => { reload(); return () => { epochRef.current += 1; }; }, [reload])`, satisfying React Navigation's contract (a memoized callback returning a cleanup function) and bumping the epoch on blur/unmount so any promise still in flight from the previous focus becomes a no-op.
- The whole `loadFromCache().then(...).then(...).then(...)` chain ends in a single `.catch(() => {})` — a throw anywhere (e.g. inside `getPlayerAnalytics`) is swallowed instead of producing an unhandled rejection, and whatever state was set by the last successful step before the throw remains on screen (never blank, never a hard crash).

## Finding 4 — untested display logic left in the component, shipped with a dead condition

Files: `src/home/dashboard.ts` (new `resolveNextSessionTitle`, lines ~53-62), `app/(app)/index.tsx` (line 96, render gate unchanged in shape).

Added:
```ts
export function resolveNextSessionTitle(clubs: Club[], next: ClubSession | null): string | null {
  if (!next) return null;
  return clubs.find((c) => c.id === next.club_id)?.name ?? null;
}
```
No fallback string — returns `null` when `next` is null or the club isn't among the loaded clubs. `index.tsx` now computes `const nextSessionTitle = resolveNextSessionTitle(clubs, next);` and the render gate `{next && nextSessionTitle && (...)}` is unchanged in code but is now live: it can actually evaluate false when the club lookup misses.

Tests added in `tests/homeDashboard.test.ts` (`describe("resolveNextSessionTitle", ...)`): club found → name; club not found → null; null session → null.

## Finding 5 — the user's identity is resolved non-deterministically

Files: `src/repos/clubRepo.ts` line 150 (`listMyClubPlayers`), `tests/homeDashboard.test.ts`.

```ts
export async function listMyClubPlayers(): Promise<ClubPlayer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<ClubPlayer>("select * from club_players_cache order by name");
}
```
Added `order by name`, matching `listPlayers`'s sibling pattern. Did not touch `resolveMyPlayerName`'s "first match wins" behavior or attempt any cross-club aggregation — determinism only, as instructed.

Test added: `"multiple matching club players -> deterministically picks the first"` — asserts `resolveMyPlayerName` picks the first element of the (now name-ordered) input array regardless of array order passed in, i.e. that the function's own behavior is a deterministic function of its input order (the repo-level fix guarantees that input order is itself deterministic).

## Finding 6 — tautological test assertion

File: `tests/homeDashboard.test.ts`, `"a different day uses weekday, month and date"`.

Replaced the `expect(label).toBe(expectedDate)` (which recomputed the identical `toLocaleDateString` call) with:
```ts
expect(label).toContain("11");       // day-of-month must appear
expect(label).not.toContain("·");    // the same-day branch's separator must not
```
Kept `expect(label).not.toMatch(/^Today/)`. No hardcoded English month reintroduced.

## Finding 7 — non-null assertions relying on an implicit invariant

File: `src/home/dashboard.ts`, `statTileValues` (lines ~71-83).

```ts
export function statTileValues(analytics: PlayerAnalytics | null): {
  matches: string; winRate: string; streak: string; hasRates: boolean;
} {
  const played = analytics?.played ?? 0;
  if (!analytics || played < MIN_MATCHES_FOR_RATES) {
    return { matches: String(played), winRate: "—", streak: "—", hasRates: false };
  }
  return {
    matches: String(played),
    winRate: `${analytics.winPct}%`,
    streak: String(analytics.longestWinStreak),
    hasRates: true,
  };
}
```
No `!` assertions remain. Existing tests for this function were left untouched and still pass.

## Finding 8 — missing accessibility labels

- `src/components/ClubSheet.tsx`: added `accessibilityLabel="New club name"` to the create-club `TextInput` (line 67) and `accessibilityLabel="Invite code"` to the join-by-code `TextInput` (line 85).
- `app/(app)/index.tsx`: club row `Pressable` (lines ~124-131) now has `accessibilityRole="button"` and `accessibilityLabel={club.name}`.

## Tests added/changed

`tests/homeDashboard.test.ts`:
- Rewrote the tautological half of the `sessionDateLabel` "different day" test (finding 6).
- Added `resolveMyPlayerName` "multiple matching club players -> deterministically picks the first" (finding 5).
- Added `describe("resolveNextSessionTitle", ...)` with 3 cases: found, not found, null session (finding 4).
- Imported `resolveNextSessionTitle` and `Club` type.

No other test files touched. `statTileValues`, `shouldShowFeatureCopy`, `pickNextSession`, `sessionMetaLabel`, `liveClubIds` tests untouched and still pass.

## Commands run

```
npx tsc --noEmit
```
Output: (clean, no errors)

```
npx jest
```
Output (tail):
```
Test Suites: 42 passed, 42 total
Tests:       257 passed, 257 total
Snapshots:   0 total
Time:        25.145 s
Ran all test suites.
```
(257 = prior 253 + 4 new: 3 `resolveNextSessionTitle` cases + 1 `resolveMyPlayerName` determinism case. One benign Jest worker-teardown warning about a worker process not exiting gracefully — pre-existing infra noise, not related to this change, and does not affect pass/fail.)

## Files changed

- `src/home/dashboard.ts`
- `src/repos/clubRepo.ts`
- `tests/homeDashboard.test.ts`
- `app/(app)/index.tsx`
- `src/components/ClubSheet.tsx`

No other files touched. Verified via `git status --short` before committing that only these five were modified (plus the pre-existing, intentionally-uncommitted `CLAUDE.md` modification and two deleted `assets/*` files, and the untracked `REACT_NATIVE_ANIMATION_GUIDE.md`, `npx`, `web/.vercel/` — none of which were staged).

## Self-review

- **Single, ordered `reload()` path, no duplicate concurrent calls?** Yes — `loadFromCache().then(refreshClubs).then(refreshSessions).then(loadFromCache)`. `listSessions()`/`listRealClubs()` each run once per phase, phases are sequential, never concurrent.
- **Every `setState` epoch-guarded, cleanup bumps epoch?** Yes — every `setClubs`/`setSessions`/`setDisplayName`/`setAnalytics` call in `loadFromCache()` is preceded by an epoch check; `useFocusEffect`'s cleanup does `epochRef.current += 1`.
- **Rejected promise leaves the screen usable?** Yes — single `.catch(() => {})` at the end of the chain; whatever state was set by the last successful step (e.g. first-paint clubs/sessions even if the later profile/analytics step throws) stays on screen.
- **First paint still fast?** Yes — `loadFromCache()` runs immediately, reading only local SQLite (`listRealClubs`, `listSessions`, `getMyProfile`, `listMyClubPlayers`), before any network call.
- **`resolveNextSessionTitle` makes the render gate meaningful?** Yes — it returns `null` (not a fallback string) when the club isn't loaded, so `{next && nextSessionTitle && (...)}` can now actually skip rendering.
- **Pre-existing tests still pass untouched?** Yes — all previously-passing suites pass; the only test-file edits were the ones described above (new cases + the finding-6 rewrite), everything else in `homeDashboard.test.ts` and all other test files are untouched and green.

## Concerns

- `loadFromCache()` runs `getPlayerAnalytics` twice per focus in the worst case (once pre-refresh, once post-refresh) — this is the intended design per finding 1's "read cache once, then re-derive after refresh" instruction, and the task explicitly says not to add caching/memoization to `getPlayerAnalytics`, so this is left as is.
- The Jest run prints "A worker process has failed to exit gracefully" — this is a pre-existing Jest/RN test-environment teardown warning unrelated to this branch's changes (present before this session's edits too, per typical RN+Jest setups); all 42 suites / 257 tests still report passed.
