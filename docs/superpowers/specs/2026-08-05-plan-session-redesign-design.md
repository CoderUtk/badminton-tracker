# Plan Session Page Redesign

**Date:** 2026-08-05

## Problem

`app/new-session.tsx` has three UX issues:

1. **Calendar too big.** `DatePicker` (a full month grid) is always rendered below the
   Today/Tomorrow chips, taking most of the screen even though Today/Tomorrow covers the
   common case and the calendar is rarely needed.
2. **Time picker is two grids stacked.** `TimePicker.tsx` renders an hour-tile grid
   (6 AM–11 PM, wraps across multiple rows) plus a separate `:00`/`:30` toggle row below
   it — reads as two disconnected controls for one value.
3. **Courts uses a chip row.** `[1, 2, 3, 4]` chips for court count; no `+`/`-` stepper,
   default is 2.

## Design

### Calendar → collapsible accordion

Add a third chip to the When row: `Today` / `Tomorrow` / `Pick a date` (`calendar-outline`
icon + label). New state: `showCalendar: boolean` (default `false`).

- Today/Tomorrow tap: sets `day`, collapses calendar (`showCalendar = false`).
- "Pick a date" tap: toggles `showCalendar`.
- Chip visual "on" state (red bg) applies when `day` is neither today nor tomorrow, OR
  `showCalendar` is true.
- When `showCalendar` is true, `DatePicker` renders inline below the chip row exactly as
  today (no animation library — mount/unmount is enough, this isn't a perf-sensitive
  list).
- Picking a date in `DatePicker.onChange` also sets `showCalendar = false` — immediate
  collapse on selection.
- The existing `{day.toLocaleDateString(...)}` hint line stays always-visible below the
  chip row regardless of collapse state, so the chosen date is never ambiguous.

### Time picker → native platform picker

Delete `src/components/TimePicker.tsx` (only consumer is `new-session.tsx`). Replace the
"Time" section with:

- A themed `Pressable` row styled like the existing "Where" text input (`C.card`
  background, `C.line` border, 52px min height, 16px text) showing the current time as
  text (e.g. "6:00 PM") plus a `time-outline` icon. Tapping it opens the native time
  picker.
- New dependency: `@react-native-community/datetimepicker`, installed via
  `npx expo install @react-native-community/datetimepicker` (Expo Go-compatible, matches
  SDK 54 lockfile — no dev-client required).
- **iOS**: `mode="time"`, `display="spinner"`, rendered inside a themed modal sheet
  (`Modal` + dark scrim `rgba(0,0,0,0.5)`, `C.card`-colored sheet, rounded top corners,
  "Done" button in `C.red` to dismiss) — spinner mode needs an explicit confirm action,
  it doesn't auto-dismiss.
- **Android**: `mode="time"`, `display="default"` — this opens the OS clock-dialog
  directly; it's already a modal and auto-dismisses on confirm/cancel, so no extra
  wrapper `Modal` is needed on this platform.
- Platform-native look is accepted (confirmed with user) — the picker won't match the
  app's red/cyan HUD chrome beyond `Done` button tint, since it's a transient system
  overlay, not persistent screen chrome.
- On change, convert the picked `Date` object to `timeMinutes` (minutes since midnight:
  `date.getHours() * 60 + date.getMinutes()`) — same shape `new-session.tsx` already
  uses internally, so `save()` doesn't change.

### Courts → +/- stepper

New reusable component `src/components/Stepper.tsx`:

```ts
export default function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}): JSX.Element
```

- Row: `[−] [value] [+]`. `−`/`+` are 44×44pt circular `Pressable`s (`C.card` background,
  `C.line` border, `C.text` glyph, 24px font). Value text centered between them, 24px
  bold, `C.text`.
- `−` disabled (opacity 0.4, no-op `onPress`) when `value === min`.
- `+` disabled (opacity 0.4, no-op `onPress`) when `value === max`.
- No long-press/hold-to-repeat — single tap per step only.

In `new-session.tsx`: replace the courts chip row with `<Stepper value={courts} min={1}
max={8} onChange={setCourts} />`. Change `courts` initial state from `2` to `1`.

## Scope

Files touched:
- Modify: `app/new-session.tsx` (calendar accordion, time picker swap, courts stepper)
- Create: `src/components/Stepper.tsx`
- Create: modal wrapper for iOS time picker sheet (inline in `new-session.tsx`, no
  separate file — small enough, single consumer)
- Delete: `src/components/TimePicker.tsx`
- Dependency: add `@react-native-community/datetimepicker`

No changes to `sessionRepo.ts`, no DB changes, no changes to other screens. `DatePicker.tsx`
is reused as-is (only its mount point in `new-session.tsx` changes, not its own code).

## Testing

Visual-only change to a form screen, no separate business logic to unit test — same
testing posture as the existing screen (no test coverage today; verified via
`npx tsc --noEmit` plus manual run-through). Manual check:
- Calendar starts collapsed; Today/Tomorrow chips work as before.
- "Pick a date" expands calendar; selecting a date collapses it and updates the hint line.
- Time row opens native picker on both platforms (or at least one, per available test
  device); selected time reflects correctly in the row text and in the created session.
- Courts stepper: `-` disabled at 1, `+` disabled at 8, default starts at 1.
- Full flow: create a session end-to-end, confirm `startsAt`/`courts` land correctly in
  the DB (via the resulting session screen).
