import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";
import { pushTokenRow } from "./pushToken";
import { ensureNotificationPermission } from "./notificationPermission";
import { getSetting, setSetting, PUSH_TOKEN_KEY, REMINDERS_KEY } from "../repos/settingsRepo";

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

    if (!(await ensureNotificationPermission())) return false;

    const token = await currentToken();
    if (!token) return false;

    // Still built through pushTokenRow so the platform check that mirrors the
    // table's check constraint stays in one place.
    const row = pushTokenRow(user.id, token, Platform.OS);
    if (!row) return false;

    // NOT a table upsert: `on conflict do update` evaluates the UPDATE policy
    // against the pre-existing row, which belongs to the previous user after an
    // account switch, so RLS rejects it and the device never registers again.
    // register_push_token() is security definer and derives the owner from
    // auth.uid() itself. See 0035_push_notifications.sql.
    const { error } = await supabase!.rpc("register_push_token", {
      p_token: row.token,
      p_platform: row.platform,
    });
    if (error) return false;

    // Cached so unregistration works offline — see unregisterPushToken().
    await setSetting(PUSH_TOKEN_KEY, row.token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes only THIS device's token. The toggle lives in device-local
 * app_settings, so it is per-device — deleting all of the user's rows would
 * silently disable push on their other phone.
 *
 * Prefers the locally cached token: asking Expo for the current one is a
 * network round-trip, and if that throws (airplane mode, which is exactly when
 * someone turns notifications off) the delete never runs and the row keeps
 * receiving pushes for the whole 60-day staleness window.
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    let token = await getSetting(PUSH_TOKEN_KEY);
    if (!token) {
      // No cache (older install, or never registered from this build).
      token = await currentToken();
    }
    if (!token || !supabase) return;
    const { error } = await supabase.from("push_tokens").delete().eq("token", token);
    // Keep the cache until the row is actually gone so syncPushRegistration()
    // can retry on the next launch.
    if (!error) await setSetting(PUSH_TOKEN_KEY, "");
  } catch {
    // Best-effort; syncPushRegistration() retries at launch.
  }
}

/**
 * The single push entry point for app launch and resume.
 *
 * When the toggle is on this is the upsert heartbeat push_to()'s 60-day
 * staleness window depends on. When it is off it retries a delete that an
 * earlier offline toggle-off or sign-out failed to complete — without this a
 * failed unregister is unrecoverable, because registerPushToken() early-returns
 * on the off toggle and nothing else ever touches the row.
 *
 * Both halves need a live JWT for RLS, so neither runs before a session exists.
 */
export async function syncPushRegistration(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const user = (await supabase?.auth.getUser())?.data.user;
    if (!user) return;

    if ((await getSetting(REMINDERS_KEY)) === "1") {
      await registerPushToken();
      return;
    }
    // Only reach for the network when there is something known to delete.
    if (await getSetting(PUSH_TOKEN_KEY)) await unregisterPushToken();
  } catch {
    // Best-effort; retried on the next open or resume.
  }
}
