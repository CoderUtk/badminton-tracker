### Task 6: Wire push into the toggle, launch and sign-out

**Files:**
- Modify: `app/(app)/profile/index.tsx` (the `toggleReminders` function from Task 3, and the sign-out `Pressable` at line 467)
- Modify: `app/_layout.tsx` (launch-time registration)

**Interfaces:**
- Consumes: `registerPushToken`, `unregisterPushToken`, `configureNotificationHandling` from Task 5.
- Produces: nothing.

**Check `app/_layout.tsx` for uncommitted changes before editing it** (`git status --short app/_layout.tsx`). If it is dirty, stop and report — a concurrent session owns it.

- [ ] **Step 1: Extend the toggle to cover push**

In `toggleReminders`, register on enable and unregister on disable:

```tsx
      if (next) {
        const scheduled = await scheduleInactivityReminder();
        if (!scheduled) {
          setRemindersOn(false);
          await setSetting(REMINDERS_KEY, "0");
          toast("Enable notifications in Settings to get reminders", "error");
          return;
        }
        await syncSessionReminders();
        void registerPushToken();
      } else {
        await cancelReminders();
        void unregisterPushToken();
      }
```

Both push calls are `void`, not awaited: a slow network must not leave the switch stuck in its busy state.

- [ ] **Step 2: Unregister on sign-out**

At `app/(app)/profile/index.tsx:467` the sign-out button is currently:

```tsx
<Pressable style={s.signOut} onPress={() => supabase?.auth.signOut()}>
```

Change it to unregister first:

```tsx
<Pressable
  style={s.signOut}
  onPress={() => {
    void unregisterPushToken().finally(() => {
      void supabase?.auth.signOut();
    });
  }}
>
```

Order matters and is the whole point: deleting the row needs the session's JWT, because the RLS delete policy is `auth.uid() = profile_id`. Sign out first and the delete is rejected silently, leaving the row behind — the next person to sign in on that device receives the previous user's notifications until they happen to toggle the setting.

- [ ] **Step 3: Register at launch**

In `app/_layout.tsx`, inside the existing effect that runs once on mount, add:

```tsx
    void configureNotificationHandling();
    void registerPushToken();
```

`registerPushToken()` self-guards on being signed out and on the permission status, so it is safe to call unconditionally. It does not read the local toggle, which is deliberate: a user who has push disabled has no token row, so there is nothing for the server to send to regardless.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile/index.tsx" app/_layout.tsx
git commit -m "feat(notifications): register push tokens on launch, toggle and sign-out"
```

---

