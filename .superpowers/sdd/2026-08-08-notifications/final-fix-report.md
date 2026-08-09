# Notifications — final whole-branch review, fix wave

Branch `feat/notifications`. One pass, all findings from the final review.

Verification baseline: `npx tsc --noEmit` clean; `npx jest` 46 suites / 287 tests
passing (281 before, +6 net: 5 new schema tests, 1 new reminderPlan test, one
existing test rewritten).

---

## MUST-FIX 1 — cold-start deep link never navigates

**Was:** `app/_layout.tsx` resolved the cold-start notification response and
called `router.push()` immediately. `RootLayout` returns `null` until
`fontsLoaded`, so no navigator was mounted; `assertIsReady()` threw and the
throw vanished into the `.catch(() => {})`.

**Changed** (`app/_layout.tsx:124`, `:161-214`):

- Added `notificationRoutePath` state (`app/_layout.tsx:124`) — the resolved
  route is *parked*, never navigated to from the collecting effect.
- The collecting effect (`app/_layout.tsx:177-201`) resolves both sources
  (cold start + live listener) into that state.
- A second effect (`app/_layout.tsx:210-214`) replays it, gated on
  `fontsLoaded`, i.e. only once the `Stack` is actually rendered. Child effects
  run before the parent's, so by the time this fires the navigator is mounted.
- Switched `getLastNotificationResponseAsync()` (`@deprecated` in
  expo-notifications 0.32.17) to the synchronous `getLastNotificationResponse()`,
  and added `clearLastNotificationResponse()` once the response is consumed
  (`app/_layout.tsx:182`). API shape verified against the installed package's
  `build/NotificationsEmitter.d.ts` — both non-`Async` forms exist and the
  `Async` forms are the deprecated ones. Both calls are wrapped in `try/catch`
  because they are native-module calls and clearing must never be a
  precondition for routing.

**Why a local state field and not `src/lib/pendingLink.ts`:** deliberately not
reused. `pendingLink` is consumed by `Gate` (`app/_layout.tsx:110`) and by
`app/welcome.tsx:57`, and both feed it through `parseJoinTarget()`, which
understands join links and nothing else — a notification route such as
`/(app)/profile/friends` would parse to `null` and land on `/`. Writing to it
would also collide with a genuinely pending join link. This is a different
concern with a different consumer, so it gets its own state.

**Signed-out case — deliberate decision:** a tap while signed out is *not*
preserved across sign-in. The replay pushes the route, `Gate` redirects to
`/sign-in`, and the destination is dropped. Rationale: a push only reaches this
device while its token row is bound to a signed-in profile, so being signed out
at tap time means the session is already gone (sign-out, token expiry); landing
on home after re-authenticating is the honest result, and threading a second
kind of destination through `Gate`'s join-link replay would mean widening
`parseJoinTarget` for a case that barely occurs. Recorded in a comment at
`app/_layout.tsx:203-209` so it reads as a choice, not an oversight.

**Verification:** type-checked. Not unit-testable — `app/_layout.tsx` imports
`react-native`, `expo-router` and `expo-notifications`, and this repo has no
renderer (see *Not fixed / not tested* below).

---

## MUST-FIX 2 — RLS blocks the account-switch overwrite

**Was:** `upsert(row, { onConflict: "token" })` → `insert … on conflict do
update`, whose UPDATE policy is evaluated against the *existing* row (previous
owner), so `using (auth.uid() = profile_id)` rejected it permanently.

**Changed:**

- Added `public.register_push_token(p_token text, p_platform text)` to
  `supabase/migrations/0035_push_notifications.sql:68-105`:
  - `security definer`, `set search_path = public`, matching every other
    function in the file.
  - Owner is `auth.uid()` taken inside the function. **No `profile_id`
    parameter** — accepting one would let any client bind a token to another
    user.
  - Raises on a null `auth.uid()`, on an anonymous JWT
    (`coalesce((auth.jwt()->>'is_anonymous')::boolean, false)`, matching the
    insert policy and the convention in `0018_anon_rls_restrictions.sql`), on an
    empty token, and on a `platform` outside `('ios','android')` — the last
    named explicitly rather than left to the check constraint.
  - `on conflict (token) do update set profile_id = excluded.profile_id, …` —
    the in-place overwrite the token-as-primary-key design depends on.
  - **No revoke.** Its default execute grant stays, so `authenticated` can call
    it. `push_to`'s revoke (`:150-152`) is untouched.
- `src/lib/push.ts:78-81` now calls
  `supabase.rpc("register_push_token", { p_token, p_platform })` instead of the
  table upsert. `pushTokenRow()` is still used to build/validate the row so the
  platform check that mirrors the constraint stays in one place.

The migration file was edited directly, as instructed — it has never been
applied. No `0036` was created and nothing at 0034 or below was touched. Nothing
was applied to any database.

**Verification:** four new assertions in `tests/notifications.schema.test.ts`
(`registration goes through a security definer RPC, not a client upsert`,
`register_push_token derives the owner from auth.uid(), never a parameter`,
`register_push_token rejects anonymous sessions and bad platforms`,
`register_push_token stays callable by clients`). Each fails against the
pre-fix migration (the function does not exist). The signature check slices the
block at the first `)` and asserts `profile_id` does not appear in it.

---

## MUST-FIX 3 — a failed unregister is unrecoverable

**Was:** `unregisterPushToken()` called `currentToken()` (network round-trip to
Expo) first. Offline that throws, the delete never runs, and nothing ever
retries because `registerPushToken()` early-returns on the off toggle.

**Changed:**

- `src/repos/settingsRepo.ts:10-14`: new `PUSH_TOKEN_KEY = "push_token"`,
  following the existing `REMINDERS_KEY` pattern (same `app_settings` table, no
  schema change — it is a row key).
- `src/lib/push.ts:84-85`: a successful registration caches the token.
- `src/lib/push.ts:101-118`: `unregisterPushToken()` now reads the cache first
  and only falls back to `currentToken()` when there is no cache (older install
  / never registered from this build). The cache is cleared only when the delete
  actually succeeded, so a failure stays retryable.
- `src/lib/push.ts:131-145`: new `syncPushRegistration()` — the single push
  entry point. It resolves the session first (`supabase.auth.getUser()`), so
  neither half can fire without a live JWT for RLS; then registers when the
  toggle is on, or retries the delete when the toggle is off *and* a cached
  token exists (so a user who never enabled push never pays a network call).
- `app/_layout.tsx:152` and `:156` call `syncPushRegistration()` instead of
  `registerPushToken()`, on both cold start and `AppState → "active"`.
- The sign-out swallow in `app/(app)/profile/index.tsx:479` still cannot block
  sign-out, but the orphan row it can create is now cleaned up at the next
  launch by `syncPushRegistration()`.

The human ruling that `registerPushToken()` stays gated on
`getSetting(REMINDERS_KEY) === "1"` is preserved (`src/lib/push.ts:57`); the
gate in `syncPushRegistration()` is in addition to it, not a replacement.

**Verification:** type-checked. Not unit-testable — `src/lib/push.ts` imports
`react-native`, `expo-constants` and `expo-notifications`.

---

## MUST-FIX 4 — the trigger exception-handler test did not pin its property

**Was:** `/create or replace function public\.notify_friend_request\(\)[\s\S]*?exception when others then return new;/`
— unanchored `[\s\S]*?` crossing function boundaries.

**Changed** (`tests/notifications.schema.test.ts:30-45`): added a
`functionBlock(name)` helper that splits the file on `create or replace
function` and selects the block whose header names the function, then asserts
`exception when others then return new;` *within that block*. Same remedy
already used for the RLS policy assertions in this file.

**Per-handler validation** (scratch buffer only — the migration was not edited).
A scratch script loaded the real migration, deleted the handler from exactly one
function in memory, and ran both the old and new assertion logic:

| mutation | OLD friend | OLD join | NEW friend | NEW join |
|---|---|---|---|---|
| unmutated | pass | pass | pass | pass |
| handler removed from `notify_friend_request` only | **pass (bug)** | pass | **fail** | pass |
| handler removed from `notify_join_request` only | **pass (bug)** | fail | pass | **fail** |

The old friend assertion never fails — it reached forward into
`notify_join_request`'s handler, exactly as the review described. The new
assertions fail independently and only for the mutated function.

---

## ALSO FIX — migration is not re-runnable

`supabase/migrations/0035_push_notifications.sql:31-56`: added
`drop policy if exists "<name>" on public.push_tokens;` before each of the four
`create policy` statements, matching `0004_club_join_requests.sql:22-31`. Every
statement in the file is now re-runnable, which matters because it is applied by
hand and a partial application followed by a re-run would otherwise abort before
`push_to` and the triggers were created.

**Verification:** new test `every policy is dropped before it is created`
(`tests/notifications.schema.test.ts`) enumerates the `create policy` names from
the file and requires a matching `drop policy if exists` for each, so a fifth
policy added later without a drop also fails.

---

## ALSO FIX — four cheap minors

1. **Duplicated `"session:"`** — `SESSION_PREFIX` is now exported from
   `src/lib/reminderPlan.ts:16-22` and imported by `src/lib/reminders.ts:5`,
   used at `src/lib/reminders.ts:126`. Verified by a new test in
   `tests/reminderPlan.test.ts:93-101` (it also fails to compile without the
   export).
2. **Sign-out did not cancel local reminders** —
   `app/(app)/profile/index.tsx:479` now runs
   `Promise.all([unregisterPushToken(), cancelReminders()])` before
   `signOut()`. Both are internally best-effort and never reject, and `.finally`
   still runs regardless, so sign-out cannot be blocked.
3. **Dead re-exports** — `pushTokenRow` / `PushTokenRow` re-exports removed from
   `src/lib/push.ts` (were lines 8-9). `tests/pushToken.test.ts` imports from
   `src/lib/pushToken` directly and still passes.
4. **Double `configureNotificationHandling()`** — removed the call inside
   `registerPushToken()`. The `app/_layout.tsx:150` call is kept, since the
   handler and Android channel must exist whether or not the toggle is on.

---

## Not fixed / not tested, and why

- **No mocks were added.** `app/_layout.tsx` (MUST-FIX 1) and `src/lib/push.ts`
  (MUST-FIX 2 client half, MUST-FIX 3) both import `react-native` and
  `expo-notifications`. This repo's suite is pure-logic only, with no
  `@testing-library/react-native` and no `react-test-renderer`, and adding a
  `moduleNameMapper` entry would silently stub those modules for every suite.
  So: no `jest.config.js` change, no `tests/__mocks__/` additions. These three
  behaviours are covered by type-checking plus the device-verification checklist
  (ledger Task 8), not by unit tests. The parts that *are* reachable from pure
  modules — the SQL contract and the reminder-identifier namespace — are tested.
- **No outbox, cron, or edge function** was added; the 60-day aging filter is
  unchanged.
- **`supabase/migrations/0036_missing_fk_indexes.sql`** is untracked work
  belonging to another session and was left alone, as were `CLAUDE.md`,
  `app/(auth)/sign-in.tsx`, `src/stores/session.tsx`, `src/lib/authCallback.ts`,
  `REACT_NATIVE_ANIMATION_GUIDE.md`, `web/.vercel/` and `npx/`.
- **Settled rulings preserved:** `registerPushToken()` remains gated on
  `REMINDERS_KEY === "1"`; the session reminder body remains `Starts at {time}.`
- **Theme untouched** — no colour, font or style edits.

---

# Addendum — regression introduced by the fix wave

Raised by the re-review, mitigation chosen by the human. One change, on top of
the wave above. Nothing from the wave was reverted.

## The regression

`register_push_token` (added in MUST-FIX 2) is `security definer` and did
`on conflict (token) do update set profile_id = excluded.profile_id`
unconditionally. It never checked who owned the pre-existing row.

My report claimed it "cannot be abused: it only ever writes a row owned by the
caller". That was wrong in the way that matters: the row it *writes* is owned by
the caller, but the row it *overwrites* need not be. Any non-anonymous
authenticated caller who knows a victim's Expo push token string could call
`register_push_token(<victim token>, 'ios')` and take the row. The victim's
device goes silent and the attacker's account starts receiving what was destined
for it. The plain RLS update policy this path replaced did block this — its
`using (auth.uid() = profile_id)` was evaluated against the existing row — but
it also blocked the legitimate account switch, which is the whole reason the RPC
exists.

Requires an out-of-band token leak (Sentry breadcrumb, log line, support paste);
the app never surfaces another user's token to a client. Real nonetheless.

## The ruling: reassignment becomes deletion

`supabase/migrations/0035_push_notifications.sql:98-126`. Before the upsert:

```sql
delete from push_tokens
 where token = p_token
   and profile_id <> v_profile_id;
```

and the `on conflict (token) do update` branch no longer writes `profile_id` at
all — only `platform` and `updated_at`.

- **Account switch still works.** The foreign row is dropped, then the new
  owner's row is inserted. This is the case the RPC exists for and it is not
  regressed.
- **Same-user re-registration is unchanged and cheap.** The delete matches
  nothing, and the insert falls through to `do update` refreshing `updated_at` —
  the heartbeat `push_to()`'s 60-day staleness filter reads. No
  delete-and-reinsert on the common path.
- **Trade-off recorded in the function body** (`:98-113`): someone who knows a
  token can still drop that row and silence the device until its next launch,
  but can never take ownership of it, so notifications are never intercepted.
  Losing notifications is recoverable; receiving someone else's is not.
- Everything else is byte-for-byte as before: owner from `auth.uid()` only, no
  `profile_id` parameter, anonymous rejected, empty token rejected, platform
  restricted to `('ios','android')`, `set search_path = public`, still
  executable by `authenticated`, no revoke. `push_to`'s revoke untouched.
- Also corrected the now-false trailing comment at `:129-131` that carried the
  same wrong claim as the report.

No client change was needed — `src/lib/push.ts` calls the same RPC with the same
arguments.

## Spec

`docs/superpowers/specs/2026-08-08-notifications-design.md:111-130`. The line
"RLS restricts every operation to `profile_id = auth.uid()`" was true for
select/update/delete but not for the register path. Narrowed it to those three
operations and added two paragraphs describing the security-definer RPC, why the
client upsert could not work, the delete-not-reassign rule, and the accepted
trade-off. No restructuring; the surrounding sections are untouched.

## Test and mutation validation

New test `register_push_token deletes a foreign row instead of reassigning it`
in `tests/notifications.schema.test.ts`, using the same `functionBlock()`
extraction as the rest of the file. Three sub-assertions: the guarded delete is
present; the `do update` clause (sliced from `on conflict` to the statement's
`;`) contains no `profile_id`; the delete precedes the upsert. The second is the
one that makes the test non-worthless — an assertion on the delete alone would
still pass if the `do update` also reassigned.

Validated in a scratch buffer by mutating the migration in memory back to the
unconditional form (delete stripped, `set profile_id = excluded.profile_id`
restored). The migration was not edited to test this.

| sub-assertion | as shipped | mutated back to unconditional `do update set profile_id` |
|---|---|---|
| foreign row is deleted | pass | **fail** |
| upsert never writes `profile_id` | pass | **fail** |
| delete precedes the upsert | pass | pass (vacuous — no delete to order) |
| **test result** | **pass** | **fail** |

## Verification

`npx tsc --noEmit` clean. `npx jest` 46 suites / 288 tests passing (287 before
this change, +1).
