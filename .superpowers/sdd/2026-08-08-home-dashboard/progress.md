# SDD ledger — plan: docs/superpowers/plans/2026-08-08-home-dashboard.md

Branch: feat/home-dashboard (created from master @ e99dfab)
Pre-flight: raw-rgba conflict adjudicated by human — constraint narrowed to allow
low-alpha tints of existing C.* values. Plan amended before Task 1.

Task 1: complete (commits c4ddebe..a8056e7, review clean)
  - reviewer ⚠️ on Co-Authored-By trailer resolved by controller: `git log -1 --format=%B a8056e7`
    shows subject only, no trailer. Clean.

Task 2: implemented (commit 6f5b078), review Approved with 1 Important (plan-mandated).
  - Finding: tests/homeDashboard.test.ts asserted literal "Aug" while sessionDateLabel
    follows device locale via toLocaleDateString([], ...). Flaky on non-English runtimes.
  - Human ruling: fix the TEST, keep production code locale-following (deliberate verbatim
    match of dateLabel in app/(app)/sessions/index.tsx:16). Fix round 1 dispatched.
Task 2: minor (deferred): pickNextSession excludes an already-started live session
  (starts_at > now); club-row LIVE pill covers that case.
Task 2: minor (deferred): sessionMetaLabel has no courts === 0 handling.
Task 2: fix round 1/5 (1 addressed, 0 open — locale-fragile test assertion; commits 6f5b078..90e6acf)
Task 2: complete (commits a8056e7..90e6acf, review clean)
Task 3: complete (commits 90e6acf..a2501eb, review clean)
Task 4: complete (commits a2501eb..4273b45, review clean)
  - first dispatch died on a session API limit before writing anything; re-dispatched
    from the same base, nothing partial to clean up.
  - reviewer ⚠️ on Co-Authored-By resolved by controller: no trailer present.
  - reviewer confirmed BottomPanel signature {visible,title,onClose,children} matches
    the call, and the relocated onCreate/onJoin are verbatim apart from the sheet-dismiss
    adaptation.
Task 4: minor (deferred): ClubSheet TextInputs have no accessibilityLabel (parity with
  the original inline forms, not a regression).
Task 5: complete (commits 4273b45..a30d0f0, review clean)
  - reviewer verified all three repo signatures against source (getMyProfile returns
    {id, displayName}; refreshSessions() takes no args; statsRepo re-exports
    getPlayerAnalytics + PlayerAnalytics). No adaptation was needed.
  - reviewer ⚠️ on a stray `repo.updateLiveScore is not a function` console line in the
    full-suite run resolved by controller: `npx jest tests/matchStore.liveTick.test.ts`
    passes clean in isolation, and the diff touches only index.tsx + clubRepo.ts, so it
    is a pre-existing cross-suite timer artifact, not a regression.
Task 5: minor (deferred): nextClubName's `?? "Session"` fallback makes the second half of
  the `{next && nextClubName && ...}` gate unreachable — it degrades to `next` alone.
  Plan-mandated (verbatim brief code). Only visible as a transient "Session" title if
  sessions resolve before clubs on cold load; self-corrects next render.
Task 6 (device verification): CANNOT BE RUN BY CONTROLLER — needs a physical device and a
  populated account. Handed to the human. No commit expected.
Final whole-branch review (opus, e99dfab..a30d0f0): "Merge after fixes". 5 Important, 6 Minor.
  Triage of deferred minors: (1) live-session exclusion — defer; (2) courts===0 — not real,
  createSession clamps to >=1; (3) ClubSheet a11y labels — defer (cheap, folded into fix wave);
  (4) nextClubName dead gate — MUST FIX.
  Important: reload() reads club_players_cache while refreshClubs() rewrites it (cold-cache
  veteran user sees 0/—/— plus onboarding copy, never self-corrects); listSessions() called
  twice concurrently and it MUTATES (stale-live sweep fires duplicate RPCs); five unsequenced
  uncancelled uncaught chains racing on setState; nextClubName dead condition + un-extracted
  display logic; listMyClubPlayers has no ORDER BY so identity resolution is non-deterministic.
Final fix wave dispatched (one subagent, all findings).
Fix wave: commits a30d0f0..3ae34e1 (202b254, 3ae34e1). Scoped re-review: all 8 findings
  ADDRESSED, no new breakage.
PARKED — ruling: finding 5's added test (tests/homeDashboard.test.ts) exercises
  resolveMyPlayerName over a hand-built ordered array, so it would still pass if the
  `order by name` in listMyClubPlayers were reverted. The production fix
  (src/repos/clubRepo.ts:150) is correct and verified; only the test's regression value is
  weak. A true guard needs repo-layer tests against SQLite, which this repo does not have —
  the same infra gap already accepted for components. Not load-bearing; deferred.
Controller-verified final state: `npx tsc --noEmit` clean, `npx jest` 42 suites / 257 tests.
REMAINING: Task 6 device verification — human only. Workspace kept until that is done.
