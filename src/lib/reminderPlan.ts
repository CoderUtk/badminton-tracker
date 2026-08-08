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
