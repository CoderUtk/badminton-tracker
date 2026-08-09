import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";
import { pushTokenRow } from "./pushToken";
import { getSetting, REMINDERS_KEY } from "../repos/settingsRepo";

export { pushTokenRow } from "./pushToken";
export type { PushTokenRow } from "./pushToken";

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
    // The presence of a token row IS the setting: registering here would
    // silently re-enable push for a user who explicitly turned it off.
    if ((await getSetting(REMINDERS_KEY)) !== "1") return false;

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
