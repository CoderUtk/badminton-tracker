import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { hasNotificationPermission } from "./notificationPermission";
import { remindersEnabled } from "../repos/settingsRepo";
import { listSessions } from "../repos/sessionRepo";
import { INACTIVITY_ID, SESSION_PREFIX, planSessionReminders } from "./reminderPlan";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/**
 * Local notifications are scheduled with stable identifiers so the two kinds
 * can coexist: `inactivity` for the nudge, `session:<id>` per session. Nothing
 * here may call cancelAllScheduledNotificationsAsync() — it would wipe the
 * other kind.
 */

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
    // Checks, never requests — this runs at cold start, before sign-in.
    // See hasNotificationPermission.
    if (!(await hasNotificationPermission())) return false;

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
    if (!(await hasNotificationPermission())) return;

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
      if (id === INACTIVITY_ID || id.startsWith(SESSION_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
  } catch {
    // Best-effort cancel; nothing to recover from here.
  }
}
