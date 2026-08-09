### Task 5: Push token lifecycle

**Files:**
- Create: `src/lib/push.ts`
- Test: `tests/pushToken.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (may be null). `push_tokens` from Task 4.
- Produces: `pushTokenRow(profileId: string, token: string, platform: string): PushTokenRow | null`, `PushTokenRow { token: string; profile_id: string; platform: "ios" | "android"; updated_at: string }`, `registerPushToken(): Promise<boolean>`, `unregisterPushToken(): Promise<void>`, `configureNotificationHandling(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Only the row builder is reachable from jest — the rest calls `expo-notifications`. The builder is still worth testing: it is the one place a value can violate the `platform` check constraint.

Create `tests/pushToken.test.ts`:

```ts
import { pushTokenRow } from "../src/lib/push";

test("builds a row for a supported platform", () => {
  const row = pushTokenRow("profile-1", "ExponentPushToken[abc]", "android");
  expect(row).toMatchObject({
    token: "ExponentPushToken[abc]",
    profile_id: "profile-1",
    platform: "android",
  });
  expect(typeof row?.updated_at).toBe("string");
});

test("rejects platforms the check constraint would reject", () => {
  // push_tokens.platform is `check (platform in ('ios','android'))`. Sending
  // anything else is a constraint violation at insert time, so it is caught
  // here instead.
  expect(pushTokenRow("p", "t", "web")).toBeNull();
  expect(pushTokenRow("p", "t", "macos")).toBeNull();
  expect(pushTokenRow("p", "t", "windows")).toBeNull();
});

test("rejects an empty token", () => {
  expect(pushTokenRow("p", "", "ios")).toBeNull();
});

test("rejects an empty profile id", () => {
  expect(pushTokenRow("", "t", "ios")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/pushToken.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/push'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/push.ts`:

```ts
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

export interface PushTokenRow {
  token: string;
  profile_id: string;
  platform: "ios" | "android";
  updated_at: string;
}

/**
 * push_tokens.platform is `check (platform in ('ios','android'))`. Returning
 * null for anything else keeps a constraint violation out of the insert path.
 */
export function pushTokenRow(
  profileId: string,
  token: string,
  platform: string,
): PushTokenRow | null {
  if (!profileId || !token) return null;
  if (platform !== "ios" && platform !== "android") return null;
  return {
    token,
    profile_id: profileId,
    platform,
    updated_at: new Date().toISOString(),
  };
}

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/pushToken.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/push.ts tests/pushToken.test.ts
git commit -m "feat(notifications): expo push token lifecycle"
```

---

