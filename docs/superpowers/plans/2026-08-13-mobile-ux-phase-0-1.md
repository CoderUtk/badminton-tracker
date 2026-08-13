# Mobile UX Refinement — Phases 0 & 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design-token and primitive layer, then fix every keyboard-occlusion, safe-area, touch-target and sheet-layering finding on Android 15 edge-to-edge.

**Architecture:** Phase 0 adds semantic tokens and five primitives to `src/theme.ts` and `src/components/`, changing no screen. Phase 1 applies them: `react-native-keyboard-controller` drives a Reanimated `translateY` on the New match court so the focused field clears the IME, sheets move into a native `Modal` so they cover the tab bar, and every docked CTA consumes its bottom inset. All logic that can be pure is extracted into `src/lib/` so the existing node-env Jest suite can test it.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, `react-native-reanimated` ~4.1.1, `react-native-safe-area-context` ~5.6.0, `react-native-gesture-handler` ~2.28.0, `react-native-keyboard-controller` (new, ~1.22.3), Jest 29 + ts-jest.

**Spec:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md`
**Audit baseline:** `docs/audit/2026-08-12-ux-audit/`

## Global Constraints

- **Findings closed by this plan:** Phase 0 enables A4, A8, M1, M2, M4. Phase 1 closes **H1, H2, H3, M4, M10, A4, P4**.
- **Test environment is node-only.** `jest.config.js` sets `testEnvironment: "node"` and `roots: ["<rootDir>/tests"]`. There is no `react-test-renderer` or `@testing-library/react-native`. **Do not add one in this plan.** Any logic that needs a test gets extracted into `src/lib/` as a pure function. Component behaviour is verified on-device via mobile-mcp in Task 15.
- **Animate `transform` and `opacity` only.** Never animate `width`, `height`, `padding`, `margin`, or any layout property.
- **8pt spacing grid.** All new margins, padding and gaps come from `space` (4, 8, 16, 24, 32).
- **Touch targets ≥48×48dp**, via real bounds or `hitSlop`.
- **`C.red` as a `backgroundColor` means primary action only.** Destructive uses the `danger` outline recipe. Never introduce a red fill for a destructive control.
- **Selection carries no hue** — `C.cardHi` fill, `C.lineHi` border, `C.text` label.
- **Scope of the two colour rules above:** they bind code this plan **creates or restyles**. They are *not* a licence to repaint existing red selection surfaces — `SegmentedControl`'s indicator, the New match format segments, the session manual-pair slots and player chips all still fill red, and all of them are Phase 4's job. Phase 1's verification reads geometry and accessibility, not colour, so a repaint landing here would make its before/after screenshots unreadable. Leaving existing red selection in place is correct in this plan and must not be reported as a violation.
- **Commit with explicit pathspec.** Never `git add -A`, `git add .`, or `git commit -a`. No `Co-Authored-By` trailer.
- **Existing code style:** double-quoted strings, 2-space indent, `StyleSheet.create` assigned to a const named `s`, comments explain *why* not *what*.
- Run `npx tsc --noEmit` before every commit. It must pass.

---

## File Structure

**Created:**
- `src/lib/contrast.ts` — pure WCAG relative-luminance and contrast-ratio math. No React imports.
- `src/lib/keyboardShift.ts` — pure function computing how far the New match screen lifts for the IME. No React imports.
- `src/components/AppDialog.tsx` — themed confirm/cancel dialog replacing the native `AlertDialog`.
- `src/components/Chip.tsx` — 48dp-minimum selectable chip with `accessibilityState.selected`. The spec's other Phase 0 primitive, `Segment`, is not created: `src/components/SegmentedControl.tsx` already exists, so it is amended in place (Task 15) rather than duplicated.
- `src/components/Group.tsx` — non-card grouping surface.
- `src/hooks/useScreenInsets.ts` — bottom-inset helper for screens with a docked CTA.
- `tests/contrast.test.ts`, `tests/themeTokens.test.ts`, `tests/keyboardShift.test.ts`

**Modified:**
- `src/theme.ts` — adds `space`, `danger`, `selected`, `MIN_TOUCH`, `ghost`; corrects `text3`.
- `app/_layout.tsx:224` — adds `KeyboardProvider` inside `GestureHandlerRootView`.
- `app/new-match.tsx` — animated root, safe-area inset on the CTA.
- `src/components/Court.tsx` — panel clamp and covered-box suppression.
- `src/components/CourtBox.tsx` — accepts a `suppressed` prop.
- `src/components/Sheet.tsx`, `src/components/BottomPanel.tsx` — wrapped in `Modal`, close button added.
- `app/(app)/sessions/[id].tsx:376-381,456` — attendance chips to 48dp with a11y state.
- `src/components/SegmentedControl.tsx:35-44,52` — selected state exposed, items to 48dp.
- `app/(app)/profile/index.tsx` — bottom content inset.
- `app.json` — `react-native-keyboard-controller` plugin entry if required by the install.
- `package.json` — new dependency.

---

# PHASE 0 — FOUNDATIONS

No screen changes. Every task here is additive.

---

### Task 1: WCAG contrast utility

The audit's A8 says low-contrast text "needs measuring against 4.5:1". Measuring by eye is how it got this bad. This makes contrast a testable property so Task 2 can assert it and later phases cannot regress it.

**Files:**
- Create: `src/lib/contrast.ts`
- Test: `tests/contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`. Both accept 6-digit hex with a leading `#`, case-insensitive. Task 2 consumes `contrastRatio`.

- [ ] **Step 1: Write the failing test**

Create `tests/contrast.test.ts`:

```typescript
import { contrastRatio, relativeLuminance } from "../src/lib/contrast";

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("is case-insensitive", () => {
    expect(relativeLuminance("#ff3b30")).toBeCloseTo(relativeLuminance("#FF3B30"), 10);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black against white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
  });

  it("returns 1 for a colour against itself", () => {
    expect(contrastRatio("#5C6472", "#5C6472")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#0C0E12", "#838B9D")).toBeCloseTo(
      contrastRatio("#838B9D", "#0C0E12"), 10
    );
  });

  it("measures the audit's failing text3 against the app background", () => {
    // A8: #5C6472 on #0C0E12 is the low-contrast secondary text the audit flagged.
    expect(contrastRatio("#5C6472", "#0C0E12")).toBeCloseTo(3.24, 1);
  });

  it("throws on malformed input rather than returning a plausible number", () => {
    expect(() => contrastRatio("5C6472", "#0C0E12")).toThrow();
    expect(() => contrastRatio("#5C647", "#0C0E12")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/contrast.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/contrast'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/contrast.ts`:

```typescript
/**
 * WCAG 2.1 contrast math (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
 *
 * Exists so token contrast is asserted in tests rather than eyeballed — the
 * 2026-08-12 audit's A8 was entirely "looks a bit dim" until it was measured.
 */

/** Channel-wise sRGB -> linear-light transfer. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Expected 6-digit hex with leading #, got "${hex}"`);
  }
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/contrast.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/contrast.ts tests/contrast.test.ts
git commit -m "feat(theme): add WCAG contrast math so token legibility is testable"
```

---

### Task 2: Semantic tokens and the text3 correction

`text3` `#5C6472` measures **3.24:1** on `C.bg` and **2.90:1** on `C.cardHi`. Both fail AA. It cannot simply be darkened-in-place and stay a "third tier" — on this background, AA-compliant and much dimmer than `text2` are mutually exclusive. So `text3` moves to an AA value used for text, and the old value survives as `ghost` for decorative non-text use only (icon washes, inactive dots), never as a text colour.

**Files:**
- Modify: `src/theme.ts`
- Test: `tests/themeTokens.test.ts`

**Interfaces:**
- Consumes: `contrastRatio` from Task 1.
- Produces, all from `src/theme.ts`:
  - `C.text3: "#838B9D"` (changed from `#5C6472`)
  - `C.ghost: "#5C6472"` (new — decorative only)
  - `space: { xs: 4; sm: 8; md: 16; lg: 24; xl: 32 }`
  - `MIN_TOUCH: 48`
  - `danger: { backgroundColor: "transparent"; borderWidth: 1.5; borderColor: string }` and `dangerText: { color: string }`
  - `selected: { backgroundColor: string; borderWidth: 1; borderColor: string }` and `selectedText: { color: string }`, `unselectedText: { color: string }`

  Tasks 3, 4, 5, 6, 12 all consume these.

- [ ] **Step 1: Write the failing test**

Create `tests/themeTokens.test.ts`:

```typescript
import { contrastRatio } from "../src/lib/contrast";
import { C, MIN_TOUCH, danger, selected, space } from "../src/theme";

const AA = 4.5;
// Every surface body or secondary text can sit on.
const SURFACES = [C.bg, C.bgElev, C.card, C.cardHi] as const;

describe("text tokens meet WCAG AA on every surface", () => {
  for (const surface of SURFACES) {
    it(`text is AA on ${surface}`, () => {
      expect(contrastRatio(C.text, surface)).toBeGreaterThanOrEqual(AA);
    });
    it(`text2 is AA on ${surface}`, () => {
      expect(contrastRatio(C.text2, surface)).toBeGreaterThanOrEqual(AA);
    });
    it(`text3 is AA on ${surface}`, () => {
      expect(contrastRatio(C.text3, surface)).toBeGreaterThanOrEqual(AA);
    });
  }

  it("keeps text3 visibly dimmer than text2", () => {
    // Otherwise the third tier is decorative only and the hierarchy is a lie.
    expect(contrastRatio(C.text2, C.bg)).toBeGreaterThan(contrastRatio(C.text3, C.bg));
  });
});

describe("ghost is decorative only", () => {
  it("is the old failing text3 value, retained for non-text use", () => {
    expect(C.ghost).toBe("#5C6472");
  });
  it("does not meet AA, which is why it must never colour text", () => {
    expect(contrastRatio(C.ghost, C.bg)).toBeLessThan(AA);
  });
});

describe("spacing grid", () => {
  it("is the 8pt scale", () => {
    expect(space).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 });
  });
  it("has every value divisible by 4", () => {
    for (const v of Object.values(space)) expect(v % 4).toBe(0);
  });
});

describe("touch target floor", () => {
  it("is the Android 48dp minimum", () => {
    expect(MIN_TOUCH).toBe(48);
  });
});

describe("danger recipe", () => {
  it("never fills — a red fill means primary action", () => {
    expect(danger.backgroundColor).toBe("transparent");
  });
  it("outlines in brand red", () => {
    expect(danger.borderColor).toBe(C.red);
  });
});

describe("selected recipe", () => {
  it("carries no hue", () => {
    // Cyan was rejected: it already means DRAFT, and at higher luminance than
    // red it would make passive selection louder than the primary action.
    expect(selected.backgroundColor).toBe(C.cardHi);
    expect(selected.borderColor).toBe(C.lineHi);
    expect(selected.backgroundColor).not.toBe(C.accent);
    expect(selected.backgroundColor).not.toBe(C.red);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/themeTokens.test.ts`
Expected: FAIL — `space` is not exported from `src/theme`, and `text3` is `#5C6472` which fails the AA assertions.

- [ ] **Step 3: Write the implementation**

In `src/theme.ts`, change the `text3` line inside `C` and add `ghost` beneath it:

```typescript
  // text
  text: "#FFFFFF",
  text2: "#9BA3B2",
  // Raised from #5C6472, which measured 3.24:1 on bg and 2.90:1 on cardHi —
  // the root of audit finding A8. This is the dimmest slate that still clears
  // 4.5:1 on every surface in this palette.
  text3: "#838B9D",
  // The old text3. Decorative only — inactive dots, icon washes, hairlines.
  // Never colour text with this; it fails AA by design.
  ghost: "#5C6472",
```

Then append to the end of the file, after `press`:

```typescript
/** 8pt spatial grid. Every margin, padding and gap comes from here. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Android's minimum touch target, in dp. Applies on both axes. */
export const MIN_TOUCH = 48;

/**
 * Destructive recipe. Outlined, never filled: a red FILL means "primary
 * action" and nothing else, so Delete and Start a match can never look alike
 * (audit M2). Pair with dangerText and always confirm through AppDialog.
 */
export const danger = {
  backgroundColor: "transparent",
  borderWidth: 1.5,
  borderColor: C.red,
} as const;
export const dangerText = { color: C.red } as const;

/**
 * Selected state. Deliberately hueless — selection is a state, not an action,
 * so it gets elevation instead of colour. Cyan was considered and rejected: it
 * already means DRAFT, and its higher luminance would make a passive selected
 * chip louder than the primary CTA.
 */
export const selected = {
  backgroundColor: C.cardHi,
  borderWidth: 1,
  borderColor: C.lineHi,
} as const;
export const selectedText = { color: C.text } as const;
export const unselectedText = { color: C.text2 } as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/themeTokens.test.ts`
Expected: PASS. If any `text3` assertion still fails, raise `#838B9D` toward `#8B93A3` and re-run — do not lower the AA threshold.

- [ ] **Step 5: Run the whole suite to catch token fallout**

Run: `npx jest`
Expected: PASS. `text3` is a colour string, so no logic test should depend on its value; if one does, that test was asserting a design token and should be updated to the new value.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/theme.ts tests/themeTokens.test.ts
git commit -m "feat(theme): add space/danger/selected tokens and fix text3 contrast

text3 #5C6472 measured 3.24:1 on bg and 2.90:1 on cardHi, failing WCAG AA
on every surface — audit finding A8. Raised to #838B9D, which clears 4.5:1
everywhere. The old value survives as `ghost` for decorative non-text use."
```

---

### Task 3: AppDialog

Closes the primitive half of M1: "End match?" is currently an unstyled Android `AlertDialog` — grey surface, teal text buttons, default Roboto — dropped into a near-black red-accented app at the only irreversible action in the product. Phase 4 swaps the call sites; this task builds the replacement.

**Files:**
- Create: `src/components/AppDialog.tsx`

**Interfaces:**
- Consumes: `C`, `F`, `space`, `MIN_TOUCH`, `danger`, `dangerText` from `src/theme`; `PressableScale`.
- Produces: default export `AppDialog`, props `{ visible: boolean; title: string; message?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }`. Phase 4 consumes this.

- [ ] **Step 1: Write the component**

Create `src/components/AppDialog.tsx`:

```typescript
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import PressableScale from "./PressableScale";
import { C, F, MIN_TOUCH, danger, dangerText, space } from "../theme";

/**
 * Themed confirmation dialog. Replaces the native AlertDialog, which rendered
 * in stock Material grey/teal Roboto and broke the design language at the one
 * irreversible action in the app (audit M1).
 *
 * Rendered in a Modal so it sits above the bottom tab bar — the same layering
 * bug M10 describes for the bottom sheets.
 */
export default function AppDialog({
  visible, title, message, confirmLabel, cancelLabel = "Cancel",
  destructive = false, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <Animated.View
          entering={ZoomIn.springify().damping(18).mass(0.7)}
          style={s.card}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.message}>{message}</Text> : null}
          <View style={s.row}>
            <PressableScale
              style={[s.btn, s.cancel]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={s.cancelText}>{cancelLabel}</Text>
            </PressableScale>
            <PressableScale
              style={[s.btn, destructive ? danger : s.primary]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={[s.confirmText, destructive && dangerText]}>{confirmLabel}</Text>
            </PressableScale>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center", justifyContent: "center", padding: space.lg,
  },
  card: {
    width: "100%", maxWidth: 400,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.lineHi,
    padding: space.lg, gap: space.sm,
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, letterSpacing: 0.3 },
  message: { color: C.text2, fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  btn: {
    flex: 1, minHeight: MIN_TOUCH, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  // Cancel is the safe path, so it is the quiet one. Confirm carries the weight.
  cancel: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  cancelText: { color: C.text2, fontFamily: F.semibold, fontSize: 16 },
  primary: { backgroundColor: C.red },
  confirmText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `navigationBarTranslucent` is rejected as an unknown prop, the installed `@types/react-native` predates it — drop that single prop and note it; `statusBarTranslucent` alone still clears the tab bar.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppDialog.tsx
git commit -m "feat(ui): add themed AppDialog to replace the native alert"
```

---

### Task 4: Chip primitive

Closes the primitive half of M4 and A4. The attendance chips measure 43×32dp — under the 48dp floor on both axes — and a selected `In` announces identically to an unselected one, because selection is conveyed by background colour alone.

**Files:**
- Create: `src/components/Chip.tsx`

**Interfaces:**
- Consumes: `C`, `F`, `MIN_TOUCH`, `space`, `selected`, `selectedText`, `unselectedText` from `src/theme`; `PressableScale`.
- Produces: default export `Chip`, props `{ label: string; isSelected: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }`. Task 12 consumes this.

- [ ] **Step 1: Write the component**

Create `src/components/Chip.tsx`:

```typescript
import React from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import PressableScale from "./PressableScale";
import { C, F, MIN_TOUCH, selected, selectedText, space, unselectedText } from "../theme";

/**
 * Selectable chip with a guaranteed 48dp touch box and a real selected state
 * in the accessibility tree.
 *
 * Both halves are audit findings: M4 (attendance chips were 43x32dp, so RSVPs
 * were being mis-tapped) and A4 (selection was colour-only, so a screen reader
 * announced selected and unselected identically).
 */
export default function Chip({
  label, isSelected, onPress, disabled = false, accessibilityLabel, style,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      // The box is already >= MIN_TOUCH; hitSlop absorbs the 8dp gutter between
      // adjacent chips so a near-miss still lands on the intended one.
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isSelected, disabled }}
      style={[s.chip, isSelected ? selected : s.unselected, disabled && s.disabled, style]}
    >
      <Text style={[s.text, isSelected ? selectedText : unselectedText]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  chip: {
    minWidth: MIN_TOUCH, minHeight: MIN_TOUCH,
    paddingHorizontal: space.md,
    borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  unselected: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  disabled: { opacity: 0.4 },
  text: { fontFamily: F.semibold, fontSize: 14 },
});
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/components/Chip.tsx
git commit -m "feat(ui): add Chip primitive with a 48dp floor and real selected state"
```

---

### Task 5: Group primitive

Enforces the zero-card-nesting rule. Grouping inside an existing card must come from a subtle background lift, a border, or whitespace — never another card.

**Files:**
- Create: `src/components/Group.tsx`

**Interfaces:**
- Consumes: `C`, `space` from `src/theme`.
- Produces: default export `Group`, props `{ children: React.ReactNode; bordered?: boolean; style?: StyleProp<ViewStyle> }`. Phases 4 and 5 consume this.

- [ ] **Step 1: Write the component**

Create `src/components/Group.tsx`:

```typescript
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { C, space } from "../theme";

/**
 * Content grouping that is NOT a card. Use inside a card when a subsection
 * needs separating — nesting a real card produces the stacked-panel look the
 * audit banned.
 *
 * The 0.06 white lift reads on every surface in this palette without adding a
 * second border weight next to the parent card's.
 */
export default function Group({
  children, bordered = false, style,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.group, bordered && s.bordered, style]}>{children}</View>;
}

const s = StyleSheet.create({
  group: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: space.md,
    gap: space.sm,
  },
  bordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
});
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/components/Group.tsx
git commit -m "feat(ui): add Group surface so grouping never nests cards"
```

---

### Task 6: useScreenInsets

H3's root cause is that `app/new-match.tsx` applies no bottom inset at all, so the CTA's lower 32dp sits under the navigation bar. This hook is the single place that answers "how much bottom padding does a screen with a docked CTA need", so the next screen cannot get it wrong.

**Files:**
- Create: `src/hooks/useScreenInsets.ts`

**Interfaces:**
- Consumes: `useSafeAreaInsets` from `react-native-safe-area-context`; `space` from `src/theme`.
- Produces: `useScreenInsets(): { bottom: number; top: number; ctaPadding: number }`. `ctaPadding` is `insets.bottom + space.md`. Tasks 9, 13 and 14 consume this.

- [ ] **Step 1: Check the hooks directory exists**

Run: `ls src/hooks`
If it does not exist, `mkdir src/hooks` first.

- [ ] **Step 2: Write the hook**

Create `src/hooks/useScreenInsets.ts`:

```typescript
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "../theme";

/**
 * Safe-area padding for screens that dock a CTA to the bottom edge.
 *
 * RN 0.81 / Expo 54 force edge-to-edge on Android 15, so a screen that ignores
 * the bottom inset draws underneath the navigation bar. That is audit finding
 * H3: the New match CTA ran from y1456 to y1568 with the nav bar starting at
 * y1504, clipping the bottom 32dp of "Start scoring".
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top,
    bottom: insets.bottom,
    /** Bottom padding for a container whose last child is a docked CTA. */
    ctaPadding: insets.bottom + space.md,
  };
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/hooks/useScreenInsets.ts
git commit -m "feat(ui): add useScreenInsets so docked CTAs clear the nav bar"
```

---

# PHASE 1 — ERGONOMICS & SAFE AREA

---

### Task 7: Install keyboard-controller and mount the provider

This is the gate for H1 and H2. `app.json` already sets `softwareKeyboardLayoutMode: "resize"`, but Android 15 edge-to-edge — which RN 0.81 / Expo 54 force — no longer honours `adjustResize`, so nothing moves for the IME. `react-native-keyboard-controller` is the only reliable source of live IME height under that regime.

**If the native build fails**, stop and report rather than improvising: the fallback is `Keyboard.addListener("keyboardDidShow")` feeding the same shared value, which Task 8's pure function already supports unchanged.

**Files:**
- Modify: `package.json`, `app/_layout.tsx:224`, possibly `app.json`

**Interfaces:**
- Produces: `KeyboardProvider` mounted above the navigator, so `useReanimatedKeyboardAnimation()` works anywhere in the tree. Task 9 consumes it.

- [ ] **Step 1: Install**

```bash
npx expo install react-native-keyboard-controller
```

- [ ] **Step 2: Confirm the resolved version supports this RN**

Run: `npm ls react-native-keyboard-controller react-native`
Expected: `react-native-keyboard-controller@1.22.x` (or whatever `expo install` pins for SDK 54) alongside `react-native@0.81.5`. If `expo install` warns the package is unsupported on SDK 54, stop and report — do not force it.

- [ ] **Step 3: Mount the provider**

In `app/_layout.tsx`, add the import beside the other component imports:

```typescript
import { KeyboardProvider } from "react-native-keyboard-controller";
```

Then wrap the tree. The current opening is:

```typescript
  const tree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SessionProvider>
```

Change it to:

```typescript
  const tree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
    {/* Inside GestureHandlerRootView so pan gestures on sheets still see
        keyboard state, and above the navigator so every screen can read IME
        height — Android 15 edge-to-edge ignores adjustResize (audit H1). */}
    <KeyboardProvider>
    <SessionProvider>
```

and close it with a matching `</KeyboardProvider>` immediately before the existing `</GestureHandlerRootView>` at the end of `tree`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Rebuild the dev client and confirm it boots**

```bash
npx expo run:android
```

Expected: the app builds, installs, and reaches Home without a red screen. A native module added to a dev client requires this rebuild — Metro reload alone will throw at `KeyboardProvider`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/_layout.tsx app.json
git commit -m "feat(keyboard): mount KeyboardProvider for Android 15 edge-to-edge

app.json already asks for softwareKeyboardLayoutMode: resize, but RN 0.81 /
Expo 54 force edge-to-edge on Android 15, where adjustResize no longer
resizes the window. Audit H1/H2 both trace to this."
```

---

### Task 8: keyboardShift pure function

The lift arithmetic is the part that can actually be wrong, so it gets extracted and tested. Task 9 wires it to a shared value.

**Files:**
- Create: `src/lib/keyboardShift.ts`
- Test: `tests/keyboardShift.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `keyboardShift(input: KeyboardShiftInput): number` and `type KeyboardShiftInput = { keyboardHeight: number; belowContentHeight: number; bottomInset: number; maxShift: number }`. Task 9 consumes both.

- [ ] **Step 1: Write the failing test**

Create `tests/keyboardShift.test.ts`:

```typescript
import { keyboardShift } from "../src/lib/keyboardShift";

// Realistic geometry from the audit device (realme NARZO 80 Lite, 360x800dp):
// IME ~270dp, the format-row/hint/CTA block ~180dp, gesture nav inset ~24dp,
// and the Doubles/Singles row ~56dp is all we are willing to push off-screen.
const DEVICE = { belowContentHeight: 180, bottomInset: 24, maxShift: 56 };

describe("keyboardShift", () => {
  it("is zero when the keyboard is closed", () => {
    expect(keyboardShift({ keyboardHeight: 0, ...DEVICE })).toBe(0);
  });

  it("is zero when the content below the field already absorbs the keyboard", () => {
    // A 150dp keyboard fits inside the 180dp block; nothing needs to move.
    expect(keyboardShift({ keyboardHeight: 150, ...DEVICE })).toBe(0);
  });

  it("lifts by the uncovered remainder", () => {
    // 270 - 180 - 24 = 66, clamped to maxShift 56.
    expect(keyboardShift({ keyboardHeight: 270, ...DEVICE })).toBe(56);
  });

  it("lifts partially when the remainder is under maxShift", () => {
    // 240 - 180 - 24 = 36, which is under 56, so it lifts exactly 36.
    expect(keyboardShift({ keyboardHeight: 240, ...DEVICE })).toBe(36);
  });

  it("never returns a negative shift", () => {
    expect(keyboardShift({ keyboardHeight: 10, ...DEVICE })).toBe(0);
  });

  it("never exceeds maxShift, however tall the keyboard", () => {
    expect(keyboardShift({ keyboardHeight: 900, ...DEVICE })).toBe(56);
  });

  it("degrades to no shift when the layout has not been measured yet", () => {
    // belowContentHeight is 0 before onLayout fires; maxShift 0 means the
    // screen simply behaves as it does today rather than jumping.
    expect(keyboardShift({ keyboardHeight: 270, belowContentHeight: 0, bottomInset: 0, maxShift: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/keyboardShift.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/keyboardShift'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/keyboardShift.ts`:

```typescript
/**
 * How far a screen must lift so a focused field clears the IME.
 *
 * Pure so it can be tested in the node-env Jest suite; Court and new-match
 * feed it live values from useReanimatedKeyboardAnimation and onLayout.
 *
 * The model: content already sitting below the field absorbs the first part of
 * the keyboard for free, and so does the bottom safe-area inset the screen was
 * already padding. Only the remainder needs a translate, and it is capped at
 * maxShift so the lift never pushes the top of the screen out of reach.
 */
export type KeyboardShiftInput = {
  /** Live IME height in dp. 0 when closed. */
  keyboardHeight: number;
  /** Measured height of the content between the field and the screen bottom. */
  belowContentHeight: number;
  /** Bottom safe-area inset already applied by the screen. */
  bottomInset: number;
  /** Ceiling on the lift — how much of the top the screen may sacrifice. */
  maxShift: number;
};

export function keyboardShift({
  keyboardHeight, belowContentHeight, bottomInset, maxShift,
}: KeyboardShiftInput): number {
  const uncovered = keyboardHeight - belowContentHeight - bottomInset;
  if (uncovered <= 0) return 0;
  return Math.min(uncovered, maxShift);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/keyboardShift.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/keyboardShift.ts tests/keyboardShift.test.ts
git commit -m "feat(keyboard): add pure keyboardShift math for the New match lift"
```

---

### Task 9: Lift the New match court for the keyboard (H1) and inset its CTA (H3)

**Files:**
- Modify: `app/new-match.tsx:357-361` (root element), `app/new-match.tsx:380-409` (below-court block), `app/new-match.tsx:415` (root style)

**Interfaces:**
- Consumes: `keyboardShift`, `KeyboardShiftInput` (Task 8); `useScreenInsets` (Task 6); `useReanimatedKeyboardAnimation` (Task 7).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Replace the imports**

In `app/new-match.tsx`, the current React Native import at line 3 includes `KeyboardAvoidingView` and `Platform`. Remove both — `KeyboardAvoidingView` is being replaced and `Platform` becomes unused. Add these imports:

```typescript
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { keyboardShift } from "../src/lib/keyboardShift";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
```

Verify the relative depth: `app/new-match.tsx` is one level below the repo root, so `../src/...` is correct — it matches the existing `../src/components/Court` style imports in this file.

- [ ] **Step 2: Add the measurement and animation state**

Inside the `NewMatch` component, above the `return`, add:

```typescript
  const { ctaPadding, bottom } = useScreenInsets();
  const { height: kbHeight } = useReanimatedKeyboardAnimation();
  // Measured, not guessed: the block below the court absorbs part of the IME.
  const belowContent = useSharedValue(0);
  // The Doubles/Singles row is the only thing we are willing to push off the
  // top — everything else on this screen has to stay reachable while typing.
  const topRow = useSharedValue(0);

  const shift = useDerivedValue(() =>
    keyboardShift({
      // useReanimatedKeyboardAnimation reports height as a negative offset.
      keyboardHeight: Math.abs(kbHeight.value),
      belowContentHeight: belowContent.value,
      bottomInset: bottom,
      maxShift: topRow.value,
    })
  );

  const rootAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(-shift.value, { dampingRatio: 1, duration: 250 }) }],
  }));
```

Shared values rather than `useState` for both measurements: they are read inside a `useDerivedValue` on the UI thread, and routing a layout measurement through React state would re-render the whole screen on every keyboard frame.

- [ ] **Step 3: Swap the root element**

Replace the opening element:

```typescript
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
```

with:

```typescript
    <Animated.View style={[s.root, { paddingBottom: ctaPadding }, rootAnim]}>
```

and the closing `</KeyboardAvoidingView>` with `</Animated.View>`.

- [ ] **Step 4: Measure the two blocks**

On the top row at line 362, add the measurement:

```typescript
      <View
        style={s.topRow}
        onLayout={(e) => { topRow.value = e.nativeEvent.layout.height; }}
      >
```

Then wrap the format row, hint and CTA — currently three siblings at lines 380, 403 and 407 — in a single measured `View`:

```typescript
      <View
        style={s.belowCourt}
        onLayout={(e) => { belowContent.value = e.nativeEvent.layout.height; }}
      >
        {/* existing s.formatRow View, s.hint Text, and BusyButton, unchanged */}
      </View>
```

- [ ] **Step 5: Add the wrapper style**

In the `StyleSheet.create` block, change `root` and add `belowCourt`:

```typescript
  // paddingBottom now comes from useScreenInsets at render time (audit H3):
  // the nav bar was clipping the bottom 32dp of the Start scoring CTA.
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  belowCourt: { gap: 12 },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `Platform` or `KeyboardAvoidingView` is reported as unused, remove it from the import — that is the expected fallout of this change.

- [ ] **Step 7: Verify on device**

Launch the app, open Home → Start a match, tap any player slot.
Expected: the player name field and its caret stay visible above the keyboard, and typing shows characters. Compare against `docs/audit/2026-08-12-ux-audit/screens/20-new-match-player-picker.png` and `21-new-match-typing.png`, where the field was fully occluded.

Also dismiss the keyboard and confirm the full "Start scoring" label is visible above the navigation bar — compare `25-new-match-ready.png`.

- [ ] **Step 8: Commit**

```bash
git add app/new-match.tsx
git commit -m "fix(new-match): lift the court clear of the keyboard and inset the CTA

Closes audit H1 and H3. The court never moved for the IME, so the focused
player field at y966 sat entirely under a keyboard starting at y940 and
users typed blind. The root also applied no bottom inset, clipping the
lower 32dp of Start scoring under the nav bar."
```

---

### Task 10: Stop the suggestion panel colliding with the covered slot (H2)

The panel dropping into the half's other court box is deliberate — `src/components/Court.tsx:145-168`, added in `97b9e01` so the field being typed into stays visible. The audit read it as a collision because the covered box still renders as live. Fix the reading, not the placement, and clamp the panel so it cannot extend under the IME.

**Files:**
- Modify: `src/components/Court.tsx:26-39` (type), `74-80` (panel render), `149-168` (styles)
- Modify: `src/components/CourtBox.tsx`

**Interfaces:**
- Consumes: `CourtEdit.panel` (existing).
- Produces: `CourtEdit.panel` gains `maxHeight?: number`; `CourtBoxEdit` gains `suppressed?: boolean`.

- [ ] **Step 1: Add `suppressed` to CourtBox**

In `src/components/CourtBox.tsx`, add the prop to the destructured signature and its type at lines 32-42:

```typescript
export default function CourtBox({
  zone, name, color, isServer, servingColor, showDivider, suppressed = false, edit,
}: {
  zone: CourtZone;
  name: string | null;
  color: string;
  isServer: boolean;
  servingColor: string;
  showDivider: boolean;
  /** Covered by the name panel: dimmed and inert so the panel reads as a menu
   *  over an inactive area instead of two live controls colliding (audit H2). */
  suppressed?: boolean;
  edit?: CourtBoxEdit;
}) {
```

Then on the outer `Pressable` at lines 58-75, add the dim to the style array and gate interaction. The existing array ends with the `isServer && [...]` entry — append after it:

```typescript
      style={[
        s.box,
        showDivider && s.boxDivider,
        isServer && [
          s.boxServing,
          {
            borderColor: servingColor,
            backgroundColor: servingColor === C.red
              ? "rgba(255,59,48,0.12)"
              : "rgba(59,130,246,0.12)",
          },
        ],
        suppressed && s.suppressed,
      ]}
      onPress={edit?.onZonePress}
      disabled={!edit || suppressed}
      pointerEvents={suppressed ? "none" : "auto"}
      accessible={!!edit && !suppressed}
```

`accessible` is gated too: a dimmed box that a screen reader still announces as a tappable slot is the same collision in another modality.

Add the style to the `StyleSheet.create` block:

```typescript
  suppressed: { opacity: 0.35 },
```

- [ ] **Step 2: Widen the CourtEdit type**

In `src/components/Court.tsx`, change the `panel` field of `CourtEdit`:

```typescript
  panel?: {
    team: TeamId;
    row: CourtRow;
    node: React.ReactNode;
    /**
     * Space available above the keyboard, in dp. The panel clamps to this so
     * a long roster can never extend under the IME (audit H2).
     */
    maxHeight?: number;
  };
```

- [ ] **Step 3: Suppress the covered box and clamp the panel**

In `Half`, the covered row is the opposite of `edit.panel.row`. Pass it down:

```typescript
      {zones.map((zone) => {
        const covered =
          edit?.panel?.team === team && edit.panel.row !== zone.row;
        return (
          <CourtBox
            key={zone.row}
            zone={zone}
            name={zone.playerIdx !== null ? state.config.teams[team][zone.playerIdx].name : null}
            color={color}
            isServer={serveRow === zone.row}
            servingColor={servingColor}
            showDivider={zone.row === "top"}
            suppressed={covered}
            edit={edit?.zoneEdit(zone)}
          />
        );
      })}
```

and clamp the panel itself:

```typescript
      {edit?.panel?.team === team && (
        <View
          style={[
            s.panel,
            edit.panel.row === "top" ? s.panelLower : s.panelUpper,
            edit.panel.maxHeight !== undefined && { maxHeight: edit.panel.maxHeight },
          ]}
        >
          {edit.panel.node}
        </View>
      )}
```

- [ ] **Step 4: Pass the available height from new-match**

In `app/new-match.tsx`, the `edit` object at line 325 builds `panel`. Add the clamp, using the court's measured height and the live keyboard height:

```typescript
  const [courtHeight, setCourtHeight] = useState(0);
```

Add `onLayout` to the court wrapper at line 378:

```typescript
      <View style={s.courtWrap} onLayout={(e) => setCourtHeight(e.nativeEvent.layout.height)}>
        {preview && <Court state={preview} edit={edit} />}
      </View>
```

and in `edit`:

```typescript
    panel:
      editing && (picker.players.length > 0 || picker.canAdd)
        ? {
            team: editing.team,
            row: editing.row,
            node: panelNode,
            // Half the court is the box the panel covers; never taller.
            maxHeight: courtHeight > 0 ? courtHeight * 0.5 : undefined,
          }
        : undefined,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Set the save scope to a club, tap a player slot, type a letter to raise the roster suggestions.
Expected: the suggestion list is fully visible above the keyboard, and the court box underneath it is visibly dimmed and does not respond to taps. Compare `23-new-match-club-roster.png` (only the first row peeked above the IME) and `24-new-match-club-filled.png` (list rendered on top of a live-looking Player 4 slot).

- [ ] **Step 7: Commit**

```bash
git add src/components/Court.tsx src/components/CourtBox.tsx app/new-match.tsx
git commit -m "fix(new-match): make the roster panel read as a menu, not a collision

Closes audit H2. The panel deliberately drops into the half's other box so
the field stays visible (97b9e01); it read as a collision because the
covered box still looked live. It is now dimmed and inert, and the panel
clamps to the space above the keyboard."
```

---

### Task 11: Sheets cover the tab bar and gain a close button (M10)

`Sheet` and `BottomPanel` both render `position: absolute` inside `<View style={StyleSheet.absoluteFill}>`, which is inside the screen — so the bottom tab bar draws over them and stays interactive. A user can tab away mid-modal. Both also dismiss by drag only.

**Files:**
- Modify: `src/components/Sheet.tsx:57-77`, `src/components/BottomPanel.tsx:59-74`

**Interfaces:**
- Consumes: `MIN_TOUCH`, `space` from `src/theme`; `Icon`.
- Produces: no API change — both keep their existing props, so no call site needs touching.

- [ ] **Step 1: Wrap Sheet in a Modal**

In `src/components/Sheet.tsx`, add `Modal` to the `react-native` import and `Icon` to the component imports. Replace the outer `<View style={StyleSheet.absoluteFill} pointerEvents="box-none">` with:

```typescript
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* A Modal, not an absolute View: rendered in the screen tree the sheet
          drew UNDER the bottom tab bar, which stayed tappable mid-modal
          (audit M10). */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
```

and close it with `</View></Modal>`. Keep the `if (!visible) return null;` guard above it — mounting is still conditional so the entrance spring re-runs each time.

- [ ] **Step 2: Add an explicit close button to Sheet**

Immediately after the `<View style={s.grabber} />`:

```typescript
          <PressableScale
            style={s.close}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="close" color={C.text2} size={20} />
          </PressableScale>
```

and add the style:

```typescript
  // Drag-to-dismiss was the only way out. It is a fine gesture and a poor
  // affordance — nothing on screen said the sheet could be closed (audit M10).
  close: {
    position: "absolute", top: 10, right: 12,
    width: MIN_TOUCH, height: MIN_TOUCH,
    alignItems: "center", justifyContent: "center",
    zIndex: 2,
  },
```

- [ ] **Step 3: Apply the identical change to BottomPanel**

Repeat Steps 1 and 2 in `src/components/BottomPanel.tsx`. The structure is the same: same `Modal` wrapper, same close button after the grabber, same `close` style. `BottomPanel` already renders a `title`, so position the close button so it does not overlap the title text — `top: 10, right: 12` clears it, since the title sits below the grabber with `marginBottom: 4`.

- [ ] **Step 4: Verify the Icon name exists**

Run: `npx tsc --noEmit`
Expected: PASS. If `Icon` rejects `"close"`, check `src/components/Icon.tsx` for the correct glyph name in this project's mapping and use that instead.

- [ ] **Step 5: Verify on device**

Open Cups → a tournament → Players, and Home → + (the clubs sheet).
Expected: the sheet covers the bottom tab bar entirely, the tab bar cannot be tapped while the sheet is open, and a close button dismisses it. Compare `08-tournament-players.png` and `38-club-create-join.png`, where the tab bar sat above both sheets.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sheet.tsx src/components/BottomPanel.tsx
git commit -m "fix(ui): render sheets in a Modal so they cover the tab bar

Closes audit M10. Both sheets drew inside the screen tree, so the bottom
tab bar rendered above them and stayed interactive — a user could tab away
mid-modal. Adds an explicit close button; drag-to-dismiss stays."
```

---

### Task 12: Attendance chips to 48dp with real selected state (M4, A4)

`app/(app)/sessions/[id].tsx:456` defines `attendanceChip` as `minWidth: 43, minHeight: 32` — under the floor on both axes, with 4dp gaps — and selection is conveyed by `attendanceChipOn`'s background alone, so a selected `In` announces identically to an unselected one.

**Files:**
- Modify: `app/(app)/sessions/[id].tsx:376-381` (render), `:456` (styles)

**Interfaces:**
- Consumes: `Chip` from Task 4.

- [ ] **Step 1: Import Chip**

Add to the component imports in `app/(app)/sessions/[id].tsx`:

```typescript
import Chip from "../../../src/components/Chip";
```

Verify the depth: the file is at `app/(app)/sessions/[id].tsx`, so `../../../src/` reaches the repo root's `src/` — matching the existing `../../../src/components/Icon` style imports in this file.

- [ ] **Step 2: Replace the chip row**

The current render at lines 376-381 is:

```typescript
          <View style={s.attendanceActions}>
            {(["in", "maybe", "out"] as const).map((status) => (
              <Pressable key={status} onPress={() => mark(item, status)} style={[s.attendanceChip, item.status === status && s.attendanceChipOn]}>
                <Text style={[s.attendanceText, item.status === status && s.attendanceTextOn]}>{status === "in" ? "In" : status === "maybe" ? "Maybe" : "Out"}</Text>
              </Pressable>
            ))}
          </View>
```

Replace with:

```typescript
          <View style={s.attendanceActions}>
            {(["in", "maybe", "out"] as const).map((status) => {
              const label = status === "in" ? "In" : status === "maybe" ? "Maybe" : "Out";
              return (
                <Chip
                  key={status}
                  label={label}
                  isSelected={item.status === status}
                  onPress={() => mark(item, status)}
                  accessibilityLabel={`${label}, ${item.name}`}
                  style={s.attendanceChip}
                />
              );
            })}
          </View>
```

The `accessibilityLabel` names the player because three identical `In` buttons in a list are indistinguishable to a screen reader otherwise.

- [ ] **Step 3: Update the styles**

At line 456, replace the four attendance style entries. `attendanceChip` now only supplies the horizontal padding override — `Chip` owns the sizing, the selected treatment and the a11y state:

```typescript
  attendanceActions: { flexDirection: "row", gap: space.sm },
  // Sizing, selected styling and accessibilityState all live in Chip. This
  // only tightens horizontal padding so three chips fit a 360dp row.
  attendanceChip: { paddingHorizontal: space.sm },
```

Delete `attendanceChipOn`, `attendanceText` and `attendanceTextOn`. Add `space` to the `../../../src/theme` import.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Any error about a removed style name means a second call site used it — update that one too rather than restoring the style.

- [ ] **Step 5: Verify the row still fits at 360dp**

Three chips at `MIN_TOUCH` 48dp wide plus `space.sm` gaps is 160dp, inside a row that also holds a 34dp avatar and the player name. If the name is being squeezed, add `numberOfLines={1}` to `s.playerName`'s `Text` rather than shrinking the chips below 48dp.

- [ ] **Step 6: Verify on device**

Open Sessions → a session → Attendance.
Expected: chips are visibly larger and easier to hit; a selected chip shows the neutral elevated treatment rather than red fill. Compare `03-session-detail.png`.

Dump the tree with `mobile_list_elements_on_screen` and confirm a selected chip now reports its selected state, which A4 says it never did.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/sessions/[id].tsx"
git commit -m "fix(sessions): attendance chips to 48dp with a real selected state

Closes audit M4 and A4. Chips measured 43x32dp with 4dp gaps, so RSVPs were
being mis-tapped, and selection was colour-only — a selected In announced
identically to an unselected one."
```

---

### Task 13: Profile content stops scrolling under the tab bar (P4)

The first achievement row is clipped at rest because the scroll container has no bottom content inset for the tab bar.

**Files:**
- Modify: `app/(app)/profile/index.tsx`

**Interfaces:**
- Consumes: `useScreenInsets` (Task 6).

- [ ] **Step 1: Locate the scroll container**

Run: `npx graphify query "profile screen scroll container achievements grid"`
then open `app/(app)/profile/index.tsx` and find the `ScrollView` or `FlatList` wrapping the profile body.

- [ ] **Step 2: Apply the inset**

Add the import and hook:

```typescript
import { useScreenInsets } from "../../../src/hooks/useScreenInsets";
```

```typescript
  const { ctaPadding } = useScreenInsets();
```

and add to the scroll container's `contentContainerStyle`:

```typescript
        contentContainerStyle={[/* existing */, { paddingBottom: ctaPadding + TAB_BAR_HEIGHT }]}
```

where `TAB_BAR_HEIGHT` is read from the tab navigator's configured height in `app/(app)/_layout.tsx`. If the tab bar uses the default height, use `56`.

- [ ] **Step 3: Typecheck and verify on device**

Run: `npx tsc --noEmit`

Then open Profile and scroll to the bottom.
Expected: the last row clears the tab bar completely. Compare `13-profile.png`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/profile/index.tsx"
git commit -m "fix(profile): pad the scroll container past the tab bar (P4)"
```

---

### Task 14: Sweep remaining docked CTAs for the bottom inset

H3 was found on New match, but the same omission is likely on other screens with a docked CTA. This closes the class, not just the instance.

**Files:**
- Modify: whichever screens the audit in Step 1 identifies.

- [ ] **Step 1: Find every docked CTA**

Run: `npx graphify query "screens with a bottom docked primary CTA button"`

Then confirm with two searches over the `app/` directory, since the CTA is either a `BusyButton` or a style key named `cta`:

```bash
grep -rln "BusyButton" app/
```

```bash
grep -rln "cta:" app/
```

The union of those two lists, minus `app/new-match.tsx` (done in Task 9), is the set to check.

- [ ] **Step 2: Check each one**

For each screen found, confirm its root or its CTA container applies `useScreenInsets().ctaPadding` (or `insets.bottom`). Screens already inside a `Sheet`/`BottomPanel` are covered — those apply `insets.bottom + 16` themselves.

- [ ] **Step 3: Apply the hook where missing**

Use the exact pattern from Task 9 Step 3: `useScreenInsets()` for `ctaPadding`, applied as `paddingBottom` on the screen root.

- [ ] **Step 4: Typecheck, verify, commit**

```bash
npx tsc --noEmit
```

Open each modified screen on device and confirm the CTA clears the navigation bar.

```bash
git add <the exact files you modified>
git commit -m "fix(ui): apply bottom safe-area insets to remaining docked CTAs"
```

---

### Task 15: SegmentedControl selected state and touch floor (A4, M4)

The spec groups a `Segment` primitive into Phase 0, but `src/components/SegmentedControl.tsx` already exists and works. What it actually needs splits across two phases, so only the ergonomics half belongs here:

- **This task (A4/M4 class):** items are `minHeight: 40` — under the floor — and the component exposes no selected state, so a screen reader announces the active segment identically to the inactive ones.
- **Phase 4 (M2 class):** the sliding indicator is `C.red`, which must become the neutral `selected` treatment. Deliberately *not* done here — it is a visual repaint, and Phase 1's verification should not be reading colour changes.

**Files:**
- Modify: `src/components/SegmentedControl.tsx:35-44` (items), `:52` (style)

**Interfaces:**
- Consumes: `MIN_TOUCH` from `src/theme` (Task 2).
- Produces: no API change — `options`/`value`/`onChange` are unchanged, so no call site needs touching.

- [ ] **Step 1: Expose selected state and raise the floor**

Replace the `options.map` block at lines 35-44:

```typescript
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          disabled={opt.disabled}
          style={[s.item, opt.disabled && s.itemDisabled]}
          onPress={() => onChange(opt.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: opt.value === value, disabled: !!opt.disabled }}
          accessibilityLabel={opt.label}
        >
          <Text style={[s.itemText, opt.value === value && s.itemTextOn]}>{opt.label}</Text>
        </Pressable>
      ))}
```

`accessibilityRole="tab"` rather than `"button"`: these select a view rather than perform an action, and the role is what tells a screen reader to announce position within the set.

- [ ] **Step 2: Raise the item height**

At line 52, change `minHeight: 40` to the token:

```typescript
  item: { flex: 1, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
```

and add `MIN_TOUCH` to the existing `../theme` import.

- [ ] **Step 3: Check the indicator still lines up**

The indicator at line 51 is `position: "absolute", top: 4, bottom: 4`, so it stretches to the track and follows the taller items automatically. No change needed — but confirm visually in Step 4, because the track's `padding: 4` plus the new 48dp item makes the control 56dp tall, which may crowd screens that place it in a dense row.

- [ ] **Step 4: Typecheck and verify on device**

Run: `npx tsc --noEmit`

Open Sessions → a session, which uses this control for `Attendance | Games`.
Expected: segments are taller and the highlight still tracks correctly. Dump the tree and confirm the active segment reports its selected state — compare `04-session-games-empty.png`.

- [ ] **Step 5: Commit**

```bash
git add src/components/SegmentedControl.tsx
git commit -m "fix(ui): expose SegmentedControl selected state and raise items to 48dp

Closes the A4/M4 half for segmented controls: items were 40dp and
selection was colour-only, so the active segment announced identically to
the inactive ones. The red indicator becomes neutral in phase 4."
```

---

### Task 16: Phase 1 verification re-audit

A phase is done when every finding it claims has a paired before/after.

**Files:**
- Create: `docs/audit/verify/phase-1/` and its contents.

- [ ] **Step 1: Bring the environment up**

```bash
adb reverse tcp:8081 tcp:8081
```

then start Metro:

```bash
npx expo start --dev-client --port 8081
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server` — the handle drops intermittently (AUDIT.md §7).

- [ ] **Step 2: Clear the audit's leftover test data**

The audit left a completed doubles match `Ut / UtkarshAgrawal 1 – 0 Utki / Soham Deo` in the `Weekend` club and a free-text player named `Ut`. Remove them, or record in the verification notes that they are deliberately retained as fixtures — either is fine, but an unexplained diff against the baseline is not.

- [ ] **Step 3: Capture the evidence**

For each finding, capture an accessibility tree dump and a screenshot into `docs/audit/verify/phase-1/`, named after the baseline file it answers:

| Finding | Baseline | Capture as | Passes when |
|---|---|---|---|
| H1 | `20-new-match-player-picker.png`, `21-new-match-typing.png` | `h1-20-*.png`, `h1-21-*.png` | Focused field and caret visible above the IME; typed characters render |
| H2 | `23-new-match-club-roster.png`, `24-new-match-club-filled.png` | `h2-23-*.png`, `h2-24-*.png` | Full suggestion list above the IME; covered box dimmed and inert |
| H3 | `19-new-match.png`, `25-new-match-ready.png` | `h3-19-*.png`, `h3-25-*.png` | Whole "Start scoring" label above the nav bar |
| M4 / A4 | `03-session-detail.png`, `04-session-games-empty.png` | `m4-03-*.png`, `a4-04-*.png` + tree dumps | Chips and segments ≥48dp; tree reports selected state on both |
| M10 | `08-tournament-players.png`, `38-club-create-join.png` | `m10-08-*.png`, `m10-38-*.png` | Tab bar covered and non-interactive; close button present |
| P4 | `13-profile.png` | `p4-13-*.png` | Last row clears the tab bar |

- [ ] **Step 4: Write the verification note**

Create `docs/audit/verify/phase-1/README.md` listing each finding, its baseline file, its capture, and pass/fail. Record anything that did not close and why — a finding that survived is a fact for Phase 2's plan, not a failure to hide.

- [ ] **Step 5: Run the full suite one more time**

```bash
npx jest && npx tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/audit/verify/phase-1
git commit -m "docs(audit): verify phase 1 closes H1, H2, H3, M4, M10, A4, P4"
```

---

## Not in this plan

**The app-wide `PressableScale` sweep.** The spec's cross-cutting motion rule — every pressable gets press feedback — is a mechanical pass over every screen, and running it here would bury Phase 1's seven findings under a diff touching most of `app/`. The components this plan creates or modifies all use `PressableScale` already; the sweep over untouched screens rides with Phase 4, where the same files are open for the design-language repaint.

**The `SegmentedControl` red indicator.** Task 15 fixes its ergonomics and accessibility only. Repainting the indicator from `C.red` to the neutral `selected` treatment is Phase 4 — see the note in that task.

Phases 2–6 of the spec get their own plan files, written the same way:

- **Phase 2** — Orientation & match lifecycle (H6, M8, A7). The timer fix is its first task, because `uiautomator` cannot dump the scoring screen until the tree goes idle, which gates that phase's own verification.
- **Phase 3** — Correctness (H4, H5, M6, P2, P6, P12, P17)
- **Phase 4** — Design language (H7, M1, M2, M3, M9, P8, P9, P14, P15, P16). Consumes `AppDialog`, `Group`, `danger` and `selected` from Phase 0.
- **Phase 5** — UX states & content (M5, M7, P1, P3, P5, P7, P10, P11, P13, P18)
- **Phase 6** — Accessibility sweep (A1, A2, A3, A5, A6, A8)
