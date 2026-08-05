# Plan Session Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `app/new-session.tsx`: collapsible calendar accordion, native time picker replacing `TimePicker.tsx`, and a +/- courts stepper defaulting to 1.

**Architecture:** Three independent UI changes to one screen. Task 1 builds the reusable `Stepper` component (no dependency on the others). Task 2 swaps `TimePicker` for `@react-native-community/datetimepicker` with a themed iOS modal wrapper. Task 3 adds the collapsible calendar accordion and wires all three changes together in `new-session.tsx`, then deletes `TimePicker.tsx`.

**Tech Stack:** React Native, Expo SDK 54, TypeScript, `@react-native-community/datetimepicker` (new dependency).

## Global Constraints

- Read exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code (per `AGENTS.md`).
- No animation library — mount/unmount is sufficient for the calendar accordion.
- Platform-native look for the time picker is accepted; only the "Done" button on iOS is themed (`C.red`).
- No long-press/hold-to-repeat on the Stepper — single tap per step only.
- `courts` bounds: min 1, max 8, default 1.
- No changes to `sessionRepo.ts`, no DB changes, no changes to other screens.
- `DatePicker.tsx` is reused as-is — only its mount point in `new-session.tsx` changes.

---

### Task 1: Stepper component

**Files:**
- Create: `src/components/Stepper.tsx`
- Test: manual (visual-only component, no test harness exists for RN components in this repo — see plan Testing note)

**Interfaces:**
- Produces: `export default function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

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
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View style={s.row}>
      <Pressable
        style={[s.btn, atMin && s.btnDisabled]}
        disabled={atMin}
        onPress={() => onChange(value - 1)}
      >
        <Text style={s.btnText}>−</Text>
      </Pressable>
      <Text style={s.value}>{value}</Text>
      <Pressable
        style={[s.btn, atMax && s.btnDisabled]}
        disabled={atMax}
        onPress={() => onChange(value + 1)}
      >
        <Text style={s.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  btn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.text, fontSize: 24, fontWeight: "800" },
  value: { color: C.text, fontSize: 24, fontWeight: "800", minWidth: 32, textAlign: "center" },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `Stepper.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Stepper.tsx
git commit -m "feat: add Stepper component for numeric +/- input"
```

---

### Task 2: Native time picker, delete TimePicker.tsx

**Files:**
- Modify: `app/new-session.tsx` (Time section only — leave Calendar/Courts sections untouched for this task)
- Delete: `src/components/TimePicker.tsx`
- Dependency: add `@react-native-community/datetimepicker`

**Interfaces:**
- Consumes: existing `timeMinutes: number` state and `setTimeMinutes: (n: number) => void` from `new-session.tsx`.
- Produces: a `formatTime(minutes: number): string` helper local to `new-session.tsx` (e.g. "6:00 PM"), and a `timePickerOpen: boolean` state used only within this task's Time section.

- [ ] **Step 1: Install the dependency**

Run: `npx expo install @react-native-community/datetimepicker`
Expected: package added to `package.json` and lockfile at the SDK-54-compatible version.

- [ ] **Step 2: Replace the Time section in `app/new-session.tsx`**

Remove the import:
```tsx
import TimePicker from "../src/components/TimePicker";
```

Add imports:
```tsx
import { Modal, Platform } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
```

Add state (alongside existing `useState` calls):
```tsx
const [timePickerOpen, setTimePickerOpen] = useState(false);
```

Add helper (module scope, alongside `DEFAULT_TIME_MINUTES`):
```tsx
function formatTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}
```

Add a change handler inside the component body:
```tsx
const timeAsDate = () => {
  const d = new Date(day);
  d.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
  return d;
};

const onTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
  if (Platform.OS === "android") setTimePickerOpen(false);
  if (event.type === "dismissed" || !selected) return;
  setTimeMinutes(selected.getHours() * 60 + selected.getMinutes());
};
```

Replace:
```tsx
<Text style={s.label}>Time</Text>
<TimePicker value={timeMinutes} onChange={setTimeMinutes} />
```
with:
```tsx
<Text style={s.label}>Time</Text>
<Pressable style={s.input} onPress={() => setTimePickerOpen(true)}>
  <Text style={s.timeText}>{formatTime(timeMinutes)}</Text>
</Pressable>
{timePickerOpen && Platform.OS === "android" && (
  <DateTimePicker mode="time" display="default" value={timeAsDate()} onChange={onTimeChange} />
)}
{Platform.OS === "ios" && (
  <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
    <Pressable style={s.sheetScrim} onPress={() => setTimePickerOpen(false)}>
      <Pressable style={s.sheet} onPress={() => {}}>
        <DateTimePicker mode="time" display="spinner" value={timeAsDate()} onChange={onTimeChange} />
        <Pressable style={s.sheetDone} onPress={() => setTimePickerOpen(false)}>
          <Text style={s.sheetDoneText}>Done</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  </Modal>
)}
```

Add styles to the `StyleSheet.create` block:
```tsx
timeText: { color: C.text, fontSize: 16, lineHeight: 52 },
sheetScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
sheet: { backgroundColor: C.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
sheetDone: { marginTop: 8, alignItems: "center", paddingVertical: 12 },
sheetDoneText: { color: C.red, fontSize: 16, fontWeight: "800" },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `TimePicker` or the new time-picker code.

- [ ] **Step 4: Delete the old component**

```bash
rm src/components/TimePicker.tsx
```

Run: `npx tsc --noEmit`
Expected: still no errors (confirms no other file imports `TimePicker`).

- [ ] **Step 5: Commit**

```bash
git add app/new-session.tsx src/components/TimePicker.tsx package.json package-lock.json
git commit -m "feat: replace TimePicker with native time picker in new-session"
```

---

### Task 3: Calendar accordion + Courts stepper wiring

**Files:**
- Modify: `app/new-session.tsx` (When section, Courts section, `courts` initial state)

**Interfaces:**
- Consumes: `Stepper` from Task 1 (`src/components/Stepper.tsx`), existing `day`/`setDay`/`DatePicker`/`startOfDay` already imported in `new-session.tsx`.

- [ ] **Step 1: Add the Stepper import and collapse state**

```tsx
import Stepper from "../src/components/Stepper";
```

```tsx
const [showCalendar, setShowCalendar] = useState(false);
```

- [ ] **Step 2: Change `courts` default**

```tsx
const [courts, setCourts] = useState(2);
```
becomes:
```tsx
const [courts, setCourts] = useState(1);
```

- [ ] **Step 3: Replace the When section**

Replace:
```tsx
<Text style={s.label}>When</Text>
<View style={s.chips}>
  <Pressable style={[s.chip, sameDay(day, today) && s.chipOn]} onPress={() => setDay(today)}>
    <Text style={s.chipText}>Today</Text>
  </Pressable>
  <Pressable style={[s.chip, sameDay(day, tomorrow) && s.chipOn]} onPress={() => setDay(tomorrow)}>
    <Text style={s.chipText}>Tomorrow</Text>
  </Pressable>
</View>
<DatePicker value={day} onChange={setDay} />
<Text style={s.hint}>
  {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
</Text>
```
with:
```tsx
<Text style={s.label}>When</Text>
<View style={s.chips}>
  <Pressable
    style={[s.chip, sameDay(day, today) && !showCalendar && s.chipOn]}
    onPress={() => { setDay(today); setShowCalendar(false); }}
  >
    <Text style={s.chipText}>Today</Text>
  </Pressable>
  <Pressable
    style={[s.chip, sameDay(day, tomorrow) && !showCalendar && s.chipOn]}
    onPress={() => { setDay(tomorrow); setShowCalendar(false); }}
  >
    <Text style={s.chipText}>Tomorrow</Text>
  </Pressable>
  <Pressable
    style={[s.chip, (showCalendar || (!sameDay(day, today) && !sameDay(day, tomorrow))) && s.chipOn]}
    onPress={() => setShowCalendar((v) => !v)}
  >
    <Text style={s.chipText}>Pick a date</Text>
  </Pressable>
</View>
{showCalendar && (
  <DatePicker value={day} onChange={(d) => { setDay(d); setShowCalendar(false); }} />
)}
<Text style={s.hint}>
  {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
</Text>
```

- [ ] **Step 4: Replace the Courts section**

Replace:
```tsx
<Text style={s.label}>Courts</Text>
<View style={s.chips}>
  {[1, 2, 3, 4].map((n) => (
    <Pressable key={n} style={[s.chip, courts === n && s.chipOn]} onPress={() => setCourts(n)}>
      <Text style={s.chipText}>{n}</Text>
    </Pressable>
  ))}
</View>
```
with:
```tsx
<Text style={s.label}>Courts</Text>
<Stepper value={courts} min={1} max={8} onChange={setCourts} />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the app (`npx expo start`), open Plan Session:
- Calendar starts collapsed; Today/Tomorrow chips work.
- "Pick a date" expands calendar; selecting a date collapses it, hint line updates.
- Time row opens native picker; selecting a time updates the row text.
- Courts stepper: `-` disabled at 1, `+` disabled at 8, starts at 1.
- Full flow: create a session, confirm `startsAt`/`courts` land correctly on the resulting session screen.

- [ ] **Step 7: Commit**

```bash
git add app/new-session.tsx
git commit -m "feat: add collapsible calendar accordion and courts stepper to new-session"
```

---

## Testing

No automated test coverage exists for RN screens/components in this repo (confirmed: `tests/` contains only logic/repo/engine tests, no component tests). Verification is `npx tsc --noEmit` after each task plus the manual run-through in Task 3 Step 6 — matches this screen's existing testing posture.
