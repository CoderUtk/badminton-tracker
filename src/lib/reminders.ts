import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { getSetting, REMINDERS_KEY } from "../repos/settingsRepo";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/**
 * Local-only inactivity nudge: "Haven't played in a while? Start a match."
 * scheduled ~7 days out. No server/push infra — everything here is
 * on-device via expo-notifications' local scheduler.
 *
 * No-ops on web (expo-notifications' scheduling APIs aren't supported
 * there) and never throws — a denied/undetermined permission just means
 * nothing gets scheduled.
 */
export async function scheduleInactivityReminder(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const on = (await getSetting(REMINDERS_KEY)) === "1";
    if (!on) return false;

    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== "granted") {
      // Only prompt when the user hasn't already decided — re-asking after
      // a denial is a no-op on most platforms anyway, but avoid it either way.
      if (status === "undetermined") {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status !== "granted") return false;
    }

    // Always reschedule from now — cancel any pending reminder first so
    // toggling or reopening the app doesn't stack up duplicate notifications.
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Miss the court?",
        body: "Haven't played in a while? Start a match.",
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

export async function cancelReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Best-effort cancel; nothing to recover from here.
  }
}
