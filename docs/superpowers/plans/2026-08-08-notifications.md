# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver two push notifications (friend request received, club join request received) and two local reminders (session starting in an hour, 7-day inactivity nudge), behind a single master toggle.

**Architecture:** Push is a Postgres trigger calling `pg_net` directly against the Expo push API — no outbox, no cron, no edge function. Dead tokens are aged out by a 60-day staleness filter rather than pruned, which is what removes the need for any background job. Local reminders move from the current cancel-everything model to stable per-notification identifiers so the two reminder types can coexist.

**Tech Stack:** Expo SDK 57 (`expo-notifications` ~0.32.17), expo-router, TypeScript, Supabase Postgres, jest + ts-jest.

Spec: `docs/superpowers/specs/2026-08-08-notifications-design.md`

## Global Constraints

- **Expo SDK 57.** Read `https://docs.expo.dev/versions/v57.0.0/sdk/notifications/` before writing any `expo-notifications` code. The trigger API changed in recent SDKs — triggers are discriminated objects using `Notifications.SchedulableTriggerInputTypes`, not the older shorthand.
- **Theme is unchanged.** Use only tokens from `src/theme.ts` (`C`, `F`, `GRAD`, `glow`, `press`). No new colours, no new fonts.
- **Tests are pure-logic only.** This repo has no `@testing-library/react-native` and no `react-test-renderer`. Never write a test that renders a component or calls an `expo-notifications` function. All testable logic goes in dependency-free modules.
- **Copy strings are verbatim from the spec.** Do not reword them, do not add emoji, do not add exclamation marks.
- **Never `git add -A`, `git add .`, or `git commit -a`.** This is a shared checkout. Always commit with an explicit pathspec listing exactly the files the task touched.
- **Never add a `Co-Authored-By` trailer.**
- **Do not touch these files.** They carry uncommitted work from a concurrent session: `CLAUDE.md`, `app/(auth)/sign-in.tsx`, `src/stores/session.tsx`, `src/lib/authCallback.ts`, `REACT_NATIVE_ANIMATION_GUIDE.md`, `web/.vercel/`, `npx/`, and the two deleted files `assets/android-icon-foreground.png` and `assets/splash-icon.png`. If a task appears to need one of them, stop and report rather than editing.
- **`supabase` may be null.** `src/lib/supabase.ts` exports `null` when env vars are absent (web, tests). Always use `supabase?.` and handle the null path.
- **Notifications must never break the app.** Every exported function in `src/lib/push.ts` and `src/lib/reminders.ts` catches its own errors and returns a falsy result. A failed notification is invisible; a crash is not.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/reminderPlan.ts` (new) | Pure scheduling arithmetic: given sessions + now + already-scheduled ids, decide what to schedule and cancel. No imports from `expo-notifications`. |
| `src/lib/reminders.ts` (rewrite) | Thin Expo wrapper around `reminderPlan`. Owns the `inactivity` and `session:*` identifiers. |
| `src/lib/notificationRoute.ts` (new) | Pure mapping from a notification's `data` payload to an expo-router path. |
| `src/lib/push.ts` (new) | Expo push token lifecycle: register, unregister, Android channel, foreground handler. |
| `supabase/migrations/0035_push_notifications.sql` (new) | `push_tokens` table + RLS, `push_to()` helper, two triggers. |
| `app/(app)/profile/index.tsx` (modify) | Relabel the toggle to "Notifications"; extend it to cover push registration and session reminders; unregister on sign-out. |
| `app/_layout.tsx` (modify) | Notification response listeners + cold-start handling. |
| `tests/reminderPlan.test.ts`, `tests/notificationRoute.test.ts`, `tests/pushToken.test.ts`, `tests/notifications.schema.test.ts` (new) | Coverage for the four pure surfaces. |

**Task order is deliberate.** Tasks 1–3 are local reminders and have no external prerequisites. Tasks 4–7 are push and are blocked on Firebase/FCM credentials for real Android delivery. Building local first means something ships even if the credentials work stalls.

---

### Task 1: Pure reminder planner

**Files:**
- Create: `src/lib/reminderPlan.ts`
- Test: `tests/reminderPlan.test.ts`

**Interfaces:**
- Consumes: `ClubSession` from `src/repos/sessionRepo.ts` (fields used: `id`, `club_id`, `starts_at` (epoch ms), `status`).
- Produces: `SESSION_LEAD_MS`, `MAX_SESSION_REMINDERS`, `INACTIVITY_ID`, `sessionReminderId(sessionId: string): string`, `PlannedReminder { id: string; sessionId: string; fireAt: number }`, `ReminderPlan { toSchedule: PlannedReminder[]; toCancel: string[] }`, `planSessionReminders(sessions: ClubSession[], now: number, existingIds: string[], max?: number): ReminderPlan`.

- [ ] **Step 1: Write the failing test**

Create `tests/reminderPlan.test.ts`:

```ts
import type { ClubSession } from "../src/repos/sessionRepo";
import {
  INACTIVITY_ID,
  MAX_SESSION_REMINDERS,
  SESSION_LEAD_MS,
  planSessionReminders,
  sessionReminderId,
} from "../src/lib/reminderPlan";

const NOW = 1_760_000_000_000;
const HOUR = 60 * 60 * 1000;

function session(over: Partial<ClubSession> & { id: string }): ClubSession {
  return {
    club_id: "club-1",
    starts_at: NOW + 5 * HOUR,
    ends_at: null,
    location: null,
    courts: 2,
    status: "scheduled",
    created_at: NOW,
    created_by: "me",
    ...over,
  };
}

test("schedules an upcoming session one hour before it starts", () => {
  const s = session({ id: "a", starts_at: NOW + 5 * HOUR });
  const plan = planSessionReminders([s], NOW, []);
  expect(plan.toSchedule).toEqual([
    { id: "session:a", sessionId: "a", fireAt: NOW + 5 * HOUR - SESSION_LEAD_MS },
  ]);
  expect(plan.toCancel).toEqual([]);
});

test("skips a session whose lead time has already passed", () => {
  // Starts in 30 minutes: the -1h reminder would fire in the past.
  const s = session({ id: "a", starts_at: NOW + HOUR / 2 });
  expect(planSessionReminders([s], NOW, []).toSchedule).toEqual([]);
});

test("skips cancelled, done and live sessions", () => {
  const sessions = [
    session({ id: "a", status: "cancelled" }),
    session({ id: "b", status: "done" }),
    session({ id: "c", status: "live" }),
  ];
  expect(planSessionReminders(sessions, NOW, []).toSchedule).toEqual([]);
});

test("does not reschedule a session that is already scheduled", () => {
  const s = session({ id: "a" });
  const plan = planSessionReminders([s], NOW, [sessionReminderId("a")]);
  expect(plan.toSchedule).toEqual([]);
  expect(plan.toCancel).toEqual([]);
});

test("cancels a scheduled reminder whose session is no longer eligible", () => {
  const plan = planSessionReminders([], NOW, ["session:gone"]);
  expect(plan.toCancel).toEqual(["session:gone"]);
});

test("never cancels the inactivity reminder", () => {
  // The whole reason this module exists: the old implementation called
  // cancelAllScheduledNotificationsAsync and wiped unrelated reminders.
  const plan = planSessionReminders([], NOW, [INACTIVITY_ID, "session:gone"]);
  expect(plan.toCancel).toEqual(["session:gone"]);
});

test("caps at the soonest sessions when over the limit", () => {
  const sessions = Array.from({ length: MAX_SESSION_REMINDERS + 3 }, (_, i) =>
    session({ id: `s${i}`, starts_at: NOW + (i + 2) * HOUR }),
  );
  const plan = planSessionReminders(sessions, NOW, []);
  expect(plan.toSchedule).toHaveLength(MAX_SESSION_REMINDERS);
  expect(plan.toSchedule[0].sessionId).toBe("s0");
  expect(plan.toSchedule.map((p) => p.sessionId)).not.toContain(
    `s${MAX_SESSION_REMINDERS + 2}`,
  );
});

test("sessions arrive newest-first from the cache and are still ordered soonest-first", () => {
  // listSessions() returns `order by starts_at desc`, so the soonest is LAST.
  const sessions = [
    session({ id: "later", starts_at: NOW + 9 * HOUR }),
    session({ id: "sooner", starts_at: NOW + 3 * HOUR }),
  ];
  const plan = planSessionReminders(sessions, NOW, [], 1);
  expect(plan.toSchedule.map((p) => p.sessionId)).toEqual(["sooner"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/reminderPlan.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/reminderPlan'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/reminderPlan.ts`:

```ts
import type { ClubSession } from "../repos/sessionRepo";

/** How far ahead of a session its reminder fires. */
export const SESSION_LEAD_MS = 60 * 60 * 1000;

/**
 * iOS silently drops scheduled notifications past 64 pending. A member of
 * several active clubs would reach that, so only the soonest sessions get
 * a reminder.
 */
export const MAX_SESSION_REMINDERS = 10;

/** Identifier for the 7-day inactivity nudge. Never a session reminder. */
export const INACTIVITY_ID = "inactivity";

const SESSION_PREFIX = "session:";

export const sessionReminderId = (sessionId: string) => `${SESSION_PREFIX}${sessionId}`;

export interface PlannedReminder {
  id: string;
  sessionId: string;
  fireAt: number;
}

export interface ReminderPlan {
  toSchedule: PlannedReminder[];
  toCancel: string[];
}

/**
 * Decides which session reminders to add and which to drop.
 *
 * Only ever cancels identifiers in the `session:` namespace — the inactivity
 * nudge and anything else scheduled by other code is left alone. The previous
 * implementation used cancelAllScheduledNotificationsAsync(), which is exactly
 * the bug this namespacing exists to prevent.
 */
export function planSessionReminders(
  sessions: ClubSession[],
  now: number,
  existingIds: string[],
  max: number = MAX_SESSION_REMINDERS,
): ReminderPlan {
  const eligible = sessions
    .filter((s) => s.status === "scheduled" && s.starts_at - SESSION_LEAD_MS > now)
    // listSessions() returns starts_at DESC, so the soonest is last. Sort.
    .sort((a, b) => a.starts_at - b.starts_at)
    .slice(0, max);

  const wanted = new Map(
    eligible.map((s) => [
      sessionReminderId(s.id),
      { id: sessionReminderId(s.id), sessionId: s.id, fireAt: s.starts_at - SESSION_LEAD_MS },
    ]),
  );

  const existing = new Set(existingIds);

  const toSchedule = [...wanted.values()].filter((p) => !existing.has(p.id));
  const toCancel = existingIds.filter(
    (id) => id.startsWith(SESSION_PREFIX) && !wanted.has(id),
  );

  return { toSchedule, toCancel };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/reminderPlan.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/reminderPlan.ts tests/reminderPlan.test.ts
git commit -m "feat(notifications): pure session reminder planner"
```

---

### Task 2: Rewrite the local reminder scheduler

**Files:**
- Modify: `src/lib/reminders.ts` (full rewrite — 61 lines today)
- Test: none new (Task 1 covers the logic; this file is a thin Expo wrapper that jest cannot reach)

**Interfaces:**
- Consumes: `planSessionReminders`, `INACTIVITY_ID`, `sessionReminderId` from Task 1. `getSetting`, `REMINDERS_KEY` from `src/repos/settingsRepo.ts`. `listSessions` from `src/repos/sessionRepo.ts`.
- Produces: `scheduleInactivityReminder(): Promise<boolean>` (unchanged signature — `app/(app)/profile/index.tsx` already calls it), `syncSessionReminders(): Promise<void>`, `cancelReminders(): Promise<void>` (unchanged signature).

**Why a rewrite:** the current file calls `Notifications.cancelAllScheduledNotificationsAsync()` on every reschedule. Adding session reminders alongside it means each inactivity reschedule silently wipes them. Identifier-scoped cancellation replaces it.

- [ ] **Step 1: Replace the file contents**

Rewrite `src/lib/reminders.ts` in full:

```ts
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { getSetting, REMINDERS_KEY } from "../repos/settingsRepo";
import { listSessions } from "../repos/sessionRepo";
import { INACTIVITY_ID, planSessionReminders } from "./reminderPlan";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/**
 * Local notifications are scheduled with stable identifiers so the two kinds
 * can coexist: `inactivity` for the nudge, `session:<id>` per session. Nothing
 * here may call cancelAllScheduledNotificationsAsync() — it would wipe the
 * other kind.
 */

async function remindersEnabled(): Promise<boolean> {
  return (await getSetting(REMINDERS_KEY)) === "1";
}

async function ensurePermission(): Promise<boolean> {
  let status = (await Notifications.getPermissionsAsync()).status;
  if (status !== "granted") {
    // Only prompt when the user hasn't already decided — re-asking after a
    // denial is a no-op on most platforms anyway, but avoid it either way.
    if (status === "undetermined") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
  }
  return status === "granted";
}

async function scheduledIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.map((n) => n.identifier);
}

/**
 * Local-only inactivity nudge, scheduled ~7 days out and rescheduled from now
 * on each app open. Returns false (without throwing) when disabled, denied,
 * or on web.
 */
export async function scheduleInactivityReminder(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    if (!(await remindersEnabled())) return false;
    if (!(await ensurePermission())) return false;

    // Cancel only our own identifier so session reminders survive.
    await Notifications.cancelScheduledNotificationAsync(INACTIVITY_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: INACTIVITY_ID,
      content: {
        title: "Miss the court?",
        body: "It's been a week. Start a match.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: SEVEN_DAYS_SECONDS,
      },
    });
    return true;
  } catch {
    // Never let a notification-scheduling failure crash the app.
    return false;
  }
}

/**
 * Brings scheduled session reminders in line with the local session cache.
 * Safe to call repeatedly — planSessionReminders diffs against what is
 * already pending, so this does no work when nothing has changed.
 */
export async function syncSessionReminders(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    if (!(await remindersEnabled())) return;
    if (!(await ensurePermission())) return;

    const sessions = await listSessions();
    const plan = planSessionReminders(sessions, Date.now(), await scheduledIds());

    for (const id of plan.toCancel) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
    for (const p of plan.toSchedule) {
      const s = sessions.find((x) => x.id === p.sessionId);
      if (!s) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: p.id,
        content: {
          title: "Session in an hour",
          body: sessionReminderBody(s.starts_at),
          data: { type: "session", sessionId: s.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(p.fireAt),
        },
      });
    }
  } catch {
    // Best-effort. A failed sync just means a missing reminder.
  }
}

/**
 * Matches the existing time formatting in app/(app)/sessions/index.tsx:
 * device locale, no hard-coded English.
 */
function sessionReminderBody(startsAt: number): string {
  const time = new Date(startsAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Starts at ${time}.`;
}

/** Cancels everything this module owns. Leaves other schedulers alone. */
export async function cancelReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const ids = await scheduledIds();
    for (const id of ids) {
      if (id === INACTIVITY_ID || id.startsWith("session:")) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
  } catch {
    // Best-effort cancel; nothing to recover from here.
  }
}
```

`sessionReminderId` is deliberately not imported here: identifiers come back on the plan objects, so this file never constructs one itself.

- [ ] **Step 2: Verify nothing else referenced the removed behaviour**

Run: `npx tsc --noEmit`
Expected: clean. `app/(app)/profile/index.tsx` imports `scheduleInactivityReminder` and `cancelReminders`; both keep their names and signatures.

- [ ] **Step 3: Run the full suite**

Run: `npx jest`
Expected: PASS. No existing test imports `src/lib/reminders.ts` (it touches `expo-notifications`, which jest cannot load here) — confirm with `grep -rn "lib/reminders" tests/` returning nothing before assuming it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/reminders.ts
git commit -m "feat(notifications): identifier-scoped local reminders"
```

**Spec deviation to note in your report:** the spec's copy table gives the session body as `{club} at {time}`. The club name is not on `ClubSession` (it has `club_id` only) and resolving it would mean a second repo call inside the scheduler. This uses `Starts at {time}.` with the club omitted, and the title already says "Session in an hour". Flag this for the human — if the club name is wanted, it needs a `listRealClubs()` lookup added here.

---

### Task 3: Wire local reminders into the profile toggle

**Files:**
- Modify: `app/(app)/profile/index.tsx` (the `toggleReminders` function, currently at lines 67–86, and the toggle's label)

**Interfaces:**
- Consumes: `scheduleInactivityReminder`, `syncSessionReminders`, `cancelReminders` from Task 2.
- Produces: nothing consumed by later tasks. Task 6 extends this same function for push.

- [ ] **Step 1: Extend the toggle handler**

Replace the body of `toggleReminders` in `app/(app)/profile/index.tsx`. The current version calls only `scheduleInactivityReminder()`; add the session sync on the enable path:

```tsx
  const toggleReminders = async () => {
    if (remindersBusy) return;
    const next = !remindersOn;
    setRemindersBusy(true);
    setRemindersOn(next);
    try {
      await setSetting(REMINDERS_KEY, next ? "1" : "0");
      if (next) {
        const scheduled = await scheduleInactivityReminder();
        if (!scheduled) {
          setRemindersOn(false);
          await setSetting(REMINDERS_KEY, "0");
          toast("Enable notifications in Settings to get reminders", "error");
          return;
        }
        await syncSessionReminders();
      } else {
        await cancelReminders();
      }
    } finally {
      setRemindersBusy(false);
    }
  };
```

The `return` after the failure toast is new and load-bearing: without it, `syncSessionReminders()` runs after the user has been told reminders are off.

Add `syncSessionReminders` to the existing import from `../../../src/lib/reminders`.

- [ ] **Step 2: Relabel the toggle**

Locate the label with `grep -n "remindersOn" "app/(app)/profile/index.tsx"` and read the surrounding JSX row. Change only the label string to `Notifications` — no style, no layout, no structural change. If the row has a secondary/description line, leave it as-is unless it names only reminders, in which case it becomes `Match reminders and requests`.

- [ ] **Step 3: Keep session reminders fresh after a sync**

Sessions arrive from the server after the toggle was flipped, so the schedule needs re-running when the cache changes. In `app/(app)/sessions/index.tsx`, find the function that calls `refreshSessions()` (it is the screen's load/reload path) and call `void syncSessionReminders()` after the subsequent cache read resolves — the plan must diff against a populated `sessions_cache`, so calling it before the refresh lands schedules nothing. Add the import from `../../../src/lib/reminders`.

Do not `await` it — reminder scheduling must never delay a screen's render path.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile/index.tsx" "app/(app)/sessions/index.tsx"
git commit -m "feat(notifications): schedule session reminders from the toggle"
```

---

### Task 4: Push notifications migration

**Files:**
- Create: `supabase/migrations/0035_push_notifications.sql`
- Test: `tests/notifications.schema.test.ts`

**Interfaces:**
- Consumes: existing tables `profiles`, `friendships` (`requester_id`, `addressee_id`, `status`), `club_join_requests` (`club_id`, `profile_id`, `status`), `club_members` (`club_id`, `profile_id`, `role`), `clubs` (`id`, `name`).
- Produces: table `public.push_tokens (token text pk, profile_id uuid, platform text, updated_at timestamptz)` — Task 5 writes to it.

**Do not apply this migration to production.** Write the file, test it, commit it. Applying it is a human step recorded in Task 8.

- [ ] **Step 1: Write the failing test**

The repo has no local Postgres, so the guard is over the migration text — the same approach as `tests/settings.schema.test.ts`. It exists to catch silent removal of the two security-critical clauses.

Create `tests/notifications.schema.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0035_push_notifications.sql"),
  "utf8",
);

test("push_tokens is keyed by token, not a surrogate id", () => {
  // A surrogate key would leave a stale row behind when a device changes
  // accounts, and the previous user's pushes would keep arriving.
  expect(sql).toMatch(/token\s+text\s+primary key/i);
});

test("sends are filtered to recently seen tokens", () => {
  // This filter is the entire token-lifecycle strategy. Without it the
  // design needs a cleanup job.
  expect(sql).toMatch(/updated_at\s*>\s*now\(\)\s*-\s*interval\s*'60 days'/i);
});

test("push_to is not executable by clients", () => {
  // push_to is SECURITY DEFINER and reads every user's tokens. Without the
  // revoke, any authenticated client can push arbitrary text to anyone.
  expect(sql).toMatch(/revoke execute on function public\.push_to/i);
  expect(sql).toMatch(/from public, anon, authenticated/i);
});

test("both triggers swallow their own errors", () => {
  // A raising trigger rolls back the insert that fired it: a broken
  // notification would block friend requests entirely.
  const handlers = sql.match(/exception when others then return new;/gi) ?? [];
  expect(handlers.length).toBe(2);
});

test("the join request trigger excludes the requester", () => {
  expect(sql).toMatch(/profile_id\s*<>\s*new\.profile_id/i);
});

test("row level security is enabled on push_tokens", () => {
  expect(sql).toMatch(/alter table public\.push_tokens enable row level security/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/notifications.schema.test.ts`
Expected: FAIL — `ENOENT: no such file or directory` for the migration.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0035_push_notifications.sql`:

```sql
-- 0035_push_notifications.sql
-- Push for the two events where another person is waiting on the user:
-- a friend request, and a club join request.
--
-- Delivery is a trigger calling the Expo push API directly through pg_net.
-- There is deliberately no outbox, no cron and no edge function: this is not
-- a critical feature and the design optimises for zero standing infrastructure.
-- The cost is that nothing polls Expo's receipts endpoint, so dead tokens are
-- never reported back. They are aged out instead — see the 60-day filter in
-- push_to() — which is what removes the need for any cleanup job.

create extension if not exists pg_net;

create table if not exists public.push_tokens (
  token       text primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);

-- token is the primary key, not a surrogate id: when a device switches
-- accounts the upsert overwrites profile_id in place. With a surrogate key the
-- old row would survive and the previous user's friend requests would keep
-- arriving on a phone they no longer own.

create index if not exists push_tokens_profile
  on public.push_tokens (profile_id, updated_at desc);

alter table public.push_tokens enable row level security;

create policy "a user reads their own tokens"
  on public.push_tokens for select to authenticated
  using (auth.uid() = profile_id);

create policy "a user registers their own token"
  on public.push_tokens for insert to authenticated
  with check (
    auth.uid() = profile_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

create policy "a user refreshes their own token"
  on public.push_tokens for update to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "a user removes their own token"
  on public.push_tokens for delete to authenticated
  using (auth.uid() = profile_id);

-- ---- send helper ----

create or replace function public.push_to(
  p_profile_ids uuid[],
  p_title       text,
  p_body        text,
  p_data        jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', p_title,
           'body', p_body,
           'data', p_data,
           'sound', 'default',
           'channelId', 'default'))
    into v_messages
    from push_tokens t
   where t.profile_id = any (p_profile_ids)
     and t.updated_at > now() - interval '60 days';

  if v_messages is null then return; end if;

  -- Fire-and-forget: pg_net queues the request and returns immediately, so the
  -- calling transaction never blocks on network latency.
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := v_messages);
end $$;

-- SECURITY DEFINER and it reads every user's tokens. Only triggers may call it.
revoke execute on function public.push_to(uuid[], text, text, jsonb)
  from public, anon, authenticated;

-- ---- friend request ----

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  if new.status <> 'pending' then return new; end if;

  select coalesce(display_name, username, 'Someone')
    into v_name
    from profiles
   where id = new.requester_id;

  perform push_to(
    array[new.addressee_id],
    'Friend request',
    v_name || ' wants to be friends.',
    jsonb_build_object('type', 'friend_request'));

  return new;
exception when others then return new;
end $$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert on public.friendships
  for each row execute function public.notify_friend_request();

-- ---- club join request ----

create or replace function public.notify_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_club   text;
  v_admins uuid[];
begin
  if new.status <> 'pending' then return new; end if;

  select coalesce(display_name, username, 'Someone')
    into v_name
    from profiles
   where id = new.profile_id;

  select name into v_club from clubs where id = new.club_id;

  -- is_club_admin() cannot be reused here: it is auth.uid()-based and answers
  -- "am I an admin", not "who are the admins".
  select array_agg(profile_id)
    into v_admins
    from club_members
   where club_id = new.club_id
     and role in ('owner', 'admin')
     and profile_id <> new.profile_id;

  if v_admins is null then return new; end if;

  perform push_to(
    v_admins,
    'Join request',
    v_name || ' wants to join ' || coalesce(v_club, 'your club') || '.',
    jsonb_build_object('type', 'join_request', 'clubId', new.club_id));

  return new;
exception when others then return new;
end $$;

-- request_club_join() only inserts on the pending path (an existing pending row
-- short-circuits, a denied row raises), so after-insert covers every case and
-- no update trigger is needed.
drop trigger if exists club_join_requests_notify on public.club_join_requests;
create trigger club_join_requests_notify
  after insert on public.club_join_requests
  for each row execute function public.notify_join_request();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/notifications.schema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0035_push_notifications.sql tests/notifications.schema.test.ts
git commit -m "feat(notifications): push_tokens table and friend/join request triggers"
```

---

### Task 5: Push token lifecycle

**Files:**
- Create: `src/lib/push.ts`
- Test: `tests/pushToken.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (may be null). `push_tokens` from Task 4.
- Produces: `pushTokenRow(profileId: string, token: string, platform: string): PushTokenRow | null`, `PushTokenRow { token: string; profile_id: string; platform: "ios" | "android"; updated_at: string }`, `registerPushToken(): Promise<boolean>`, `unregisterPushToken(): Promise<void>`, `configureNotificationHandling(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Only the row builder is reachable from jest — the rest calls `expo-notifications`. The builder is still worth testing: it is the one place a value can violate the `platform` check constraint.

Create `tests/pushToken.test.ts`:

```ts
import { pushTokenRow } from "../src/lib/push";

test("builds a row for a supported platform", () => {
  const row = pushTokenRow("profile-1", "ExponentPushToken[abc]", "android");
  expect(row).toMatchObject({
    token: "ExponentPushToken[abc]",
    profile_id: "profile-1",
    platform: "android",
  });
  expect(typeof row?.updated_at).toBe("string");
});

test("rejects platforms the check constraint would reject", () => {
  // push_tokens.platform is `check (platform in ('ios','android'))`. Sending
  // anything else is a constraint violation at insert time, so it is caught
  // here instead.
  expect(pushTokenRow("p", "t", "web")).toBeNull();
  expect(pushTokenRow("p", "t", "macos")).toBeNull();
  expect(pushTokenRow("p", "t", "windows")).toBeNull();
});

test("rejects an empty token", () => {
  expect(pushTokenRow("p", "", "ios")).toBeNull();
});

test("rejects an empty profile id", () => {
  expect(pushTokenRow("", "t", "ios")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/pushToken.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/push'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/push.ts`:

```ts
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

export interface PushTokenRow {
  token: string;
  profile_id: string;
  platform: "ios" | "android";
  updated_at: string;
}

/**
 * push_tokens.platform is `check (platform in ('ios','android'))`. Returning
 * null for anything else keeps a constraint violation out of the insert path.
 */
export function pushTokenRow(
  profileId: string,
  token: string,
  platform: string,
): PushTokenRow | null {
  if (!profileId || !token) return null;
  if (platform !== "ios" && platform !== "android") return null;
  return {
    token,
    profile_id: profileId,
    platform,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Android downgrades notifications with no matching channel, and nothing
 * renders in the foreground without a handler. Both fail silently if skipped.
 */
export async function configureNotificationHandling(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      // push_to() sends channelId 'default'; this must exist to match.
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
  } catch {
    // Handler setup is best-effort.
  }
}

async function currentToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data ?? null;
}

/**
 * Registers this device for push. Runs on every launch when signed in and the
 * toggle is on — that repeated upsert is the heartbeat push_to()'s 60-day
 * staleness window depends on. If it stops running, live devices age out and
 * silently stop receiving anything.
 */
export async function registerPushToken(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const user = (await supabase?.auth.getUser())?.data.user;
    if (!user) return false;

    let status = (await Notifications.getPermissionsAsync()).status;
    if (status === "undetermined") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return false;

    await configureNotificationHandling();

    const token = await currentToken();
    if (!token) return false;

    const row = pushTokenRow(user.id, token, Platform.OS);
    if (!row) return false;

    const { error } = await supabase!
      .from("push_tokens")
      .upsert(row, { onConflict: "token" });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Removes only THIS device's token. The toggle lives in device-local
 * app_settings, so it is per-device — deleting all of the user's rows would
 * silently disable push on their other phone.
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const token = await currentToken();
    if (!token) return;
    await supabase?.from("push_tokens").delete().eq("token", token);
  } catch {
    // Best-effort.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/pushToken.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/push.ts tests/pushToken.test.ts
git commit -m "feat(notifications): expo push token lifecycle"
```

---

### Task 6: Wire push into the toggle, launch and sign-out

**Files:**
- Modify: `app/(app)/profile/index.tsx` (the `toggleReminders` function from Task 3, and the sign-out `Pressable` at line 467)
- Modify: `app/_layout.tsx` (launch-time registration)

**Interfaces:**
- Consumes: `registerPushToken`, `unregisterPushToken`, `configureNotificationHandling` from Task 5.
- Produces: nothing.

**Check `app/_layout.tsx` for uncommitted changes before editing it** (`git status --short app/_layout.tsx`). If it is dirty, stop and report — a concurrent session owns it.

- [ ] **Step 1: Extend the toggle to cover push**

In `toggleReminders`, register on enable and unregister on disable:

```tsx
      if (next) {
        const scheduled = await scheduleInactivityReminder();
        if (!scheduled) {
          setRemindersOn(false);
          await setSetting(REMINDERS_KEY, "0");
          toast("Enable notifications in Settings to get reminders", "error");
          return;
        }
        await syncSessionReminders();
        void registerPushToken();
      } else {
        await cancelReminders();
        void unregisterPushToken();
      }
```

Both push calls are `void`, not awaited: a slow network must not leave the switch stuck in its busy state.

- [ ] **Step 2: Unregister on sign-out**

At `app/(app)/profile/index.tsx:467` the sign-out button is currently:

```tsx
<Pressable style={s.signOut} onPress={() => supabase?.auth.signOut()}>
```

Change it to unregister first:

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

Order matters and is the whole point: deleting the row needs the session's JWT, because the RLS delete policy is `auth.uid() = profile_id`. Sign out first and the delete is rejected silently, leaving the row behind — the next person to sign in on that device receives the previous user's notifications until they happen to toggle the setting.

- [ ] **Step 3: Register at launch**

In `app/_layout.tsx`, inside the existing effect that runs once on mount, add:

```tsx
    void configureNotificationHandling();
    void registerPushToken();
```

`registerPushToken()` self-guards on being signed out and on the permission status, so it is safe to call unconditionally. It does not read the local toggle, which is deliberate: a user who has push disabled has no token row, so there is nothing for the server to send to regardless.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile/index.tsx" app/_layout.tsx
git commit -m "feat(notifications): register push tokens on launch, toggle and sign-out"
```

---

### Task 7: Deep links from a tapped notification

**Files:**
- Create: `src/lib/notificationRoute.ts`
- Modify: `app/_layout.tsx`
- Test: `tests/notificationRoute.test.ts`

**Interfaces:**
- Consumes: `data` payloads produced by Task 2 (`{ type: "session", sessionId }`) and Task 4 (`{ type: "friend_request" }`, `{ type: "join_request", clubId }`).
- Produces: `notificationRoute(data: unknown): string | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/notificationRoute.test.ts`:

```ts
import { notificationRoute } from "../src/lib/notificationRoute";

test("routes a friend request to the friends screen", () => {
  expect(notificationRoute({ type: "friend_request" })).toBe("/(app)/profile/friends");
});

test("routes a join request to that club's request queue", () => {
  expect(notificationRoute({ type: "join_request", clubId: "club-9" })).toBe(
    "/(app)/clubs/requests/club-9",
  );
});

test("routes a session reminder to the session", () => {
  expect(notificationRoute({ type: "session", sessionId: "s-3" })).toBe(
    "/(app)/sessions/s-3",
  );
});

test("returns null when a required id is missing", () => {
  // The payload crosses a process boundary and arrives untyped. A missing id
  // must not produce a route to `/undefined`.
  expect(notificationRoute({ type: "join_request" })).toBeNull();
  expect(notificationRoute({ type: "session" })).toBeNull();
  expect(notificationRoute({ type: "join_request", clubId: 7 })).toBeNull();
});

test("returns null for unknown, empty and malformed payloads", () => {
  expect(notificationRoute({ type: "something_else" })).toBeNull();
  expect(notificationRoute({})).toBeNull();
  expect(notificationRoute(null)).toBeNull();
  expect(notificationRoute(undefined)).toBeNull();
  expect(notificationRoute("friend_request")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/notificationRoute.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/notificationRoute'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notificationRoute.ts`:

```ts
/**
 * Maps a notification's `data` payload to a route.
 *
 * The payload crosses a process boundary and arrives untyped — it may come
 * from an older build of the app or from a server trigger that has since
 * changed. Every field is checked; anything unrecognised returns null and the
 * tap just opens the app.
 */
export function notificationRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  switch (d.type) {
    case "friend_request":
      return "/(app)/profile/friends";
    case "join_request":
      return typeof d.clubId === "string" && d.clubId
        ? `/(app)/clubs/requests/${d.clubId}`
        : null;
    case "session":
      return typeof d.sessionId === "string" && d.sessionId
        ? `/(app)/sessions/${d.sessionId}`
        : null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/notificationRoute.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the listeners**

In `app/_layout.tsx`, add an effect. Both paths are needed: the listener covers a tap while the app is running, `getLastNotificationResponseAsync()` covers a tap that cold-started it, and neither one covers the other case.

```tsx
  useEffect(() => {
    let cancelled = false;

    const go = (response: Notifications.NotificationResponse | null) => {
      if (cancelled || !response) return;
      const path = notificationRoute(response.notification.request.content.data);
      if (path) router.push(path as never);
    };

    void Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(go);

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
```

Imports needed: `* as Notifications from "expo-notifications"`, `notificationRoute` from `../src/lib/notificationRoute`, and `router` from `expo-router` if not already imported.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notificationRoute.ts tests/notificationRoute.test.ts app/_layout.tsx
git commit -m "feat(notifications): deep link from tapped notifications"
```

---

### Task 8: Credentials, migration and device verification

**This task cannot be executed by an agent.** It needs a Play/Firebase console, a Supabase dashboard, a physical device and two accounts. Hand it to the human and expect no commit.

**Prerequisites the human must do first:**

- [ ] Create a Firebase project, download `google-services.json`, add `"googleServicesFile": "./google-services.json"` under `android` in `app.json`, and upload the FCM V1 service-account key via `eas credentials`. Android push does not work in a standalone build without this. Add `google-services.json` to `.gitignore` — it is a credentials file.
- [ ] Confirm `pg_net` is available on the Supabase project (Database → Extensions). The migration's `create extension` fails without it.
- [ ] Apply `supabase/migrations/0035_push_notifications.sql` to production.
- [ ] Build and install a dev or preview build. **Push cannot be verified in Expo Go** — it needs the standalone credentials above.

**Verification, in order. Steps 1–5 need no push credentials and can be done first:**

- [ ] Enable the toggle. Confirm the label reads "Notifications".
- [ ] Create a session ~70 minutes out, open the sessions screen, wait for the reminder at −1h. Confirm it fires and its tap opens that session.
- [ ] Immediately after, confirm the inactivity reminder is *still* pending. **This is the exact regression the identifier rewrite exists to prevent** — under the old code the session reminder would have wiped it.
- [ ] Cancel that session, reopen the sessions screen, confirm the reminder no longer fires.
- [ ] Disable the toggle, confirm no local reminders remain.
- [ ] With the toggle on, confirm a `push_tokens` row exists with the right `profile_id` and a `platform` of `ios`/`android`.
- [ ] From a second account, send a friend request. Confirm the banner reads "Friend request / {name} wants to be friends." and the tap opens the friends screen.
- [ ] From a second account, request to join a club. Confirm every owner and admin receives it, the requester does not, and the tap opens that club's request queue.
- [ ] Disable the toggle, confirm the `push_tokens` row is deleted and a new friend request produces nothing.
- [ ] Re-enable, sign out, confirm the row is deleted. Sign in as a different account on the same device and confirm the first account's notifications do not arrive.
- [ ] Force-quit the app, send a friend request, tap the notification cold. Confirm it lands on the friends screen — this exercises `getLastNotificationResponseAsync()`, which the in-app listener does not cover.

---

## Notes for the reviewer

Three things in this plan are load-bearing and easy to regress:

1. **Nothing may call `cancelAllScheduledNotificationsAsync()`.** It is the bug Task 1 and Task 2 exist to remove. If it reappears anywhere, session reminders and the inactivity nudge start deleting each other.
2. **`revoke execute on function public.push_to`.** It is `SECURITY DEFINER` and reads every user's tokens. Without the revoke, any authenticated client can push arbitrary text to arbitrary users.
3. **Unregister before sign-out, not after.** The RLS delete policy needs the JWT. Reversing the order fails silently and leaks notifications to the next person who signs in on that device.
