import * as Notifications from "expo-notifications";

/**
 * Asks for the notification permission, showing the OS dialog when one is
 * still available.
 *
 * Gated on `canAskAgain`, NOT on `status === "undetermined"`: Android has no
 * undetermined state for runtime permissions, so a never-asked
 * POST_NOTIFICATIONS reads back as denied with canAskAgain true. Gating on the
 * status string meant Android users never saw the system dialog at all and
 * went straight to the "turn it on in Settings" message.
 *
 * Once canAskAgain is false the OS will never show the dialog again — the
 * caller has to send the user to system settings instead (see
 * notificationsBlocked()).
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Whether the permission is ALREADY granted. Never shows a dialog.
 *
 * The distinction from ensureNotificationPermission matters: any code that can
 * run before the user has signed in must use this one. Notifications default
 * to on (remindersEnabled), so a scheduling call that reaches
 * ensureNotificationPermission at cold start pops the OS dialog over the splash
 * screen — which is the prompt people reflexively decline, and once
 * canAskAgain flips the OS never offers it again.
 *
 * Requesting is primeNotificationPermission's job alone, and it waits for a
 * real session.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * True when the permission is denied AND the OS refuses to prompt again, so
 * the only remaining route is system settings. Callers use this to pick
 * between "try again" and an Open settings affordance.
 */
export async function notificationsBlocked(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return !current.granted && !current.canAskAgain;
}
