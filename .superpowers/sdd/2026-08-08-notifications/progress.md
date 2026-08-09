# SDD ledger — plan: docs/superpowers/plans/2026-08-08-notifications.md

Branch: feat/notifications (created from master @ 9c7c3fc, in-place — a fresh
worktree would have no node_modules and every task runs jest/tsc)
Concurrent sessions are editing this checkout. Files that must never be staged:
CLAUDE.md, app/(auth)/sign-in.tsx, src/stores/session.tsx, src/lib/authCallback.ts,
REACT_NATIVE_ANIMATION_GUIDE.md, web/.vercel/, npx/, and the two deleted assets.

Pre-flight scan: 2 conflicts found, both adjudicated by human before Task 1.
  (1) Task 6 step 3 registered the push token on every launch regardless of the
      local toggle, which silently re-enables push after the user disables it and
      contradicts the spec's "token row IS the setting". RULING: gate
      registerPushToken() on REMINDERS_KEY === "1". Task 6 must implement the
      gate, not the plan text.
  (2) Task 2 session body copy: spec says "{club} at {time}", plan says
      "Starts at {time}." RULING: keep the plan's copy, no club lookup.

Task 1: complete (commits 9c7c3fc..9acc15c, review clean)
  - reviewer ⚠️ "tsc not verifiable from diff" resolved by controller:
    `npx tsc --noEmit` exits 0 on 9acc15c.
Task 1: minor (deferred): test and implementation are both verbatim from the
  brief, so the tests pin the brief's correctness rather than independently
  scrutinising it. Inherent to a plan that ships complete code; not actionable.
Task 2: complete (commits 9acc15c..d37533b, review clean)
  - cancelAllScheduledNotificationsAsync is gone; cancellation now scoped to
    INACTIVITY_ID and session:* only.
  - reviewer ⚠️ "test output is pasted, not raw" resolved by controller:
    ran `npx tsc --noEmit` (clean) and `npx jest` (43 suites / 265 tests) directly.
Task 3: complete (commits d37533b..4edaae1, review clean)
  - reviewer ⚠️ on commit scope + test claims resolved by controller: `git show
    --stat 4edaae1` is exactly the 2 intended files, no trailer; tsc clean,
    43 suites / 265 tests.
Task 3: minor (deferred): toggle sub-line now reads "Match reminders and
  requests" — the "requests" half is forward-looking copy for Task 6's push.
  Accurate once Task 6 lands; re-check at final review if Task 6 changes scope.
Task 3: minor (deferred): syncSessionReminders fires on every sessions-screen
  reload, not just after a toggle flip. Self-guards make it a cheap no-op when
  reminders are off. Not a defect.
Task 4: implemented (commit 50475f5). Migration SQL reviewed correct on every
  security property (RLS ownership incl. with-check, push_to revoke, pinned
  search_path, exception handlers, 60-day filter, requester exclusion).
  Review returned 2 Important, both in tests/notifications.schema.test.ts:
  (1) RLS policy bodies have zero coverage — all 6 tests pass even if a policy
      were weakened to using(true);
  (2) the revoke assertion is two unanchored regexes, so a migration that
      revoked from public only and re-granted to authenticated would still pass.
  NOT treated as plan-mandated: the plan's stated purpose for this test is to
  catch silent removal of these clauses, so it fails on its own terms.
  - reviewer ⚠️ on Co-Authored-By resolved by controller: `git log -1 --format=%B
    50475f5` is subject only, no trailer.
Task 4: fix round 1/5 (2 addressed, 1 open — revoke assertion now a single
  anchored regex, per-function exception handlers tied; RLS ownership coverage
  still gameable; commits 50475f5..be07307)
  - re-reviewer reproduced the bleed-through: the new RLS regexes use non-greedy
    .*? with dotAll and no right anchor, so weakening select-using, insert-with-
    check or update-using still passes by matching the NEXT policy's correct
    clause. Implementer's validation weakened all policies at once, which cannot
    detect that class of bug.
Task 4: fix round 2/5 (1 addressed, 0 open — per-policy block extraction via
  sql.split(/(?=create policy)/); commits be07307..73a0416)
  - re-reviewer independently reproduced all 5 weakened-clause cases in a scratch
    copy: each now fails its own assertion in isolation, none flips a neighbour.
    Empty-block case fails safe (regex.test("") is false), order-independent.
Task 4: complete (commits 4edaae1..73a0416, review clean)
  - controller-verified: range touches only the migration + its test, suite
    44 suites / 272 tests.
Task 4: minor (deferred): getPolicyBlock's split is case-sensitive on the literal
  "create policy" and would misbehave on mixed case or on a policy body containing
  that substring. Not a live risk in 0035; would matter if reused.
Task 5: implemented (commit 718740f). push.ts logic reviewed clean (unregister
  deletes by token not profile_id; platform guard sound; errors contained;
  supabase! justified). Review NOT approved on 1 Important: the commit touched 7
  files, adding jest.config.js + 4 global mocks (react-native stub pins
  Platform.OS="ios" repo-wide for all present and future suites).
  ROOT CAUSE IS A PLAN DEFECT: the plan put the pure pushTokenRow inside push.ts,
  which imports react-native/expo-notifications at module scope, so it is not
  jest-reachable without mocks. HUMAN RULING: extract pure fn to src/lib/pushToken.ts
  (zero imports), push.ts re-exports, revert jest.config.js, delete all 4 mocks.
  Mirrors the reminderPlan.ts / reminders.ts split from Tasks 1-2.
Task 5: fix round 1/5 (1 addressed, 0 open — pure fn extracted to
  src/lib/pushToken.ts with zero imports, push.ts re-exports, jest.config.js
  reverted, all 4 global mocks deleted; commits 718740f..eef40b5)
Task 5: complete (commits 73a0416..eef40b5, review clean)
  - controller-verified: tests/__mocks__/ holds only the 2 pre-existing stubs,
    jest.config.js unmodified, tsc clean, 45 suites / 276 tests.
  - net range touches exactly 3 files: push.ts, pushToken.ts, pushToken.test.ts.
Task 6: complete (commits eef40b5..f4b8824, review clean)
  - pre-flight ruling (1) implemented: registerPushToken() early-returns when
    getSetting(REMINDERS_KEY) !== "1", inside the function so all call sites are
    safe, and before permissions or any DB write. toggleReminders still writes
    the setting before calling it, so the gate reads the fresh value.
  - sign-out ordering verified: unregisterPushToken().finally(() => signOut()),
    so the RLS-gated delete runs while the JWT is still live.
  - implementer extended registration to AppState "active" resume beyond the
    brief; reviewer judged sound (idempotent upsert, self-guarding, matches the
    existing scheduleInactivityReminder resume pattern). Accepted.
  - controller-verified: 3 files, no trailer, tsc clean, 45 suites / 276 tests.
Task 6: minor (deferred): a toggle flip racing an AppState resume could interleave
  getSetting/setSetting. Both paths converge on the same idempotent upsert/delete;
  not a correctness bug.
Task 7: complete (commits f4b8824..044e54c, review clean)
  - both listener paths present (addNotificationResponseReceivedListener +
    getLastNotificationResponseAsync for cold start); cancelled guard consulted
    on both, sub.remove() in cleanup. Route strings verified against real files.
  - controller-verified: tsc clean, 46 suites / 281 tests.
All 7 code tasks complete. Task 8 (Firebase/FCM credentials, migration apply,
device pass) is human-only and cannot be dispatched.
Final whole-branch review (opus, 9c7c3fc..044e54c): "Merge after fixes".
  4 Important + 8 Minor. Important: (1) cold-start deep link never navigates —
  RootLayout returns null until fontsLoaded so router.push throws into a swallowing
  catch; (2) RLS blocks the account-switch upsert the token-as-PK design depends on
  (DO UPDATE is checked against the EXISTING row, owned by the previous user), so
  the new user can never register and the old user keeps receiving pushes on their
  phone for 60 days; (3) unregisterPushToken needs the network to learn its own
  token, so disabling offline leaves a live token; (4) the trigger exception-handler
  test bleeds across functions exactly like the RLS assertions did.
Final fix wave dispatched (one subagent, all findings). Commit 6579f67.
Scoped re-review (sonnet, 044e54c..6579f67): all 4 MUST-FIX + both ALSO-FIX
  ADDRESSED. MUST-FIX 4 independently reproduced by mutation script. push_to's
  revoke confirmed byte-identical.
Controller-verified final state: tsc clean, 46 suites / 287 tests.

OPEN — Important, needs a human decision (no second fix wave per process):
  register_push_token (0035:98-103) is security definer and does
  `on conflict (token) do update set profile_id = excluded.profile_id`
  unconditionally. It never checks who owns the pre-existing row. Any
  non-anonymous authenticated caller who knows a victim's Expo push token string
  can reassign that row to themselves: the victim silently stops receiving push,
  and the attacker's account starts receiving what was destined for that device.
  The RLS update policy it replaces for this path DID block that (while also
  blocking the legitimate account switch — the bug it was added to fix).
  Precondition bounds it: the app never exposes another user's token to a client
  (select policy is own-rows only), so the attacker needs an out-of-band leak
  (Sentry breadcrumb, log, support paste). Spec at
  docs/superpowers/specs/2026-08-08-notifications-design.md:111-112 still claims
  "RLS restricts every operation to profile_id = auth.uid()", which is now
  inaccurate for this path.
  Staleness-gating the reassignment does NOT work as a mitigation: the legitimate
  account-switch row is fresh and owned by the previous user, which is exactly the
  shape being blocked.
  HUMAN RULING: mitigate — reassignment becomes deletion. register_push_token
  deletes any row for that token owned by someone else, then inserts its own. An
  attacker who knows a token can still silence that device but can no longer
  receive its notifications; interception is the half that matters. Same-user
  re-registration must stay a cheap idempotent upsert so updated_at keeps acting
  as the 60-day heartbeat. Spec 111-112 to be corrected in the same commit.
  Mitigation dispatched (resumed the fix-wave implementer). Commit 4161166.
  Controller-verified by reading 0035 directly: owner is auth.uid() only with no
  profile_id parameter; `delete from push_tokens where token = p_token and
  profile_id <> v_profile_id` precedes the insert; the `on conflict do update`
  branch sets only platform and updated_at, never profile_id, so ownership can be
  dropped but never taken. anon rejected, empty token rejected, platform
  restricted, search_path pinned, push_to's revoke intact at 0035:171.
  Spec 111-129 rewritten to describe the register path and the accepted residual.
  Final state: tsc clean, 46 suites / 288 tests, 11 commits, no Co-Authored-By
  trailers anywhere in the range.
COSMETIC, not fixed: commits 6579f67 and 4161166 each carry a stray "@" line
  (heredoc artifact), so `git log --oneline` renders their subject as
  "@ fix(notifications): ...". A filter-branch to strip it was blocked by the
  permission classifier; not worked around. A squash merge would erase it.
MERGED to master as b880365 (--no-ff). Merged result verified green by the
  controller: tsc clean, 46 suites / 288 tests. Branch feat/notifications deleted.
  master is 12 ahead of origin/master — NOT pushed.
Task 8 progress:
  - 0035 APPLIED TO PRODUCTION (project lpwibwynpwmyhnskywif). Verified against
    the live REST API, not just the migration history table: push_tokens returns
    200; rpc/register_push_token raises "not authenticated" for an anon key (the
    auth.uid() guard firing); rpc/push_to returns 42501 permission denied, so the
    revoke is live. db push runs each file in a transaction, so the presence of
    both the table and the RPC means the file applied in full.
  - 0036_missing_fk_indexes.sql also applied (another session's migration, still
    untracked in git at the time it was applied).
  - Firebase project courtside-cf6f8 created; google-services.json committed with
    the app.json wiring (852cf84), package com.navalo.courtside matches.
    Admin-SDK key pattern gitignored (cd9d5a3).
REMAINING: FCM V1 service-account key upload via `eas credentials -p android`;
  local builds need `expo prebuild` (the generated android/ predates
  googleServicesFile, so the Google Services gradle plugin is not applied);
  then the device pass. Workspace retained until the device pass is done.
