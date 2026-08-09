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
