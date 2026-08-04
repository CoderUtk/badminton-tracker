# Session Time Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 6:00 PM session start time in `app/new-session.tsx` with a user-pickable time (half-hour steps, 6:00 AM–11:00 PM), defaulting to 6:00 PM so nothing changes for a user who doesn't touch it.

**Architecture:** One new presentational component, `src/components/TimePicker.tsx` — a horizontally-scrolling chip row, pure RN, no native module (same property `src/components/DatePicker.tsx` already has). `new-session.tsx` swaps its hardcoded `SLOT_HOUR` hint for this component and threads the picked value into `createSession`. No repo, schema, or migration change — `createSession` already accepts an arbitrary `startsAt` timestamp.

**Tech Stack:** TypeScript, Expo SDK 57, React Native, expo-router.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code.
- Gate every task on `npx tsc --noEmit && npm test`. Both must pass before commit.
- No native module — `TimePicker` must work in Expo Go offline, matching `DatePicker`.
- Reuse `src/theme` tokens (`C`); no hardcoded colours.
- Do not add a `Co-Authored-By` trailer to commits.
- This repo has no RN component-test harness — verification for UI changes is `tsc`/`npm test` plus a manual device check, not a new automated test.

---

### Task 1: TimePicker component

**Files:**
- Create: `src/components/TimePicker.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `TimePicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }): JSX.Element`. `value`/`onChange` carry minutes-since-midnight (e.g. `1080` for 6:00 PM).

- [ ] **Step 1: Create the component**

Create `src/components/TimePicker.tsx`:

```tsx
import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C } from "../theme";

const START_MINUTES = 6 * 60; // 6:00 AM
const END_MINUTES = 23 * 60; // 11:00 PM
const STEP_MINUTES = 30;
const CHIP_WIDTH = 78; // s.chip width + gap, used to scroll the selected chip into view

const SLOTS: number[] = [];
for (let m = START_MINUTES; m <= END_MINUTES; m += STEP_MINUTES) SLOTS.push(m);

/** "6:00 AM", "6:30 PM", etc. from minutes-since-midnight. */
function formatSlot(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

/**
 * Half-hour time-of-day chips, 6:00 AM–11:00 PM, scrolling horizontally
 * rather than wrapping — 35 slots wrapped would produce a very tall block.
 * Pure RN, no native module, so it works in Expo Go offline like DatePicker.
 */
export default function TimePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const index = SLOTS.indexOf(value);
    if (index < 0) return;
    // Center the selected chip roughly, so a 6 PM default well past the
    // 6 AM start of the row isn't hidden off-screen on first render.
    scrollRef.current?.scrollTo({ x: Math.max(0, index * CHIP_WIDTH - CHIP_WIDTH * 2), animated: false });
  }, []);

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {SLOTS.map((slot) => (
        <Pressable key={slot} style={[s.chip, slot === value && s.chipOn]} onPress={() => onChange(slot)}>
          <Text style={[s.chipText, slot === value && s.chipTextOn]}>{formatSlot(slot)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    minWidth: 70, minHeight: 42, paddingHorizontal: 14, justifyContent: "center", alignItems: "center",
    borderRadius: 21, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
  },
  chipOn: { backgroundColor: C.red, borderColor: C.red },
  chipText: { color: C.text, fontWeight: "700" },
  chipTextOn: { color: C.text },
});
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. `TimePicker` is not imported anywhere yet, so this only
confirms the file itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/TimePicker.tsx
git commit -m "feat(sessions): add a half-hour time-of-day picker component"
```

---

### Task 2: Wire the picker into the new-session screen

**Files:**
- Modify: `app/new-session.tsx`

**Interfaces:**
- Consumes: `TimePicker` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the hardcoded slot constant**

In `app/new-session.tsx`, replace:

```ts
/** Default club-night slot: 6:00 PM on the chosen day. */
const SLOT_HOUR = 18;
```

with:

```ts
/** Default club-night slot: 6:00 PM on the chosen day, as minutes-since-midnight. */
const DEFAULT_TIME_MINUTES = 18 * 60;
```

- [ ] **Step 2: Import TimePicker and add state**

Add the import:

```ts
import TimePicker from "../src/components/TimePicker";
```

Add state alongside the existing `day` state:

```ts
const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
```

- [ ] **Step 3: Build startsAt from the picked time**

Replace the `startsAt` line in `save()`:

```ts
const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), SLOT_HOUR).getTime();
```

with:

```ts
const hour = Math.floor(timeMinutes / 60);
const minute = timeMinutes % 60;
const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
```

- [ ] **Step 4: Replace the hardcoded hint with the picker**

Replace:

```tsx
<DatePicker value={day} onChange={setDay} />
<Text style={s.hint}>
  {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · from 6:00 PM
</Text>
```

with:

```tsx
<DatePicker value={day} onChange={setDay} />
<Text style={s.hint}>
  {day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
</Text>
<Text style={s.label}>Time</Text>
<TimePicker value={timeMinutes} onChange={setTimeMinutes} />
```

- [ ] **Step 5: Gate**

```bash
npx tsc --noEmit && npm test
```

Expected: both pass. This is a UI-only change with no logic under test, so
`npm test` is a regression check, not new coverage.

- [ ] **Step 6: Commit**

```bash
git add app/new-session.tsx
git commit -m "feat(sessions): let the user pick the session start time"
```

- [ ] **Step 7: Verify on device**

Open "Plan session". Confirm:
- The time chip row shows under "Time", scrolled so 6:00 PM is visible and
  selected by default.
- Scrolling the row and picking a different time (e.g. 7:30 PM) highlights
  that chip instead.
- Creating the session with a non-default time picked produces a session
  whose start time (shown on the session screen) matches the picked time,
  not always 6:00 PM.
- Creating a session without touching the picker still produces a 6:00 PM
  start, matching today's behavior.

---

## Final verification

- [ ] `npx tsc --noEmit && npm test` — green
- [ ] Device check from Task 2 Step 7 passed
