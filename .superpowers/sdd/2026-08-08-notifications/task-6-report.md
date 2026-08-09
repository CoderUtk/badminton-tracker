# Task 6 Report: Wire push into toggle, launch, sign-out

Branch: `feat/notifications`
Commit: `f4b8824`

## Pre-flight

`git status --short app/_layout.tsx` was clean before editing, so it was safe to touch (no concurrent session owned it).

## Edit 1 — toggle gate implemented inside `registerPushToken()` (overrule)

File: `src/lib/push.ts`

- Added import: `import { getSetting, REMINDERS_KEY } from "../repos/settingsRepo";`
- Added an early return at the top of `registerPushToken()`'s try block, before the `supabase.auth.getUser()` call:

```ts
// The presence of a token row IS the setting: registering here would
// silently re-enable push for a user who explicitly turned it off.
if ((await getSetting(REMINDERS_KEY)) !== "1") return false;
```

This is exactly the gate specified in the overrule, placed inside `registerPushToken()` itself (not at call sites), so every present and future caller — the toggle, launch, and any future caller — is safe by construction. Confirmed present and correctly ordered (before the permission/user checks, inside the `try`, so any `getDb()`/`getSetting()` failure is caught by the existing `catch { return false }` and degrades to "not registered" rather than throwing).

I did **not** implement the brief's original Step 1/Step 3 wording literally (call `registerPushToken()` unconditionally and rely on callers) — the brief's own justification ("a user who has push disabled has no token row, so there is nothing for the server to send to") is false once you notice `registerPushToken()` is the thing that creates the row. The human's ruling to gate inside the function is what's implemented.

## Edit 2 — `toggleReminders` in `app/(app)/profile/index.tsx`

Added import:
```ts
import { registerPushToken, unregisterPushToken } from "../../../src/lib/push";
```

Changed the enable/disable branches:
```ts
        await syncSessionReminders();
        void registerPushToken();
      } else {
        await cancelReminders();
        void unregisterPushToken();
      }
```

Both calls are `void`, not awaited, per the brief — a slow network can't leave the switch stuck in `remindersBusy`. The existing early `return` after the permission-failure toast (when `scheduleInactivityReminder()` fails) was left untouched — it still returns before reaching `registerPushToken()`, so a failed local-notification permission never triggers a push registration attempt. That's correct: `setSetting(REMINDERS_KEY, "0")` already ran on that path, so `registerPushToken()`'s new internal gate would refuse anyway, but not calling it at all avoids a pointless async fire-and-forget.

Ordering note from the brief: `setSetting(REMINDERS_KEY, "1")` runs earlier in the function (before this branch), so by the time `registerPushToken()` reads the setting via its new gate, it sees `"1"`. Verified — no reordering was needed or done.

## Edit 3 — sign-out button in `app/(app)/profile/index.tsx`

```tsx
<Pressable
  style={s.signOut}
  onPress={() => {
    void unregisterPushToken().finally(() => {
      void supabase?.auth.signOut();
    });
  }}
>
```

Matches the brief exactly. `unregisterPushToken()` completes (success or failure — `.finally`) before `signOut()` fires, so the RLS delete (`auth.uid() = profile_id`) still has a live session's JWT when it runs.

## Edit 4 — launch registration in `app/_layout.tsx`

Added import:
```ts
import { configureNotificationHandling, registerPushToken } from "../src/lib/push";
```

Extended the existing mount effect (was the `scheduleInactivityReminder` / `AppState` effect around line 137) rather than adding a new effect:

```ts
useEffect(() => {
  void configureNotificationHandling();
  void scheduleInactivityReminder();
  void registerPushToken();
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void scheduleInactivityReminder();
      void registerPushToken();
    }
  });
  return () => sub.remove();
}, []);
```

### Reasoning: same effect vs. new effect

Reused the existing effect rather than adding a separate one. `configureNotificationHandling()` and `registerPushToken()} have the same lifecycle need as `scheduleInactivityReminder()` — "run once on mount, and again whenever the app resumes from background" — so folding them in avoids two extra `AppState` subscriptions doing the same job. `configureNotificationHandling()` is safe to call every time (it just re-sets the handler and re-asserts the Android channel; both are idempotent, no side effects beyond that), so calling it unconditionally on every mount/resume is harmless and guarantees the handler/channel always exist before any notification arrives, regardless of the toggle, exactly as the task specified.

### Reasoning: should `registerPushToken()` re-run on resume?

Yes, and this is a deliberate addition beyond the brief's literal Step 3 (which only mentioned "the existing effect that runs once on mount," without addressing resume). The doc comment already on `registerPushToken()` in `src/lib/push.ts` states:

> Registers this device for push. Runs on every launch when signed in and the toggle is on — that repeated upsert is the heartbeat push_to()'s 60-day staleness window depends on. If it stops running, live devices age out and silently stop receiving anything.

That comment describes an upsert-as-heartbeat design: the server-side 60-day staleness window depends on this function running repeatedly, not just once at cold start. A resident app that's foregrounded from background after days/weeks without a cold start would otherwise never refresh its heartbeat if registration were mount-only. Since `scheduleInactivityReminder()` already treats `AppState -> "active"` as equivalent to an "app open," and `registerPushToken()` self-guards on toggle/sign-in/permission (so calling it extra times is free — it's an idempotent upsert), I added it to the same `AppState` listener. This is the "on resume" call the brief left as a judgment call.

## Verification

```
npx tsc --noEmit
```
Clean, no output/errors.

```
npx jest
```
```
Test Suites: 45 passed, 45 total
Tests:       276 passed, 276 total
Snapshots:   0 total
Time:        47.908 s, estimated 61 s
Ran all test suites.
```
Matches the pre-change baseline (45 suites / 276 tests). One pre-existing, unrelated Jest warning: "A worker process has failed to exit gracefully... Active timers can also cause this" — this is Jest's standard open-handle warning, not a failure, and not something introduced by this change (no new timers were added; `AppState` listeners are cleaned up via the effect's `sub.remove()` return).

No new tests were added, per the global constraint: all three touched files are React components or import `expo-notifications` transitively, and this repo's Jest config cannot load them (no component test infra, and `moduleNameMapper` is off-limits repo-wide per a prior reverted attempt). Flagging as before: if this task's correctness needs automated coverage, it needs either a lightweight extraction of the gating logic into a pure/testable helper, or component-test infrastructure — neither of which this task's constraints permit me to build.

## Self-review findings

- Confirmed the toggle gate lives inside `registerPushToken()` in `src/lib/push.ts`, not at call sites (grep: only one `getSetting(REMINDERS_KEY)` gate exists, inside the function body).
- Confirmed `toggleReminders`'s existing early-return path (permission failure) is unchanged — diffed the function, only the two `void register/unregisterPushToken()` lines were added, no reordering.
- Confirmed sign-out ordering: `unregisterPushToken()` is awaited via `.finally()` before `signOut()` — not a bare `void unregisterPushToken(); void supabase?.auth.signOut();` (which would race).
- Confirmed `app/_layout.tsx`'s effect array dependency (`[]`) is unchanged — still mount-only setup, with the `AppState` subscription handling resume, consistent with the pre-existing pattern for `scheduleInactivityReminder`.
- Did not touch `CLAUDE.md`, `app/(auth)/sign-in.tsx`, `src/stores/session.tsx`, `src/lib/authCallback.ts`, `REACT_NATIVE_ANIMATION_GUIDE.md`, `web/.vercel/`, or `npx/` — verified via the commit's file list (`3 files changed`: the two profile/layout files plus `src/lib/push.ts`).
- No theme/style edits — only added `void` calls and one import per file; no JSX styling touched beyond wrapping the `Pressable`'s existing `onPress` in a new arrow function body (same `style={s.signOut}` prop, unchanged).
- Committed with an explicit pathspec (`"app/(app)/profile/index.tsx" app/_layout.tsx src/lib/push.ts`), never `git add -A`/`.`/`-a`, no `Co-Authored-By` trailer.
