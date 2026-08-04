# Session Time Picker — Design

**Goal:** Replace the hardcoded 6:00 PM session start time in `app/new-session.tsx` with a user-pickable time, defaulting to 6:00 PM so nothing changes for a user who doesn't touch it.

**Why:** `SLOT_HOUR = 18` is hardcoded — every club session is created at exactly 6:00 PM regardless of when the club actually plays. The hint text (`"from 6:00 PM"`) is hardcoded too.

## Architecture

Purely a client-side form addition. `sessionRepo.createSession` already accepts an arbitrary `startsAt: number` timestamp — no repo, schema, or migration change needed. The only new piece is a presentational time picker component and the state to back it in `new-session.tsx`.

## Component: `src/components/TimePicker.tsx`

A horizontally-scrolling row of time chips, half-hour steps, covering 6:00 AM–11:00 PM (35 slots). Not the wrap-style layout `DatePicker`'s day grid and the existing club/day/courts chips use — 35 chips wrapped would produce a very tall block, so this one scrolls sideways instead. It keeps the same visual chip language (pill shape, `C.card`/`C.red` selected state) as the rest of the form.

```ts
export default function TimePicker({
  value,      // minutes since midnight, e.g. 1080 for 6:00 PM
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}): JSX.Element
```

On mount, the row auto-scrolls so the selected chip is in view (relevant when the default 6:00 PM chip isn't near the start of the 6 AM–11 PM range). Pure RN (`ScrollView horizontal` + `Pressable` chips) — no native module, same "works in Expo Go" property `DatePicker` has today.

Each chip label is a formatted time (`"6:00 AM"`, `"6:30 AM"`, ... `"11:00 PM"`); minutes-since-midnight is the wire format so the value composes directly into a `Date` without a separate hour/minute pair.

## `new-session.tsx` changes

- Replace `const SLOT_HOUR = 18;` with `const DEFAULT_TIME_MINUTES = 18 * 60;`
- Add `const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);`
- Replace the hardcoded hint line (`"... · from 6:00 PM"`) with a `"Time"` label followed by `<TimePicker value={timeMinutes} onChange={setTimeMinutes} />`, positioned where the hint text currently sits (after the `DatePicker`).
- In `save()`, build `startsAt` from the picked time instead of `SLOT_HOUR`:
  ```ts
  const hour = Math.floor(timeMinutes / 60);
  const minute = timeMinutes % 60;
  const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
  ```

## Data flow

Local UI state only: `TimePicker` → `timeMinutes` in `new-session.tsx` → composed into `startsAt` → `createSession(...)`. No changes downstream of `createSession` — every consumer of a session's `startsAt` already handles an arbitrary timestamp, not just 6:00 PM.

## Error handling

None needed. A selection always exists (the picker initializes to 6:00 PM and every chip is a valid time) — there is no invalid or empty state to guard against.

## Testing

This repo has no RN component-test harness — all existing tests (`tests/*.test.ts`) are logic/repo-level, not component-rendering. Verification is:
- `npx tsc --noEmit && npm test` — must stay green (no logic under test changes)
- Manual device check: open "Plan session", confirm the time chip row shows with 6:00 PM pre-selected, scroll and pick a different time, create the session, and confirm the created session's `startsAt` reflects the picked time (not always 6:00 PM)

## Out of scope

- No end time / duration field — sessions have never tracked one, and nothing in this request asks for it.
- No timezone handling beyond what already exists (`Date` is constructed in local time, same as the current hardcoded behavior).
