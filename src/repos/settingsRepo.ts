import { getDb } from "../db/db";

// Display name now lives on profiles.display_name (see profileRepo) so it
// follows the account across devices.
export const ONBOARDING_SEEN_KEY = "onboarding_seen";

// Notification opt-OUT. "0" means the user turned notifications off; "1"
// means they turned them on; ABSENT means they have not decided, which counts
// as on — see remindersEnabled(). Read it through that helper, never with a
// bare === "1", or the default silently flips back to off.
export const REMINDERS_KEY = "reminders_on";

// The Expo push token last registered from this device (see src/lib/push.ts).
// Cached so unregistration never depends on a network round-trip to Expo:
// toggling off in airplane mode must still be able to delete the row.
export const PUSH_TOKEN_KEY = "push_token";

// Encoded `${updated_at}|${id}` keyset cursor for the newest matches row this
// device has pulled (see PullCursor in src/sync/pull.ts). Per-device on
// purpose: a reinstall has no local history, so it must pull everything again.
// refreshClubs() clears it whenever this device gains a club, so the older
// history of the newly visible club is re-read.
export const MATCH_PULL_KEY = "match_pull_at";

/**
 * Whether notifications are on, with the default applied.
 *
 * Notifications default to ON: the club-night pushes (0048) are the app's only
 * way to reach someone who is not already looking at it, and a default-off
 * toggle buried in Profile meant almost nobody ever received one. Only an
 * explicit "0" — the user moving the switch themselves — turns them off.
 *
 * This is the single place that decision lives. Every caller that used to
 * compare against "1" goes through here so an absent value cannot mean "on"
 * in one code path and "off" in another.
 */
export async function remindersEnabled(): Promise<boolean> {
  return (await getSetting(REMINDERS_KEY)) !== "0";
}

/** True until the user has explicitly chosen, either way. */
export async function remindersUndecided(): Promise<boolean> {
  return (await getSetting(REMINDERS_KEY)) === null;
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ value: string }>("select value from app_settings where key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync(
    "insert into app_settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
    key, value,
  );
}

export async function clearSetting(key: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync("delete from app_settings where key = ?", key);
}
