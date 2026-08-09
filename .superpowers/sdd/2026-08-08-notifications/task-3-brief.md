### Task 3: Wire local reminders into the profile toggle

**Files:**
- Modify: `app/(app)/profile/index.tsx` (the `toggleReminders` function, currently at lines 67–86, and the toggle's label)

**Interfaces:**
- Consumes: `scheduleInactivityReminder`, `syncSessionReminders`, `cancelReminders` from Task 2.
- Produces: nothing consumed by later tasks. Task 6 extends this same function for push.

- [ ] **Step 1: Extend the toggle handler**

Replace the body of `toggleReminders` in `app/(app)/profile/index.tsx`. The current version calls only `scheduleInactivityReminder()`; add the session sync on the enable path:

```tsx
  const toggleReminders = async () => {
    if (remindersBusy) return;
    const next = !remindersOn;
    setRemindersBusy(true);
    setRemindersOn(next);
    try {
      await setSetting(REMINDERS_KEY, next ? "1" : "0");
      if (next) {
        const scheduled = await scheduleInactivityReminder();
        if (!scheduled) {
          setRemindersOn(false);
          await setSetting(REMINDERS_KEY, "0");
          toast("Enable notifications in Settings to get reminders", "error");
          return;
        }
        await syncSessionReminders();
      } else {
        await cancelReminders();
      }
    } finally {
      setRemindersBusy(false);
    }
  };
```

The `return` after the failure toast is new and load-bearing: without it, `syncSessionReminders()` runs after the user has been told reminders are off.

Add `syncSessionReminders` to the existing import from `../../../src/lib/reminders`.

- [ ] **Step 2: Relabel the toggle**

Locate the label with `grep -n "remindersOn" "app/(app)/profile/index.tsx"` and read the surrounding JSX row. Change only the label string to `Notifications` — no style, no layout, no structural change. If the row has a secondary/description line, leave it as-is unless it names only reminders, in which case it becomes `Match reminders and requests`.

- [ ] **Step 3: Keep session reminders fresh after a sync**

Sessions arrive from the server after the toggle was flipped, so the schedule needs re-running when the cache changes. In `app/(app)/sessions/index.tsx`, find the function that calls `refreshSessions()` (it is the screen's load/reload path) and call `void syncSessionReminders()` after the subsequent cache read resolves — the plan must diff against a populated `sessions_cache`, so calling it before the refresh lands schedules nothing. Add the import from `../../../src/lib/reminders`.

Do not `await` it — reminder scheduling must never delay a screen's render path.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile/index.tsx" "app/(app)/sessions/index.tsx"
git commit -m "feat(notifications): schedule session reminders from the toggle"
```

---

