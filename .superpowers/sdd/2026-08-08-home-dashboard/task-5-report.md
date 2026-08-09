# Task 5 Report: Rewrite the home screen

## What was implemented

- `app/(app)/index.tsx` fully rewritten per the brief: greeting, enlarged
  START A MATCH CTA, self-retiring feature copy (conditional on
  `shouldShowFeatureCopy`), next-session card (conditional on `pickNextSession`
  returning a value and its club being resolvable), clubs list (empty-state CTA
  or inline `map` over `clubs`), and recent-performance stat tiles. The screen
  is now a single `ScrollView`; `AnimatedList` and the old inline create/join
  forms (and their state: `showInlineCreate`, `name`, `inviteCode`, `creating`,
  `joining`, `nameTouched`) are gone. Club creation/joining now goes through
  `ClubSheet`, opened via the `+` button or the empty-state CTA.
- `src/repos/clubRepo.ts`: added `listMyClubPlayers()` next to the other
  `list*` functions, following the exact convention used by `listPlayers` —
  gets the db handle via `getDb()`, returns `[]` if unavailable, otherwise
  queries `club_players_cache` (unfiltered, across all clubs).

## Signature verification (Step 3 of the brief)

All three assumptions in the brief held exactly as written — no adaptation
was needed:

1. **`getMyProfile()`** (`src/repos/profileRepo.ts:19`) returns
   `Promise<Profile | null>` where `Profile` has both `id: string` and
   `displayName: string`. Used as-is: `profile?.id`, `profile?.displayName`.
2. **`refreshSessions()`** (`src/repos/sessionRepo.ts:65`) is exported and
   callable with no arguments (`export async function refreshSessions(): Promise<void>`).
   Used as-is.
3. **`getPlayerAnalytics`** and **`PlayerAnalytics`** are both exported from
   `src/repos/statsRepo.ts` (lines 6 and 17 via `export type { PlayerAnalytics }`).
   Used as-is.

## Verification

- `npx tsc --noEmit` — silent, no errors.
- `npx jest` — **42 suites / 253 tests passing**, matching the required
  baseline exactly. One unrelated stray error (`repo.updateLiveScore is not a
  function` from `src/stores/matchStore.ts:52`) printed to stdout after all
  suites completed — this is a leaked timer from an unrelated store/test
  (Jest's own "worker process failed to exit gracefully" warning corroborates
  this), not a test failure; the final summary confirms all 42/253 passed.

## Files changed

- `C:\utkarsh\Projects\badminton-tracker\app\(app)\index.tsx` (full rewrite)
- `C:\utkarsh\Projects\badminton-tracker\src\repos\clubRepo.ts` (added
  `listMyClubPlayers()`)

## Self-review findings

- Section order matches spec: greeting → CTA → feature copy (conditional) →
  next-session card (conditional) → clubs (empty state or list) → recent
  performance stat tiles.
- Confirmed via direct read of the written file that `AnimatedList`,
  `BusyButton`, `TextInput`, and the inline create/join forms plus their state
  are fully removed; no dead imports or unused state remain.
- `now` is stamped once per `reload()` call via `setNow(Date.now())`, not read
  during render. `useMemo` for `next` (deps `[sessions, now]`) and `live`
  (deps `[sessions]`) memoize correctly.
- No raw hex introduced; the only `rgba()` tints present (club icon,
  live pill) are unchanged carryovers from the original file, each tinting an
  existing `C.*` color (red, green).
- No entrance/stagger animation; only the `press` token is used for feedback.
- The literal `5` is never inlined — all threshold logic goes through
  `dashboard.ts`'s `MIN_MATCHES_FOR_RATES` / `shouldShowFeatureCopy` /
  `statTileValues`.
- Only the two files in scope were touched; `git status` before staging
  confirmed no other uncommitted files (`CLAUDE.md`, `npx/`, `web/.vercel/`,
  `REACT_NATIVE_ANIMATION_GUIDE.md`, deleted assets) were staged. Commit used
  explicit pathspec on both files, no `Co-Authored-By` trailer.

## Concerns

None. All repo signatures matched the brief's assumptions with no adaptation
required, tsc is clean, and the full suite is green at the required baseline.
