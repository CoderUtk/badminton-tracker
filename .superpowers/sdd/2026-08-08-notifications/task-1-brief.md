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

