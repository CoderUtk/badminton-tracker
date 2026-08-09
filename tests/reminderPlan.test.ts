import type { ClubSession } from "../src/repos/sessionRepo";
import {
  INACTIVITY_ID,
  SESSION_PREFIX,
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

test("the session identifier namespace is exported, not duplicated", () => {
  // cancelReminders() in src/lib/reminders.ts matches pending identifiers
  // against this prefix. It used to hard-code its own copy, so a change here
  // would have left every session reminder scheduled after toggling
  // notifications off. Importing the constant is what pins them together.
  expect(SESSION_PREFIX).toBe("session:");
  expect(sessionReminderId("abc")).toBe(`${SESSION_PREFIX}abc`);
  expect(INACTIVITY_ID.startsWith(SESSION_PREFIX)).toBe(false);
});
