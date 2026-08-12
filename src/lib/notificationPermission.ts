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
 * True when the permission is denied AND the OS refuses to prompt again, so
 * the only remaining route is system settings. Callers use this to pick
 * between "try again" and an Open settings affordance.
 */
export async function notificationsBlocked(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return !current.granted && !current.canAskAgain;
}
