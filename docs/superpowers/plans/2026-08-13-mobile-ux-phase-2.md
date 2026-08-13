# Mobile UX Refinement — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live scoring screen dumpable by `uiautomator`, give it an orientation contract that cannot strand the rest of the app in landscape, make the score the thing you can read from across a court, and fix the Ops screen's navigation header.

**Architecture:** The elapsed timer stops living in `MatchScreen`'s render and becomes a leaf that writes a Reanimated shared value, so a tick costs zero React renders — that is what lets `uiautomator dump` reach idle, which every other verification in this phase depends on. Orientation moves from a mount `useEffect` that restores with `unlockAsync()` to a `useFocusEffect` whose cleanup is unconditionally `lockAsync(PORTRAIT_UP)`. Pause becomes a local overlay with a paused-time accumulator instead of a `router.back()`. All three carry their arithmetic in pure modules under `src/lib/` so the node-env Jest suite can test them.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, `react-native-reanimated` ~4.1.1, `expo-screen-orientation` ~9.0.9, `expo-router` (for `useFocusEffect`), Jest 29 + ts-jest. **No new dependency is added by this plan.**

**Spec:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` — §4 and **§4a, which governs where it conflicts with §4**
**Audit baseline:** `docs/audit/2026-08-12-ux-audit/`
**Prior phase:** `docs/superpowers/plans/2026-08-13-mobile-ux-phase-0-1.md` (Phase 0 tokens are already on `master` and this plan consumes them)

## Global Constraints

- **Findings closed by this plan:** **H6, M8, A7**, plus one found bug (the Ops navigation header) absorbed per spec §4a.
- **Task 1–3 run first and in order.** `uiautomator dump` currently fails on the scoring screen with `ERROR: could not get idle state`, so no accessibility-tree evidence for H6 or M8 can be captured until A7 is closed and *measured* closed. This is spec §10 and §11, not a preference.
- **Test environment is node-only.** `jest.config.js` sets `testEnvironment: "node"` and `roots: ["<rootDir>/tests"]`. There is no `react-test-renderer` or `@testing-library/react-native`. **Do not add one.** Logic that needs a test gets extracted into `src/lib/` as a pure function; component behaviour is verified on-device via mobile-mcp in Task 10.
- **`MatchEvent` is off-limits.** `src/engine/types.ts:20` defines the persisted, synced, replayed event log. Pause must not add variants to it (spec §4a). Paused time is local component state.
- **Animate `transform` and `opacity` only.** Never animate `width`, `height`, `padding`, `margin`, or any layout property.
- **8pt spacing grid.** All new margins, padding and gaps come from `space` (4, 8, 16, 24, 32) in `src/theme.ts`.
- **Touch targets ≥48×48dp**, via real bounds or `hitSlop`. The scoring screen's `iconBtn` is currently `46×40` — Task 6 raises the controls it touches; the rest is Phase 6's sweep and must not be reported as a violation here.
- **`C.red` as a `backgroundColor` means primary action only.** Destructive uses the `danger` outline recipe from `src/theme.ts`.
- **Do not repaint anything for colour reasons.** The scoring screen's red/blue team hues are semantic (team A / team B), not the palette work — that is Phase 4. This phase changes type size and glow radius, not hue.
- **Commit with explicit pathspec.** Never `git add -A`, `git add .`, or `git commit -a`. No `Co-Authored-By` trailer.
- **Existing code style:** double-quoted strings, 2-space indent, `StyleSheet.create` assigned to a const named `s`, comments explain *why* not *what*.
- Run `npx tsc --noEmit` before every commit. It must pass.

---

## Workspace

Create an isolated worktree before Task 1, via the `superpowers:using-git-worktrees` skill. Branch off `master` at the spec amendment commit:

```bash
git worktree add .claude/worktrees/mobile-ux-phase-2 -b mobile-ux-phase-2 master
```

Phase 0/1 landed on `master` already, so this branch has `space`, `MIN_TOUCH`, `selected`, `danger` and `C.ghost` in `src/theme.ts`. Verify before starting:

```bash
grep -n "export const space\|export const MIN_TOUCH" src/theme.ts
```

Expected: both present. If either is missing you are on the wrong base — stop and report.

## Native builds on Windows — carry-forward warning only

Phase 1 established that `npx expo run:android` **cannot complete in this repo on Windows without long-path support**: CMake writes object paths that embed the full source path and blow past `MAX_PATH`, measured at ~440 characters and still >370 from a three-character root. The three routes were: build on EAS, enable `LongPathsEnabled` plus `git config --system core.longpaths true` (admin + reboot), or avoid the dependency.

**This plan adds no native dependency**, so none of that applies. `expo-screen-orientation` and `react-native-reanimated` are already in `package.json` and already in the installed dev client. Every task here is a JS/TS change testable over Metro with a reload.

Two traps from Phase 1 that still apply if you somehow end up rebuilding:
- `expo prebuild` does not generate `android/local.properties` and `ANDROID_HOME` is unset in these shells. Copy the file from the main checkout; do not hand-write it (backslashes must be doubled or Gradle throws `Malformed \uxxxx encoding`).
- **Never pipe a build through `| tail`** — the pipeline returns tail's exit status, so a failed build reports success. Use `; echo "EXIT_CODE=$?"`.

## File Structure

**Created:**
- `src/lib/elapsed.ts` — pure elapsed-time arithmetic and `HH:MM:SS` formatting, including the paused-span subtraction. No React imports.
- `src/lib/orientationLock.ts` — pure mapping from the picker's mode to a lock target, plus the constant that names what a blur must restore. No React imports, no `expo-screen-orientation` import.
- `src/components/ElapsedChip.tsx` — the leaf that owns the 1Hz tick. Nothing above it re-renders.
- `tests/elapsed.test.ts`, `tests/orientationLock.test.ts`, `tests/scoreboardType.test.ts`
- `docs/audit/verify/phase-2/` — verification evidence and its README.

**Modified:**
- `src/theme.ts` — adds `SCOREBOARD_TYPE`, the scoreboard type scale, so the M8 hierarchy is asserted rather than eyeballed.
- `src/screens/MatchScreen.tsx` — the bulk of the phase: timer extraction, `useFocusEffect` orientation, local pause, scoreboard type and glow.
- `app/(app)/tournaments/_layout.tsx` — the missing `Stack.Screen` for the Ops route.

**Deliberately not modified:**
- `app.json` — already declares `"orientation": "portrait"` (spec §4a).
- `app/_layout.tsx:254` — `orientation: "all"` on `score/[matchId]` is correct and stays. It permits rotation on the scoring screen; the runtime lock decides.
- `src/engine/types.ts` — see Global Constraints.

---

# A7 — TIMER (RUNS FIRST, GATES THE PHASE)

---

### Task 1: Pure elapsed-time arithmetic

`MatchScreen.tsx:122-125` computes elapsed inline from `nowTs`. Pause needs that arithmetic to subtract paused spans, and the formatter is the kind of thing that is wrong at exactly 60 minutes. Both move into a pure module so they can be tested, and so Task 2's leaf component and Task 6's pause share one implementation.

**Files:**
- Create: `src/lib/elapsed.ts`
- Test: `tests/elapsed.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ElapsedInput = { startedAt: number; now: number; pausedMs: number; pausedSince: number | null }`, `elapsedMs(input: ElapsedInput): number`, `formatElapsed(ms: number): string`. Tasks 2 and 6 consume all three.

- [ ] **Step 1: Write the failing test**

Create `tests/elapsed.test.ts`:

```typescript
import { elapsedMs, formatElapsed } from "../src/lib/elapsed";

const START = 1_000_000;

describe("elapsedMs", () => {
  it("is the wall-clock gap when nothing has been paused", () => {
    expect(elapsedMs({ startedAt: START, now: START + 5_000, pausedMs: 0, pausedSince: null })).toBe(5_000);
  });

  it("is zero at the instant the match starts", () => {
    expect(elapsedMs({ startedAt: START, now: START, pausedMs: 0, pausedSince: null })).toBe(0);
  });

  it("subtracts completed paused spans", () => {
    // 10s of wall clock, 4s of it paused and already banked.
    expect(elapsedMs({ startedAt: START, now: START + 10_000, pausedMs: 4_000, pausedSince: null })).toBe(6_000);
  });

  it("freezes while currently paused", () => {
    // Paused at +6s. Two different nows must give the same answer.
    const base = { startedAt: START, pausedMs: 0, pausedSince: START + 6_000 };
    expect(elapsedMs({ ...base, now: START + 6_000 })).toBe(6_000);
    expect(elapsedMs({ ...base, now: START + 90_000 })).toBe(6_000);
  });

  it("subtracts banked spans and the open span together", () => {
    // 20s wall clock, 3s banked from an earlier pause, paused again at +15s.
    expect(elapsedMs({ startedAt: START, now: START + 20_000, pausedMs: 3_000, pausedSince: START + 15_000 })).toBe(12_000);
  });

  it("never returns a negative value when the clock jumps backwards", () => {
    // Device clock corrections and NTP steps both produce now < startedAt.
    expect(elapsedMs({ startedAt: START, now: START - 30_000, pausedMs: 0, pausedSince: null })).toBe(0);
  });
});

describe("formatElapsed", () => {
  it("zero-pads every field", () => {
    expect(formatElapsed(0)).toBe("00:00:00");
  });

  it("formats seconds", () => {
    expect(formatElapsed(9_000)).toBe("00:00:09");
  });

  it("rolls over to minutes at exactly 60 seconds", () => {
    expect(formatElapsed(60_000)).toBe("00:01:00");
  });

  it("rolls over to hours at exactly 60 minutes", () => {
    expect(formatElapsed(3_600_000)).toBe("01:00:00");
  });

  it("keeps minutes and seconds inside their own field past an hour", () => {
    // 1h 02m 03s — the case where a naive floor(ms/60000) leaks 62 into minutes.
    expect(formatElapsed(3_723_000)).toBe("01:02:03");
  });

  it("truncates sub-second remainders rather than rounding up", () => {
    // A timer that shows 00:00:01 before a full second has elapsed reads as wrong.
    expect(formatElapsed(1_999)).toBe("00:00:01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/elapsed.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/elapsed'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/elapsed.ts`:

```typescript
/**
 * Elapsed match time.
 *
 * Pure so the node-env Jest suite can test it, and so ElapsedChip and the pause
 * overlay share one definition of "how long has this match been going".
 *
 * Paused spans are subtracted rather than the clock being restarted, because
 * elapsed is derived from the match's MATCH_STARTED timestamp — that is what
 * lets it survive leaving and resuming the screen without resetting to zero.
 * Pause itself is local, non-persisted state (spec 4a): the event log is
 * reduced, synced and replayed, and must not carry a UI affordance.
 */
export type ElapsedInput = {
  /** MATCH_STARTED timestamp, in epoch ms. */
  startedAt: number;
  /** Current wall clock, in epoch ms. */
  now: number;
  /** Total of every already-completed paused span, in ms. */
  pausedMs: number;
  /** Start of the currently-open paused span, or null when running. */
  pausedSince: number | null;
};

export function elapsedMs({ startedAt, now, pausedMs, pausedSince }: ElapsedInput): number {
  const openPause = pausedSince === null ? 0 : now - pausedSince;
  const ms = now - startedAt - pausedMs - openPause;
  // A backwards clock step (NTP correction, manual change) must not render a
  // negative duration on the one screen that stays open for an hour.
  return ms > 0 ? ms : 0;
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/elapsed.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/lib/elapsed.ts tests/elapsed.test.ts
git commit -m "feat(match): add pure elapsed-time math with paused-span subtraction"
```

---

### Task 2: Move the tick into a leaf component (A7)

`src/screens/MatchScreen.tsx:100-104` holds `nowTs` in `useState` and writes it every 1000ms. That re-renders the whole 413-line screen — `Court`, both rails, the ribbon, the rally dots — once a second, forever, on the screen that stays open longest. It is why `uiautomator dump` reports `ERROR: could not get idle state` (audit A7) and why the screen drains battery.

The tick moves into a leaf that writes a Reanimated shared value and renders through `useAnimatedProps`, so a tick updates one native text node and causes **zero React renders**.

Why an `Animated.createAnimatedComponent(TextInput)` and not `Animated.Text`: Reanimated can drive a `TextInput`'s `text` prop natively, and cannot drive `Text`'s children. This is the standard "ReText" pattern. The input is `editable={false}` and non-focusable, so it behaves as a label.

**Files:**
- Create: `src/components/ElapsedChip.tsx`
- Modify: `src/screens/MatchScreen.tsx:1-2` (imports), `:96-104` (tick state), `:122-125` (derivation), `:258-263` (chip render), `:352-357` (styles)

**Interfaces:**
- Consumes: `elapsedMs`, `formatElapsed`, `ElapsedInput` from Task 1; `C`, `F`, `space` from `src/theme`; `Icon`.
- Produces: default export `ElapsedChip`, props `{ startedAt: number; pausedMs: number; pausedSince: number | null }`. Task 6 passes real values for the last two; this task passes `0` and `null`.

- [ ] **Step 1: Write the component**

Create `src/components/ElapsedChip.tsx`:

```typescript
import React, { useEffect } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import Animated, { useAnimatedProps, useSharedValue } from "react-native-reanimated";
import Icon from "./Icon";
import { elapsedMs, formatElapsed } from "../lib/elapsed";
import { C, F, space } from "../theme";

// Reanimated can drive a TextInput's `text` prop natively; it cannot drive a
// Text's children. This is the only way to update a string once a second
// without a React render.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Elapsed-match-time chip. The ONLY thing on the scoring screen that ticks.
 *
 * This exists as a separate component for one reason: MatchScreen used to hold
 * the clock in useState and re-render the entire screen — court, rails, ribbon,
 * rally dots — every second. uiautomator could never find the window idle
 * (audit A7), so the scoring screen was the one screen the audit could not
 * dump, and the re-render churn ran for the whole length of a match.
 *
 * The interval still runs on the JS thread (it is 1Hz; a UI-thread clock buys
 * nothing here) but it writes a shared value instead of React state, so the
 * update lands on one native text node and stops there.
 */
export default function ElapsedChip({
  startedAt,
  pausedMs,
  pausedSince,
}: {
  startedAt: number;
  pausedMs: number;
  pausedSince: number | null;
}) {
  const text = useSharedValue(formatElapsed(0));

  useEffect(() => {
    const tick = () => {
      text.value = formatElapsed(
        elapsedMs({ startedAt, now: Date.now(), pausedMs, pausedSince })
      );
    };
    // Paint immediately so the chip is never blank for up to a second, and so a
    // pause/resume shows its new frozen value without waiting for the interval.
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, pausedMs, pausedSince, text]);

  const animatedProps = useAnimatedProps(
    () => ({ text: text.value, defaultValue: text.value }) as Partial<TextInputProps>
  );

  return (
    <View style={s.chip} accessibilityRole="text" accessibilityLabel="Elapsed match time">
      <Icon name="time-outline" color={C.text2} size={12} />
      <AnimatedTextInput
        style={s.text}
        animatedProps={animatedProps}
        editable={false}
        // Not a field: no caret, no focus ring, no keyboard, no tab stop.
        caretHidden
        focusable={false}
        underlineColorAndroid="transparent"
        defaultValue={formatElapsed(0)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: "row", alignItems: "center", gap: space.xs,
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2,
    borderWidth: 1, borderColor: C.line,
  },
  // padding/margin zeroed because TextInput carries platform defaults that a
  // Text does not, and this has to sit on the same baseline the Text did.
  text: {
    color: C.text2, fontSize: 12, fontFamily: F.body,
    fontVariant: ["tabular-nums"],
    padding: 0, margin: 0, minWidth: 58,
  },
});
```

- [ ] **Step 2: Delete the tick from MatchScreen**

In `src/screens/MatchScreen.tsx`, remove the interval block at lines 100-104 entirely:

```typescript
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
```

Keep the comment above it, moved and reworded, next to `startedAt` in the next step.

Then at lines 122-125, delete the three derived lines and keep only `startedAt`:

```typescript
  // Elapsed is derived from the match's start timestamp, not from a counter, so
  // it survives leaving and resuming without resetting to 0. The tick itself
  // lives in ElapsedChip — see the note there about audit A7.
  const startedAt = events[0]?.type === "MATCH_STARTED" ? events[0].at : record.created_at;
```

The `seconds`, `fmt` and `timer` lines are all deleted.

- [ ] **Step 3: Render the chip**

Add the import beside the other component imports at the top of the file:

```typescript
import ElapsedChip from "../components/ElapsedChip";
```

Then in `scoreBlock` at lines 259-263, replace the inline chip:

```typescript
      <View style={s.timerChip}>
        <Icon name="time-outline" color={C.text2} size={12} />
        <Text style={s.timerText}>{timer}</Text>
      </View>
```

with:

```typescript
      <ElapsedChip startedAt={startedAt} pausedMs={0} pausedSince={null} />
```

`pausedMs` and `pausedSince` are wired to real state in Task 6. They are props from the start so that task does not have to change this component's shape.

- [ ] **Step 4: Delete the orphaned styles**

Remove `timerChip` and `timerText` from the `StyleSheet.create` block at lines 352-357 — `ElapsedChip` owns them now.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `useState` or `Icon` is reported unused in `MatchScreen.tsx`, that is wrong — both are still used elsewhere in the file (`orientationMode`, `orientationSheetOpen`; the toolbar icons). If `useEffect` is reported unused, that is also wrong — the `open(matchId)` effect at line 86 remains. Any *genuine* unused import is expected fallout from the deletion; remove it.

If `animatedProps` rejects the `text` key, the `as Partial<TextInputProps>` cast is doing its job and the error is elsewhere — do not widen it to `any`.

- [ ] **Step 6: Verify on device that the clock still runs**

Start Metro and open a live match:

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

Expected: the chip shows `00:00:00` on entry and advances once a second, monospaced, with no width jitter as digits change. Score a point and confirm the timer does not reset.

This is a JS-only change, so a Metro reload is enough — no rebuild.

- [ ] **Step 7: Commit**

```bash
git add src/components/ElapsedChip.tsx src/screens/MatchScreen.tsx
git commit -m "perf(match): move the elapsed timer into a leaf driven by a shared value

Audit A7. The clock lived in MatchScreen's useState and re-rendered the
whole screen — court, rails, ribbon, rally dots — once a second for the
length of a match. uiautomator could never find the window idle, so the
scoring screen was the one screen the audit could not dump."
```

---

### Task 3: Measure that the scoring screen now goes idle

Task 2 is a hypothesis about *why* `uiautomator` could not dump this screen. This task is the measurement. It gates H6 and M8 evidence, so it gets its own review.

**Files:**
- Modify: `src/screens/MatchScreen.tsx` — **only if Step 3 fails.**

**Interfaces:**
- Consumes: Task 2's `ElapsedChip`.
- Produces: a known-good `uiautomator dump` on the scoring screen, which Task 10 depends on.

- [ ] **Step 1: Open a live match on the device**

With Metro running, start a match and leave the scoring screen in `playing` phase for at least 15 seconds so several ticks have landed.

- [ ] **Step 2: Dump the tree**

```bash
adb shell uiautomator dump /sdcard/window_dump.xml; echo "EXIT_CODE=$?"
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server` — the handle drops intermittently (AUDIT.md §7).

- [ ] **Step 3: Check the result**

Expected: `UI hierchary dumped to: /sdcard/window_dump.xml` and `EXIT_CODE=0`.

Failure looks like `ERROR: could not get idle state.` — the exact string in audit A7.

**If it passed, skip to Step 5.** Record in your report that the leaf extraction alone was sufficient.

- [ ] **Step 4: Only if it still fails — quiet the chip's accessibility events**

A passing dump needs the window to emit no content-change events for the idle threshold. If the leaf extraction was not enough, the remaining source is the text node itself: every value change fires `TYPE_WINDOW_CONTENT_CHANGED`.

In `src/components/ElapsedChip.tsx`, mark the ticking node non-important for accessibility while keeping the chip itself labelled:

```typescript
      <AnimatedTextInput
        style={s.text}
        animatedProps={animatedProps}
        editable={false}
        caretHidden
        focusable={false}
        underlineColorAndroid="transparent"
        defaultValue={formatElapsed(0)}
        // The ticking value is what keeps the window from reaching idle, which
        // is what blocks uiautomator (audit A7). The chip above still carries
        // "Elapsed match time" as its label, so the control is still reachable;
        // its live value is not announced. That trade is deliberate.
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
```

Then re-run Step 2. Record the trade-off in the Task 10 verification note — an a11y phase that quietly drops a value from the tree must say so out loud.

- [ ] **Step 5: Confirm the dump has real content**

```bash
adb shell cat /sdcard/window_dump.xml | head -c 400
```

Expected: XML containing node entries, not an empty or truncated file. A zero-byte dump with exit code 0 is a false pass.

- [ ] **Step 6: Commit only if Step 4 changed something**

If Step 3 passed, there is nothing to commit — say so and move on.

```bash
git add src/components/ElapsedChip.tsx
git commit -m "fix(match): stop the elapsed chip emitting a11y events on every tick

The leaf extraction alone did not let uiautomator reach idle; the ticking
text node's content-change events did. Closes audit A7."
```

---

# H6 — ORIENTATION CONTRACT

---

### Task 4: Pure orientation-lock mapping

The bug this phase fixes is one line: `MatchScreen.tsx:55` restores with `unlockAsync()`, which hands orientation back to the device sensors rather than forcing portrait. Leave a match while the phone is sideways and Home, Matches and the tab bar all render in landscape, where they are badly broken (audit H6).

Spec §10 asks for a Jest test on the orientation contract. The contract is a mapping, so the mapping is extracted and the *restore* target becomes a named constant with a test that pins it — the point is that a future edit cannot quietly turn it back into an unlock.

**Files:**
- Create: `src/lib/orientationLock.ts`
- Test: `tests/orientationLock.test.ts`

**Interfaces:**
- Consumes: nothing. Deliberately does **not** import `expo-screen-orientation` — that module pulls native code into a node-env test.
- Produces: `type OrientationMode = "auto" | "portrait" | "landscape"`, `type LockTarget = "LANDSCAPE" | "PORTRAIT_UP" | "UNLOCK"`, `lockForMode(mode: OrientationMode): LockTarget`, `RESTORE_ON_BLUR: LockTarget`, `DEFAULT_SCORING_MODE: OrientationMode`. Task 5 consumes all of them.

- [ ] **Step 1: Write the failing test**

Create `tests/orientationLock.test.ts`:

```typescript
import {
  DEFAULT_SCORING_MODE,
  lockForMode,
  RESTORE_ON_BLUR,
  type OrientationMode,
} from "../src/lib/orientationLock";

describe("lockForMode", () => {
  it("locks landscape for the landscape mode", () => {
    expect(lockForMode("landscape")).toBe("LANDSCAPE");
  });

  it("locks portrait-up for the portrait mode", () => {
    expect(lockForMode("portrait")).toBe("PORTRAIT_UP");
  });

  it("releases the lock for auto, which is what auto means", () => {
    expect(lockForMode("auto")).toBe("UNLOCK");
  });

  it("returns a target for every mode the picker can produce", () => {
    const modes: OrientationMode[] = ["auto", "portrait", "landscape"];
    for (const mode of modes) expect(lockForMode(mode)).toBeTruthy();
  });
});

describe("RESTORE_ON_BLUR", () => {
  it("forces portrait-up", () => {
    expect(RESTORE_ON_BLUR).toBe("PORTRAIT_UP");
  });

  it("is never an unlock", () => {
    // This is the entire bug in audit H6. MatchScreen restored with
    // unlockAsync(), which hands orientation to the sensors instead of forcing
    // portrait, so leaving a match sideways stranded every other screen in
    // landscape. If this assertion ever fails, H6 has regressed.
    expect(RESTORE_ON_BLUR).not.toBe("UNLOCK");
  });

  it("does not depend on which mode the match was being scored in", () => {
    // Unmount, back gesture, pause and crash-recovery must all restore the
    // same way (spec section 4), so the restore is a constant, not a function
    // of state.
    expect(typeof RESTORE_ON_BLUR).toBe("string");
  });
});

describe("DEFAULT_SCORING_MODE", () => {
  it("is landscape", () => {
    // Spec 4a: landscape is the default the scoring screen takes on focus,
    // replacing the old unlockAsync(). The picker can still override it.
    expect(DEFAULT_SCORING_MODE).toBe("landscape");
  });

  it("maps to an actual landscape lock", () => {
    expect(lockForMode(DEFAULT_SCORING_MODE)).toBe("LANDSCAPE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/orientationLock.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/orientationLock'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/orientationLock.ts`:

```typescript
/**
 * The scoring screen's orientation contract, as data.
 *
 * Deliberately free of expo-screen-orientation: that module is native, and
 * keeping this pure is what lets the node-env Jest suite pin the contract
 * (spec section 10). MatchScreen translates these targets into lockAsync calls.
 *
 * Audit H6: the screen restored with unlockAsync() on unmount, which releases
 * orientation to the device sensors rather than forcing portrait. Leaving a
 * match sideways therefore left Home, Matches and the tab bar rendering in
 * landscape, where they clip content and run the CTA under system chrome.
 */
export type OrientationMode = "auto" | "portrait" | "landscape";

export type LockTarget = "LANDSCAPE" | "PORTRAIT_UP" | "UNLOCK";

/** What the scoring screen locks to while focused, per picker mode. */
export function lockForMode(mode: OrientationMode): LockTarget {
  switch (mode) {
    case "landscape":
      return "LANDSCAPE";
    case "portrait":
      return "PORTRAIT_UP";
    case "auto":
      return "UNLOCK";
  }
}

/**
 * What a blur restores, whatever the match was being scored in. A constant and
 * not a function, because unmount, the back gesture, pause, a deep link and
 * crash recovery must all restore identically (spec section 4).
 */
export const RESTORE_ON_BLUR: LockTarget = "PORTRAIT_UP";

/**
 * The mode the scoring screen starts in. Landscape gives the court the most
 * room; the picker can still override to portrait or auto mid-match, which is
 * why the picker is kept rather than replaced by a hard lock (spec 4a).
 */
export const DEFAULT_SCORING_MODE: OrientationMode = "landscape";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/orientationLock.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/lib/orientationLock.ts tests/orientationLock.test.ts
git commit -m "feat(match): pin the scoring orientation contract as testable data"
```

---

### Task 5: Restore portrait on blur, default to landscape on focus (H6)

**Files:**
- Modify: `src/screens/MatchScreen.tsx:1` (imports), `:6` (router import line), `:48-72` (orientation state and picker)

**Interfaces:**
- Consumes: `lockForMode`, `RESTORE_ON_BLUR`, `DEFAULT_SCORING_MODE`, `OrientationMode` from Task 4; `useFocusEffect` from `expo-router`.
- Produces: nothing consumed downstream. Task 6 adds pause beside this state.

- [ ] **Step 1: Add the imports**

In `src/screens/MatchScreen.tsx`, extend the `expo-router` import at line 6:

```typescript
import { useFocusEffect, useRouter } from "expo-router";
```

and add beside the other `src/` imports:

```typescript
import {
  DEFAULT_SCORING_MODE,
  lockForMode,
  RESTORE_ON_BLUR,
  type LockTarget,
  type OrientationMode,
} from "../lib/orientationLock";
```

- [ ] **Step 2: Add the translator**

Above the `MatchScreen` component, after the `announcement` function, add the one place that turns a `LockTarget` into a native call:

```typescript
/** The single bridge from the pure contract to expo-screen-orientation. */
function applyLock(target: LockTarget): void {
  const p =
    target === "UNLOCK"
      ? ScreenOrientation.unlockAsync()
      : target === "LANDSCAPE"
      ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  // Rotation can legitimately fail (a foldable mid-fold, a policy-locked
  // device). Failing to rotate is survivable; crashing the scoring screen is
  // not.
  p.catch(() => {});
}
```

- [ ] **Step 3: Replace the mount effect with a focus effect**

Replace lines 48-65 — the `orientationMode` state, the mount `useEffect`, and `setOrientation` — with:

```typescript
  const [orientationMode, setOrientationMode] = useState<OrientationMode>(DEFAULT_SCORING_MODE);
  const [orientationSheetOpen, setOrientationSheetOpen] = useState(false);

  // useFocusEffect, not useEffect: the cleanup has to run when this screen is
  // merely covered as well as when it unmounts, so the back gesture, a deep
  // link and a pause all restore identically (spec section 4).
  //
  // The cleanup is RESTORE_ON_BLUR and never unlockAsync(). That single line is
  // audit H6: unlocking hands orientation to the sensors, so leaving a match
  // sideways left every other screen — none of which has a landscape layout —
  // rendering in landscape.
  useFocusEffect(
    useCallback(() => {
      applyLock(lockForMode(orientationMode));
      return () => applyLock(RESTORE_ON_BLUR);
    }, [orientationMode])
  );

  const setOrientation = (mode: OrientationMode) => {
    setOrientationMode(mode);
    setOrientationSheetOpen(false);
    // No applyLock here: the focus effect re-runs on orientationMode and is the
    // only caller, so the lock has exactly one owner.
  };
```

- [ ] **Step 4: Retype the picker's option list**

At lines 67-71 the option array repeats the mode union inline. Point it at the shared type instead:

```typescript
  const ORIENTATION_OPTIONS: { mode: OrientationMode; icon: IconName; label: string }[] = [
    { mode: "auto", icon: "screen-rotation", label: "Auto" },
    { mode: "portrait", icon: "phone-portrait-outline", label: "Portrait" },
    { mode: "landscape", icon: "phone-landscape-outline", label: "Landscape" },
  ];
```

`orientationLabel` at line 66 and `orientationIcon` at line 72 are unchanged.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. `useCallback` is already imported at line 1. If `useEffect` is now reported unused, that is wrong — the `open(matchId)` effect at line 86 still uses it.

- [ ] **Step 6: Verify the contract on device**

Reload Metro, then walk every exit the spec names. After each one, look at the screen you land on:

| Exit | How | Passes when |
|---|---|---|
| Enter | Start a match | Screen rotates to landscape without touching the picker |
| Picker override | Picker → Portrait | Screen rotates to portrait; the portrait layout branch renders (`+1` rails under the court) |
| Back gesture | Swipe back while sideways | The screen behind is **portrait** |
| End match | End → confirm | Lands portrait |
| Deep link out | `adb shell am start -a android.intent.action.VIEW -d "badminton://" ` while sideways | Lands portrait |
| Kill and relaunch | Force-stop the app while sideways, reopen | Home opens portrait |

The failing baseline is `29-matches-live-landscape.png`, where Matches and the tab bar rendered sideways after a pause.

- [ ] **Step 7: Commit**

```bash
git add src/screens/MatchScreen.tsx
git commit -m "fix(match): restore portrait on blur instead of releasing the lock

Closes the orientation half of audit H6. The screen restored with
unlockAsync(), which hands orientation back to the sensors rather than
forcing portrait, so leaving a match sideways left Home, Matches and the
tab bar rendering in landscape where none of them has a layout. Moves to
useFocusEffect so the back gesture and deep links restore the same way,
and takes landscape as the default the picker starts from."
```

---

### Task 6: Pause becomes a paused state, not an exit (H6)

`MatchScreen.tsx:239` labels a button "Pause and leave (match stays live)" and calls `router.back()`. The audit read that as the pause control, because it is drawn as one: `<Icon name="pause" />`. Tapping it lands on Home. Combined with the old orientation leak, Home then rendered in landscape — the two halves of H6.

Pause now means paused: an overlay that blocks scoring, a Resume affordance, and elapsed time that excludes the paused span. Leaving the match keeps its own control.

**Files:**
- Modify: `src/screens/MatchScreen.tsx` — state beside the orientation state, `rightGroup` at `:237-247`, `scoreBlock` at `:258`, the root render at `:285-324`, styles at `:327`

**Interfaces:**
- Consumes: `ElapsedChip` from Task 2; `MIN_TOUCH`, `space`, `F` from `src/theme`. It does **not** import from `src/lib/elapsed` — this task owns the raw accumulator and `ElapsedChip` does the arithmetic.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the pause state**

Below the orientation state added in Task 5, add:

```typescript
  // Local and non-persisted, deliberately. MatchEvent is reduced by the engine,
  // synced to Supabase and replayed by undo and autoFinish; a UI affordance must
  // not reach any of that (spec 4a). Pause means "stay on this screen", so it
  // does not need to survive unmount.
  const [pausedMs, setPausedMs] = useState(0);
  const [pausedSince, setPausedSince] = useState<number | null>(null);
  const paused = pausedSince !== null;

  const togglePause = useCallback(() => {
    const now = Date.now();
    if (pausedSince === null) {
      setPausedSince(now);
      return;
    }
    // Bank the span that just closed, then clear the open one. Both setters are
    // called from the handler rather than from inside an updater: React invokes
    // updaters twice in development, which would double-bank the span.
    setPausedMs((banked) => banked + (now - pausedSince));
    setPausedSince(null);
  }, [pausedSince]);
```

- [ ] **Step 2: Feed the chip real values**

In `scoreBlock`, change the line Task 2 added:

```typescript
      <ElapsedChip startedAt={startedAt} pausedMs={pausedMs} pausedSince={pausedSince} />
```

- [ ] **Step 3: Block scoring while paused**

`playing` at line 134 is what gates the `+1` rails and the serve bubble. Fold pause into it:

```typescript
  const playing = !banner && !paused;
```

Both rails already read `disabled={!playing}` and dim with `s.railDisabled`, so this alone makes them inert and visibly so. Undo and redo also need gating — in `leftGroup` at lines 206-211, add `paused` to each disabled expression:

```typescript
      <PressableScale style={[s.iconBtn, (paused || events.length < 2) && s.iconDisabled]} disabled={paused || events.length < 2} onPress={undo} accessibilityLabel="Undo last rally">
        <Icon name="arrow-undo" color={C.text} size={18} />
      </PressableScale>
      <PressableScale style={[s.iconBtn, (paused || redoStack.length === 0) && s.iconDisabled]} disabled={paused || redoStack.length === 0} onPress={redo} accessibilityLabel="Redo rally">
        <Icon name="arrow-redo" color={C.text} size={18} />
      </PressableScale>
```

Note both gain a real `disabled` prop — the originals only dimmed, so a greyed Undo was still tappable. That is a genuine bug found in passing and it is in scope, because pause is worthless if the paused screen still accepts an undo.

- [ ] **Step 4: Rewrite the right-hand control group**

Replace `rightGroup` at lines 237-247:

```typescript
  const rightGroup = (
    <View style={s.group}>
      <PressableScale
        style={[s.iconBtn, paused && s.iconBtnOn]}
        onPress={togglePause}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={paused ? "Resume match" : "Pause match"}
        accessibilityState={{ selected: paused }}
      >
        <Icon name={paused ? "play" : "pause"} color={C.text} size={20} />
      </PressableScale>
      <PressableScale
        style={s.iconBtn}
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Leave match — it stays live and can be resumed from Matches"
      >
        <Icon name="chevron-back" color={C.text} size={20} />
      </PressableScale>
      <PressableScale style={s.endBtn} onPress={confirmEnd} accessibilityLabel="End match">
        <Icon name="flag" color={C.text} size={15} />
        <Text style={s.endText}>End</Text>
      </PressableScale>
    </View>
  );
```

Pause and leave are now two controls with two labels. The old single control did both and was labelled as both, which is what made H6 read as a dead-end.

- [ ] **Step 5: Add the paused overlay**

In the root render, immediately before the `state.phase === "match_over"` block at line 318, add:

```typescript
      {paused && (
        <Pressable
          style={s.pausedScrim}
          onPress={togglePause}
          accessibilityRole="button"
          accessibilityLabel="Match paused. Tap to resume."
        >
          <View style={s.pausedCard}>
            <Icon name="pause" color={C.text} size={28} />
            <Text style={s.pausedTitle}>Paused</Text>
            <Text style={s.pausedHint}>The clock is stopped. Tap anywhere to resume.</Text>
          </View>
        </Pressable>
      )}
```

The whole scrim is the resume target rather than a small button: it covers the `+1` rails, so anything a user reaches for while paused should resume rather than do nothing.

- [ ] **Step 6: Add the styles**

Add `MIN_TOUCH` and `space` to the existing `../theme` import, then add to the `StyleSheet.create` block:

```typescript
  iconBtnOn: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.lineHi },
  // absoluteFillObject rather than a sized box: the scrim has to cover the +1
  // rails in both the portrait and landscape layouts.
  pausedScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center", justifyContent: "center",
    zIndex: 30,
  },
  pausedCard: {
    alignItems: "center", gap: space.sm,
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.lineHi,
    paddingHorizontal: space.xl, paddingVertical: space.lg,
    minHeight: MIN_TOUCH,
  },
  pausedTitle: { color: C.text, fontFamily: F.display, fontSize: 22, letterSpacing: 0.5 },
  pausedHint: { color: C.text2, fontFamily: F.body, fontSize: 14, textAlign: "center" },
```

`iconBtnOn` uses the neutral `C.cardHi` / `C.lineHi` pair, matching the `selected` recipe from Phase 0 — a paused toggle is a state, not a primary action, so it takes no hue.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `Pressable` is reported missing, it is already imported at line 2. If `chevron-back` or `play` is rejected by `IconName`, both are declared in `src/components/Icon.tsx:28,31` — the error is a typo.

- [ ] **Step 8: Verify on device**

Reload, start a match, score two points, then tap pause. Check all of:

- The scrim covers the court and both `+1` rails, and the rails are visibly dimmed.
- The elapsed chip **stops advancing** and holds its value.
- Tapping a `+1` rail does nothing. Tapping Undo does nothing.
- Tapping anywhere resumes; the chip continues from where it stopped, not from where wall-clock would have been.
- Pause for ~20 seconds, resume, and confirm the chip is ~20 seconds behind wall clock since the match began.
- The screen does **not** navigate anywhere at any point.

Baseline is `28-scoring-paused.png`, which showed the Home tab.

- [ ] **Step 9: Commit**

```bash
git add src/screens/MatchScreen.tsx
git commit -m "fix(match): pause the match instead of leaving it

Closes the lifecycle half of audit H6. The pause-labelled control called
router.back(), so pausing landed on Home. Pause now shows a scrim, blocks
scoring, undo and redo, and stops the clock; leaving gets its own control
and its own label. Paused time is a local accumulator, never a MatchEvent."
```

---

# M8 — SCOREBOARD

---

### Task 7: Diagnose and fix the filled `0` glyph (M8)

The audit reports that `0` renders as a filled coloured rounded rectangle while `1` renders as a plain numeral, so `1 – 0` reads as two different kinds of object.

The working hypothesis (spec §4a) is that this is not a font defect. `ribbonScore` at `MatchScreen.tsx:269-271` carries `textGlow(C.red, 16)` — `textShadowRadius: 16` on a `fontSize: 32` Russo One numeral. That font's `0` has a small counter, and a 16px bloom fills it in; `1` is a thin stroke with no counter to fill, so it survives.

**Diagnose before fixing.** A fix applied to the wrong cause here is invisible until someone reads a scoreboard from across a court.

**Files:**
- Modify: `src/screens/MatchScreen.tsx:269-271` (score render)

**Interfaces:**
- Consumes: `textGlow` from `src/theme` (existing).
- Produces: nothing consumed downstream. Task 8 changes the same lines' font size and must be applied after this one.

- [ ] **Step 1: Reproduce the defect**

Open a live match at `0 – 0` and screenshot it. Confirm both zeros render as filled blocks. Compare `docs/audit/2026-08-12-ux-audit/screens/26-scoring.png`.

- [ ] **Step 2: Test the hypothesis by removing the glow**

Temporarily strip the glow from both score `Text` nodes:

```typescript
        <Text style={[s.ribbonScore, { color: C.red }]}>{state.score.A}</Text>
        <Text style={s.scoreDivider}>—</Text>
        <Text style={[s.ribbonScore, { color: C.blue }]}>{state.score.B}</Text>
```

Reload and look at `0 – 0`.

- [ ] **Step 3: Branch on what you saw**

**If the `0` now renders as an open numeral** — the hypothesis holds. Restore a glow narrow enough to leave the counter open. Keep it proportional to the digit rather than fixed, since Task 8 makes the digits much larger:

```typescript
        <Text style={[s.ribbonScore, { color: C.red }, textGlow(C.red, 6)]}>{state.score.A}</Text>
        <Text style={s.scoreDivider}>—</Text>
        <Text style={[s.ribbonScore, { color: C.blue }, textGlow(C.blue, 6)]}>{state.score.B}</Text>
```

Reload and confirm at `0 – 0` that the counter is still open and the glow still reads. If 6 still fills it, step down to 4, then to 0 (no glow) — legibility wins over the effect, and the spec's motion/visual rules never promised a glow on the score.

**If the `0` still renders filled with no glow at all** — the hypothesis is wrong and it is the font. Fall back to a family whose zero survives at this size, on the score digits only:

```typescript
  ribbonScore: {
    minWidth: 42, color: C.text, fontSize: 32, fontFamily: F.bold,
    textAlign: "center", fontVariant: ["tabular-nums"],
  },
```

`F.bold` is the body stack's bold rather than the display face; it keeps tabular figures and loses only the display character on two glyphs. Record in your report that the glow hypothesis was disproved so the spec's §4a note can be corrected.

- [ ] **Step 4: Verify at every score width**

Score points until the board reads `10 – 0`, then `10 – 10`. Confirm every digit reads as a numeral, that `0` and `8` are distinguishable, and that the ribbon does not reflow as digits are added — `fontVariant: ["tabular-nums"]` should hold the width.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
```

```bash
git add src/screens/MatchScreen.tsx
git commit -m "fix(match): stop the score zero rendering as a filled block

Half of audit M8. A 16px text glow on a 32px Russo One numeral floods the
zero's counter, so 1 - 0 read as a numeral next to a coloured rectangle."
```

---

### Task 8: Make the score the dominant element (M8)

Measured from the current styles: score `32`, `+1` rail text `26`, team name `15`, timer `12`. The score is only 6pt ahead of the `+1` label and sits inside a 46dp ribbon, while the rails occupy whole columns — which is why the audit read the score as *smaller* than the buttons. For a board read from across a court, the score has to win by a lot.

The scale goes into `src/theme.ts` so the hierarchy is a testable property rather than four numbers scattered through a StyleSheet.

**Files:**
- Modify: `src/theme.ts` (append), `src/screens/MatchScreen.tsx:358-371` and `:388-390` (styles)
- Test: `tests/scoreboardType.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SCOREBOARD_TYPE: { score: 56; divider: 26; rail: 22; name: 13; timer: 12 }` from `src/theme.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/scoreboardType.test.ts`:

```typescript
import { SCOREBOARD_TYPE as T } from "../src/theme";

describe("scoreboard type scale", () => {
  it("makes the score the largest thing on the screen", () => {
    // Audit M8: the score was 32pt against a 26pt +1 label, so the buttons read
    // as the dominant element on a board meant to be read from across a court.
    expect(T.score).toBeGreaterThan(T.rail);
    expect(T.score).toBeGreaterThan(T.name);
    expect(T.score).toBeGreaterThan(T.timer);
    expect(T.score).toBeGreaterThan(T.divider);
  });

  it("puts real distance between the score and the +1 buttons", () => {
    // A few points of difference is not a hierarchy at arm's length.
    expect(T.score / T.rail).toBeGreaterThanOrEqual(2);
  });

  it("keeps the elapsed chip the quietest element", () => {
    expect(T.timer).toBeLessThanOrEqual(T.name);
  });

  it("keeps player names subordinate to the +1 labels", () => {
    expect(T.name).toBeLessThan(T.rail);
  });

  it("is whole points throughout", () => {
    for (const v of Object.values(T)) expect(Number.isInteger(v)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/scoreboardType.test.ts`
Expected: FAIL — `SCOREBOARD_TYPE` is not exported from `src/theme`.

- [ ] **Step 3: Add the scale**

Append to `src/theme.ts`, after the `selected` block:

```typescript
/**
 * Scoreboard type scale, in points.
 *
 * Lives here rather than in MatchScreen's StyleSheet so the hierarchy is
 * asserted in tests. Audit M8: the score was 32pt against a 26pt "+1" label and
 * 15pt names, so on a board meant to be read from across a court the buttons
 * were the dominant element.
 */
export const SCOREBOARD_TYPE = {
  score: 56,
  divider: 26,
  rail: 22,
  name: 13,
  timer: 12,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/scoreboardType.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Apply the scale to the scoreboard**

Add `SCOREBOARD_TYPE` to the `../theme` import in `src/screens/MatchScreen.tsx`, then change these four style entries. `ribbonScore` also needs a wider `minWidth` — two 56pt tabular digits do not fit in 42 — and the ribbon needs to grow to hold them:

```typescript
  scoreRibbon: {
    alignSelf: "stretch", minHeight: 72, flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.lineHi,
    overflow: "hidden",
  },
  ribbonName: { flexShrink: 1, fontSize: SCOREBOARD_TYPE.name, fontFamily: F.semibold, letterSpacing: 0.3 },
  ribbonScore: {
    minWidth: 72, color: C.text, fontSize: SCOREBOARD_TYPE.score, fontFamily: F.display,
    textAlign: "center", fontVariant: ["tabular-nums"],
  },
  scoreDivider: { color: C.text3, fontSize: SCOREBOARD_TYPE.divider, marginHorizontal: 2 },
```

and the rail label at line 390:

```typescript
  railText: { color: C.text, fontSize: SCOREBOARD_TYPE.rail, fontFamily: F.display, ...textGlow(C.text, 8) },
```

If Task 7 chose the `F.bold` fallback, keep that `fontFamily` here rather than reverting it to `F.display`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Verify both layouts on device**

Reload and check landscape first, then use the picker to switch to portrait.

- Landscape: the ribbon is one row — name, score, dash, score, name — with nothing clipped and nothing wrapped. Long team names truncate with an ellipsis (`ribbonName` already has `numberOfLines={1}` at `:267,273`) rather than pushing the digits.
- Portrait: the ribbon sits above the court and still fits on a 360dp screen. If two 56pt digits plus two names overflow at 360dp, reduce `SCOREBOARD_TYPE.score` to `48` and re-run the test — it still clears the 2× rule against `rail: 22`. Do **not** fix an overflow by shrinking `minWidth` below the digits' natural width; that reintroduces the reflow.
- Score to `10 – 10` and confirm the two-digit case does not clip.

Compare `26-scoring.png` and `27-scoring-point.png`.

- [ ] **Step 8: Commit**

```bash
git add src/theme.ts src/screens/MatchScreen.tsx tests/scoreboardType.test.ts
git commit -m "feat(match): make the score dominate the scoreboard

Closes audit M8. The score was 32pt against a 26pt +1 label and 15pt
names, so the buttons read as the dominant element on a board meant to be
read from across a court. The scale moves into theme so the hierarchy is
asserted in a test rather than eyeballed."
```

---

# FOUND BUG

---

### Task 9: The Ops screen's navigation header shows its filename

`app/(app)/tournaments/_layout.tsx` declares `Stack.Screen` entries for `index`, `new`, `[id]` and `edit/[id]`, but **not** for `ops/[tournamentId]`. Expo Router falls back to the route segment, so the navigation header renders the raw parameter name. The screen's own in-body header at `app/(app)/tournaments/ops/[tournamentId].tsx:75` already reads `Live Ops Dashboard` and is correct — this is the bar above it.

Renaming the concept "Ops" is a different problem: it is audit **M3** (tab `Cups`, screen `Tournaments`, button `New tournament`, detail `Bracket` — four names for one thing) and belongs to Phase 4, which will settle every one of those names together. This task makes the header say something human; Phase 4 decides what the something should be.

**Files:**
- Modify: `app/(app)/tournaments/_layout.tsx:22` (inside the `Stack`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the missing screen entry**

After the `edit/[id]` line, add:

```typescript
      {/* Without this the header falls back to the route segment and renders
          the raw parameter name. The screen's own heading already reads "Live
          Ops Dashboard". Renaming the concept itself is audit M3, phase 4. */}
      <Stack.Screen name="ops/[tournamentId]" options={{ title: "Live ops" }} />
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify on device**

Open Cups → a **live** tournament (Ops only renders for an admin on a non-draft bracket, `[id].tsx:349`) → Ops.
Expected: the navigation header reads `Live ops`. The body still reads `Live Ops Dashboard`.

Capture a screenshot for Task 10 — this bug has no audit baseline, so the after-shot is the whole record.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/tournaments/_layout.tsx"
git commit -m "fix(tournaments): give the ops route a title instead of its filename

The tournaments Stack declared no screen for ops/[tournamentId], so expo
router titled the header from the route segment and shipped a raw
parameter name to users."
```

---

# VERIFICATION

---

### Task 10: Phase 2 verification re-audit

A phase is done when every finding it claims has a paired before/after (spec §10).

**Files:**
- Create: `docs/audit/verify/phase-2/` and its contents.

**Interfaces:**
- Consumes: the working `uiautomator dump` established in Task 3.

- [ ] **Step 1: Bring the environment up**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server` (AUDIT.md §7).

- [ ] **Step 2: Check the audit's leftover test data**

Phase 1's Task 16 either removed or explicitly retained the audit's fixtures — a completed doubles match `Ut / UtkarshAgrawal 1 – 0 Utki / Soham Deo` in the `Weekend` club and a free-text player named `Ut`. Read `docs/audit/verify/phase-1/README.md` and do the same thing here, so the two phases' diffs are comparable.

- [ ] **Step 3: Capture the evidence**

Into `docs/audit/verify/phase-2/`, named after the baseline each answers:

| Finding | Baseline | Capture as | Passes when |
|---|---|---|---|
| A7 | (no screenshot — §26–27 could not be dumped) | `a7-scoring-tree.xml` | `uiautomator dump` exits 0 with real XML content while a match is running |
| H6 orientation | `29-matches-live-landscape.png` | `h6-29-back-to-portrait.png` | Leaving a match while sideways lands on a **portrait** screen |
| H6 pause | `28-scoring-paused.png` | `h6-28-paused.png`, `h6-28-resumed.png` | Pause shows the scrim and does not navigate; the clock is frozen in one shot and advanced in the other |
| M8 | `26-scoring.png`, `27-scoring-point.png` | `m8-26-scoring.png`, `m8-27-scoring-point.png` | Score digits are visibly the largest element; `0` reads as a numeral |
| Ops header | none — new bug | `ops-header.png` | Navigation header reads `Live ops`, not a route segment |

Also capture `a7-scoring-tree.xml` **before** doing anything else on the scoring screen — it is the artifact the whole phase was sequenced around.

- [ ] **Step 4: Write the verification note**

Create `docs/audit/verify/phase-2/README.md` listing each finding, its baseline, its capture, and pass/fail. Record explicitly:

- Whether Task 3 needed its Step 4 fallback, and if so that the elapsed value is no longer in the accessibility tree.
- Which branch Task 7 took, and therefore whether the spec §4a glow hypothesis was confirmed or disproved.
- Whether `SCOREBOARD_TYPE.score` stayed at 56 or was reduced for the 360dp portrait case.
- Anything that did not close, and why. A finding that survived is a fact for Phase 3's plan, not a failure to hide.

- [ ] **Step 5: Run the full suite**

```bash
npx jest
```

```bash
npx tsc --noEmit
```

Expected: both PASS. The suite now includes `elapsed`, `orientationLock` and `scoreboardType` alongside everything from Phases 0 and 1.

- [ ] **Step 6: Commit**

```bash
git add docs/audit/verify/phase-2
git commit -m "docs(audit): verify phase 2 closes H6, M8, A7"
```

---

## Not in this plan

**Restructuring the Profile screen.** Reported separately from the audit: the screen is one long scroll and wants tabs, collapsible sections, or content moved elsewhere. This is an information-architecture decision, not a fix — it needs its own brainstorm covering what belongs on Profile at all, and it re-opens P4 (Phase 1, already verified), M5 and P3 (Phase 5). Designing it inside a scoring-screen plan would be designing it badly. Open questions to start from: does the achievement grid belong on Profile or on its own screen; are tabs or accordions right for a screen reached from a tab bar that already has five tabs; what does the P4 bottom-inset fix look like under a tabbed layout.

**Starting a quick match from a Friends row.** Also reported separately: each friend row should offer a direct "play a match with this person". This is a new feature with real product decisions — what save-scope a match started this way takes (personal, or a club both people are in, and what happens when there is more than one); whether it defaults to singles or doubles and who fills the other two slots in doubles; whether it pre-fills New match or skips straight to scoring; what happens when the friend is not a registered player in the chosen scope. It is adjacent to **P10** (Phase 5), which adds the field label, search and pending-requests section to Friends, so the two should at least be brainstormed with each other in view.

**Everything routed to an existing phase.** Four other separately-reported complaints already have owners and are deliberately left there so regressions stay attributable to one phase (spec §11):
- Home's `Longest Streak` value sitting below its neighbours' baseline is **P1**, Phase 5 — the audit recorded it as "wraps to two lines, dropping its value ~30px".
- The New tournament screen's clutter is **H7**, Phase 4 (the `Semis onward` chip physically overlapped by the Courts stepper, and the two-line `Games / match` label knocking its row off the shared baseline), and its entrant rows are **P13**, Phase 5.
- "Ops" being a confusing name is **M3**, Phase 4, which settles `Cups` / `Tournaments` / `New tournament` / `Bracket` / `Ops` as one vocabulary rather than renaming one of them in isolation.
- The Brackets screen reading as dull and non-interactive is a visual-design pass and is a **Phase 4 carry-forward** — Phase 4 already owns the largest visual diff and runs after 1–3 are verified precisely so this kind of change is attributable.

**The `iconBtn` touch target.** The scoring toolbar's buttons are `46×40dp`, under the 48dp floor. Task 6 gives the pause control `hitSlop={10}`, but the class fix across the toolbar is Phase 6's measured accessibility sweep. Raising them here would change the landscape toolbar's height and make this phase's before/after screenshots harder to read.
