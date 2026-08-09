### Task 7: Deep links from a tapped notification

**Files:**
- Create: `src/lib/notificationRoute.ts`
- Modify: `app/_layout.tsx`
- Test: `tests/notificationRoute.test.ts`

**Interfaces:**
- Consumes: `data` payloads produced by Task 2 (`{ type: "session", sessionId }`) and Task 4 (`{ type: "friend_request" }`, `{ type: "join_request", clubId }`).
- Produces: `notificationRoute(data: unknown): string | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/notificationRoute.test.ts`:

```ts
import { notificationRoute } from "../src/lib/notificationRoute";

test("routes a friend request to the friends screen", () => {
  expect(notificationRoute({ type: "friend_request" })).toBe("/(app)/profile/friends");
});

test("routes a join request to that club's request queue", () => {
  expect(notificationRoute({ type: "join_request", clubId: "club-9" })).toBe(
    "/(app)/clubs/requests/club-9",
  );
});

test("routes a session reminder to the session", () => {
  expect(notificationRoute({ type: "session", sessionId: "s-3" })).toBe(
    "/(app)/sessions/s-3",
  );
});

test("returns null when a required id is missing", () => {
  // The payload crosses a process boundary and arrives untyped. A missing id
  // must not produce a route to `/undefined`.
  expect(notificationRoute({ type: "join_request" })).toBeNull();
  expect(notificationRoute({ type: "session" })).toBeNull();
  expect(notificationRoute({ type: "join_request", clubId: 7 })).toBeNull();
});

test("returns null for unknown, empty and malformed payloads", () => {
  expect(notificationRoute({ type: "something_else" })).toBeNull();
  expect(notificationRoute({})).toBeNull();
  expect(notificationRoute(null)).toBeNull();
  expect(notificationRoute(undefined)).toBeNull();
  expect(notificationRoute("friend_request")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/notificationRoute.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/notificationRoute'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notificationRoute.ts`:

```ts
/**
 * Maps a notification's `data` payload to a route.
 *
 * The payload crosses a process boundary and arrives untyped — it may come
 * from an older build of the app or from a server trigger that has since
 * changed. Every field is checked; anything unrecognised returns null and the
 * tap just opens the app.
 */
export function notificationRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  switch (d.type) {
    case "friend_request":
      return "/(app)/profile/friends";
    case "join_request":
      return typeof d.clubId === "string" && d.clubId
        ? `/(app)/clubs/requests/${d.clubId}`
        : null;
    case "session":
      return typeof d.sessionId === "string" && d.sessionId
        ? `/(app)/sessions/${d.sessionId}`
        : null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/notificationRoute.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the listeners**

In `app/_layout.tsx`, add an effect. Both paths are needed: the listener covers a tap while the app is running, `getLastNotificationResponseAsync()` covers a tap that cold-started it, and neither one covers the other case.

```tsx
  useEffect(() => {
    let cancelled = false;

    const go = (response: Notifications.NotificationResponse | null) => {
      if (cancelled || !response) return;
      const path = notificationRoute(response.notification.request.content.data);
      if (path) router.push(path as never);
    };

    void Notifications.getLastNotificationResponseAsync().then(go).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(go);

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
```

Imports needed: `* as Notifications from "expo-notifications"`, `notificationRoute` from `../src/lib/notificationRoute`, and `router` from `expo-router` if not already imported.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notificationRoute.ts tests/notificationRoute.test.ts app/_layout.tsx
git commit -m "feat(notifications): deep link from tapped notifications"
```

---

