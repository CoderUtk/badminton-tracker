import { getDb } from "../db/db";

// Display name now lives on profiles.display_name (see profileRepo) so it
// follows the account across devices.
export const ONBOARDING_SEEN_KEY = "onboarding_seen";

// "1" when the user has opted in to local inactivity reminder notifications
// (see src/lib/reminders.ts); absent/anything else means off.
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
