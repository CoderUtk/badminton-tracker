# Achievements Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 22-chip `BadgeGrid` on the profile screen with an achievements section that shows a progress summary, the earned badges, up to three in-progress badges, and a collapsed locked group — fixing the six defects listed in the spec.

**Architecture:** One pure function (`groupBadges`) partitions the existing `EarnedBadge[]` into three groups; three presentational components render them. No new data, no new field on `Badge`, no change to `evaluateBadges`. `src/components/BadgeGrid.tsx` is deleted at the end and `AchievementsSection` takes its place in `app/(app)/profile/index.tsx`.

**Tech Stack:** React Native (Expo SDK 57), TypeScript, Jest (`ts-jest`, `testEnvironment: "node"`).

Spec: `docs/superpowers/specs/2026-08-16-achievements-section-design.md` (commit `363fe9a`).

## Global Constraints

- **NO Supabase migration.** Do not create or edit any file under `supabase/migrations/`, and do not change any RLS policy. This project touches no server state whatsoever.
- **Do not modify `src/achievements/rules.ts`.** No badge is added, removed, or re-evaluated. No `category` field, no `earnedAt` field.
- **Do not modify `src/components/BadgeSharePopup.tsx` or `src/components/share/BadgeResultCard.tsx`.** Project 1 finished those; the badge press handler's contract is unchanged.
- **Shared checkout.** A concurrent session stages files in the same git index. EVERY commit must use `git commit -m "..." -- <explicit paths>`. NEVER `git add -A`, `git add .`, or `git commit -a`. For a brand-new untracked file, `git add <that file>` first (pathspec commits cannot see untracked files), then `git commit -m "..." -- <paths>`; that still scopes the commit and leaves the other session's staged entries alone.
- **Uncommitted files owned by the other session — do not touch:** `.gitignore`, `CLAUDE.md`, `app.json`, `eas.json`, `package-lock.json`, `REACT_NATIVE_ANIMATION_GUIDE.md`, `supabase/.branches/`.
- **React Native components are NEVER unit-tested in this repo.** Jest is `testEnvironment: "node"` with `roots: ["<rootDir>/tests"]`. Only Task 1 adds tests. Do not add `@testing-library/react-native`, `react-test-renderer`, or any new dependency.
- **In-app text floor is 12pt.** `CARD_TYPE` in `src/theme.ts` is NOT relevant here — its floor of 18 applies to the 1080-wide share canvas.
- **Accent rule** (documented in `src/theme.ts`): `C.red` = identity/framing, `C.accent` = the earned thing. Every earned-badge affordance uses `C.accent`.
- **Use `radius` tokens from `src/theme.ts`**, never a hardcoded `borderRadius` number. `radius.md` is 12.
- Baseline before starting: run `npx tsc --noEmit` and `npx jest` and record the counts. Master at `363fe9a` should be tsc-clean with 72 suites / 506 tests.

---

### Task 1: The grouping function

Pure logic, TDD. This is the only new logic in the plan and the only task with tests.

**Files:**
- Create: `src/achievements/grouping.ts`
- Create: `tests/achievements/grouping.test.ts`

**Interfaces:**
- Consumes: `EarnedBadge` from `src/achievements/types.ts`:
  ```ts
  export type Badge = { id: string; title: string; description: string; icon: string };
  export type EarnedBadge = Badge & { earned: boolean; progress: number };
  ```
- Produces, relied on by Task 4:
  ```ts
  export type BadgeGroups = {
    earned: EarnedBadge[];
    nextUp: EarnedBadge[];
    locked: EarnedBadge[];
  };
  export const NEXT_UP_LIMIT = 3;
  export function groupBadges(badges: EarnedBadge[]): BadgeGroups;
  ```

- [ ] **Step 1: Create the test directory and write the failing tests**

`tests/achievements/` does not exist yet. Create it. `tests/share/` is the existing precedent for a test subdirectory, so no Jest config change is needed.

Write `tests/achievements/grouping.test.ts`:

```ts
import { groupBadges, NEXT_UP_LIMIT } from "../../src/achievements/grouping";
import type { EarnedBadge } from "../../src/achievements/types";

const b = (id: string, earned: boolean, progress: number): EarnedBadge => ({
  id, title: id, description: `desc ${id}`, icon: "trophy", earned, progress,
});

test("every badge lands in exactly one group", () => {
  const input = [
    b("a", true, 1), b("b", false, 0.5), b("c", false, 0),
    b("d", true, 1), b("e", false, 0.9), b("f", false, 0),
  ];
  const g = groupBadges(input);
  const ids = [...g.earned, ...g.nextUp, ...g.locked].map((x) => x.id).sort();
  expect(ids).toEqual(["a", "b", "c", "d", "e", "f"]);
  expect(new Set(ids).size).toBe(input.length);
});

test("next up is sorted by progress descending and capped at the limit", () => {
  const input = [
    b("low", false, 0.1), b("high", false, 0.9),
    b("mid", false, 0.5), b("tiny", false, 0.05),
  ];
  const g = groupBadges(input);
  expect(g.nextUp).toHaveLength(NEXT_UP_LIMIT);
  expect(g.nextUp.map((x) => x.id)).toEqual(["high", "mid", "low"]);
});

test("an unearned badge with zero progress is locked, not next up", () => {
  const g = groupBadges([b("zero", false, 0)]);
  expect(g.nextUp).toEqual([]);
  expect(g.locked.map((x) => x.id)).toEqual(["zero"]);
});

test("an earned badge with partial progress is still earned", () => {
  const g = groupBadges([b("odd", true, 0.4)]);
  expect(g.earned.map((x) => x.id)).toEqual(["odd"]);
  expect(g.nextUp).toEqual([]);
  expect(g.locked).toEqual([]);
});

test("earned keeps definition order, not progress order", () => {
  const g = groupBadges([b("first", true, 1), b("second", true, 1), b("third", true, 1)]);
  expect(g.earned.map((x) => x.id)).toEqual(["first", "second", "third"]);
});

test("empty input yields three empty groups", () => {
  expect(groupBadges([])).toEqual({ earned: [], nextUp: [], locked: [] });
});

test("the input array is not mutated", () => {
  const input = [b("low", false, 0.1), b("high", false, 0.9)];
  groupBadges(input);
  expect(input.map((x) => x.id)).toEqual(["low", "high"]);
});
```

The last test is load-bearing: the obvious implementation is `badges.filter(...).sort(...)`, and `Array.prototype.sort` mutates in place. `filter` already returns a fresh array so the naive version passes — but if someone later "optimises" it to sort `badges` directly, the caller's `badges` array (rendered in definition order by the Earned group) would be silently reordered on screen.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/achievements/grouping.test.ts
```

Expected: FAIL — `Cannot find module '../../src/achievements/grouping'`.

- [ ] **Step 3: Write the implementation**

`src/achievements/grouping.ts`:

```ts
import type { EarnedBadge } from "./types";

/** Most badges are in progress at once; showing them all defeats the point. */
export const NEXT_UP_LIMIT = 3;

export type BadgeGroups = {
  earned: EarnedBadge[];
  nextUp: EarnedBadge[];
  locked: EarnedBadge[];
};

/**
 * Partition badges for the profile achievements section. Exhaustive and
 * non-overlapping by construction: a badge is earned or not, and an unearned
 * badge has progress either above zero or exactly zero. Earned and locked keep
 * their definition order; only nextUp is re-sorted, and it sorts a copy so the
 * caller's array is untouched.
 */
export function groupBadges(badges: EarnedBadge[]): BadgeGroups {
  return {
    earned: badges.filter((b) => b.earned),
    nextUp: badges
      .filter((b) => !b.earned && b.progress > 0)
      .sort((a, z) => z.progress - a.progress)
      .slice(0, NEXT_UP_LIMIT),
    locked: badges.filter((b) => !b.earned && b.progress === 0),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/achievements/grouping.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check and run the full suite**

```bash
npx tsc --noEmit && npx jest
```

Expected: tsc clean, all suites pass, 7 more tests than baseline.

- [ ] **Step 6: Commit**

```bash
git add src/achievements/grouping.ts tests/achievements/grouping.test.ts
git commit -m "feat(achievements): partition badges into earned, next up and locked" -- src/achievements/grouping.ts tests/achievements/grouping.test.ts
```

---

### Task 2: The badge chip

Extract the chip out of `BadgeGrid` into its own component, applying the colour, accessibility, and token fixes. `BadgeGrid.tsx` stays in place and untouched this task — Task 4 deletes it. Nothing imports `BadgeChip` yet; `tsc` proves it compiles.

**Files:**
- Create: `src/components/achievements/BadgeChip.tsx`
- Modify: `src/components/Icon.tsx` (add one name to the `IconName` union)
- Test: none (React Native component; see Global Constraints)

**Interfaces:**
- Consumes: `EarnedBadge` (Task 1's Interfaces block), `Icon`/`IconName` from `src/components/Icon.tsx`, and `C`, `F`, `glow`, `press`, `radius` from `src/theme.ts`.
- Produces, relied on by Task 4:
  ```ts
  export default function BadgeChip(props: {
    badge: EarnedBadge;
    onPress?: (badge: EarnedBadge) => void;
    dimmed?: boolean;
  }): React.JSX.Element;
  ```
  The chip sets its own `width: "48%"`; Task 4's grid supplies `flexDirection: "row"`, `flexWrap: "wrap"`, `gap: 10`.

- [ ] **Step 1: Add the lock glyph to the icon union**

`src/components/Icon.tsx` line 34 currently reads:

```ts
  | "information-circle-outline" | "hand-left-outline"
```

Change it to:

```ts
  | "information-circle-outline" | "hand-left-outline" | "lock-closed-outline"
```

`lock-closed-outline` is an Ionicons name, so it must NOT be added to the `MCI` set at the top of the file — names default to Ionicons.

- [ ] **Step 2: Write the chip**

`src/components/achievements/BadgeChip.tsx`:

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "../Icon";
import type { EarnedBadge } from "../../achievements/types";
import { C, F, glow, press, radius } from "../../theme";

/**
 * One badge chip. Earned chips use C.accent per the accent rule in theme.ts —
 * the same cyan as the share card they open, so tapping does not change colour
 * mid-flow. Locked chips carry a lock glyph so their state is not conveyed by
 * dimming alone. The `dimmed` flag is for the collapsed Locked group.
 */
export default function BadgeChip({
  badge, onPress, dimmed,
}: {
  badge: EarnedBadge;
  onPress?: (badge: EarnedBadge) => void;
  dimmed?: boolean;
}) {
  const inProgress = !badge.earned && badge.progress > 0;
  const pct = Math.round(badge.progress * 100);
  const iconColor = badge.earned ? C.accent : inProgress ? C.text : C.ghost;
  const titleStyle = badge.earned ? s.titleEarned : inProgress ? s.titleActive : s.titleLocked;

  const body = (
    <>
      {badge.earned && (
        <View style={s.corner}>
          <Icon name="checkmark-circle" color={C.accent} size={16} />
        </View>
      )}
      {!badge.earned && !inProgress && (
        <View style={s.corner}>
          <Icon name="lock-closed-outline" color={C.ghost} size={12} />
        </View>
      )}
      <Icon name={badge.icon as IconName} color={iconColor} size={24} />
      <Text style={[s.title, titleStyle]} numberOfLines={1}>{badge.title}</Text>
      <Text style={s.desc} numberOfLines={2}>{badge.description}</Text>
      {!badge.earned && (
        <>
          <View style={s.track}>
            <View style={[s.fill, { width: `${pct}%` }, inProgress && s.fillActive]} />
          </View>
          <Text style={s.progressLabel}>{pct}%</Text>
        </>
      )}
    </>
  );

  if (badge.earned && onPress) {
    return (
      <Pressable
        style={({ pressed }) => [s.chip, s.chipEarned, glow(C.accent, 10, 0.35), pressed && press]}
        onPress={() => onPress(badge)}
        accessibilityRole="button"
        accessibilityLabel={`${badge.title}, earned. ${badge.description}. Tap to share.`}
      >
        {body}
      </Pressable>
    );
  }

  const label = badge.earned
    ? `${badge.title}, earned. ${badge.description}.`
    : inProgress
      ? `${badge.title}, ${pct} percent complete. ${badge.description}.`
      : `${badge.title}, locked. ${badge.description}.`;

  return (
    <View
      style={[
        s.chip,
        badge.earned && s.chipEarned,
        badge.earned && glow(C.accent, 10, 0.35),
        dimmed && s.dimmed,
      ]}
      accessible
      accessibilityLabel={label}
    >
      {body}
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    width: "48%",
    backgroundColor: C.bgElev,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 10,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  chipEarned: { borderColor: C.accent },
  dimmed: { opacity: 0.6 },
  corner: {
    position: "absolute", top: 6, right: 6, zIndex: 1,
    backgroundColor: C.bgElev, borderRadius: radius.pill,
  },
  title: { fontSize: 12, fontFamily: F.semibold, textAlign: "center" },
  titleEarned: { color: C.accent },
  titleActive: { color: C.text },
  titleLocked: { color: C.text2 },
  desc: { color: C.text3, fontSize: 12, fontFamily: F.body, textAlign: "center" },
  track: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: C.ghost },
  fillActive: { backgroundColor: C.accent },
  progressLabel: { color: C.text2, fontSize: 12, fontFamily: F.medium, marginTop: 2 },
});
```

Three deliberate changes from the old `BadgeGrid` chip, each fixing a numbered spec defect:

- Every `C.red` became `C.accent` (defect 2). `C.ghost` on the inactive progress fill stays — it is a decorative bar, not text.
- `desc` and `progressLabel` went from `fontSize: 10` to `12` (defect 3).
- The earned `Pressable` gained `accessibilityRole` and `accessibilityLabel`, and the non-pressable states gained `accessible` plus a label (defects 4 and 5), following `src/components/NextSessionCard.tsx:21-22`.

The old share-hint corner badge is gone. The checkmark and the lock now share one `corner` slot, so they cannot collide, and the "tap to share" affordance moved into the accessibility label where it also reaches screen-reader users.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. If it complains about `lock-closed-outline`, Step 1 was skipped.

- [ ] **Step 4: Run the full suite**

```bash
npx jest
```

Expected: unchanged from Task 1 — no test imports this file.

- [ ] **Step 5: Commit**

```bash
git add src/components/achievements/BadgeChip.tsx
git commit -m "feat(achievements): extract the badge chip with accent colour and a11y labels" -- src/components/achievements/BadgeChip.tsx src/components/Icon.tsx
```

---

### Task 3: The next-up row

A full-width row for an in-progress badge — the group that turns "I have 7 badges" into "I am two wins from an eighth". Nothing imports it yet; Task 4 does.

**Files:**
- Create: `src/components/achievements/NextUpRow.tsx`
- Test: none (React Native component)

**Interfaces:**
- Consumes: `EarnedBadge`, `Icon`/`IconName`, and `C`, `F`, `radius` from `src/theme.ts`.
- Produces, relied on by Task 4:
  ```ts
  export default function NextUpRow(props: { badge: EarnedBadge }): React.JSX.Element;
  ```
  Full width. Not pressable — an unearned badge has nothing to share.

- [ ] **Step 1: Write the row**

`src/components/achievements/NextUpRow.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "../Icon";
import type { EarnedBadge } from "../../achievements/types";
import { C, F, radius } from "../../theme";

/**
 * One in-progress badge, full width. Deliberately not pressable: there is
 * nothing to share until it is earned. The percentage is rendered as text as
 * well as a bar so the progress is not conveyed by the bar's length alone.
 */
export default function NextUpRow({ badge }: { badge: EarnedBadge }) {
  const pct = Math.round(badge.progress * 100);
  return (
    <View
      style={s.row}
      accessible
      accessibilityLabel={`${badge.title}, ${pct} percent complete. ${badge.description}.`}
    >
      <View style={s.iconWrap}>
        <Icon name={badge.icon as IconName} color={C.text} size={22} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.head}>
          <Text style={s.title} numberOfLines={1}>{badge.title}</Text>
          <Text style={s.pct}>{pct}%</Text>
        </View>
        <Text style={s.desc} numberOfLines={2}>{badge.description}</Text>
        <View style={s.track}>
          <View style={[s.fill, { width: `${pct}%` }]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.bgElev,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: C.line,
    padding: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: C.card, alignItems: "center", justifyContent: "center",
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: C.text, fontSize: 14, fontFamily: F.semibold, flexShrink: 1 },
  pct: { color: C.text2, fontSize: 12, fontFamily: F.medium },
  desc: { color: C.text3, fontSize: 12, fontFamily: F.body },
  track: { width: "100%", height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: C.accent },
});
```

`flexShrink: 1` on the title with `numberOfLines={1}` is what keeps a long badge title from pushing the percentage off the right edge.

- [ ] **Step 2: Type-check and run the full suite**

```bash
npx tsc --noEmit && npx jest
```

Expected: tsc clean, tests unchanged from Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/components/achievements/NextUpRow.tsx
git commit -m "feat(achievements): add the next-up progress row" -- src/components/achievements/NextUpRow.tsx
```

---

### Task 4: The section, wired into the profile screen

Assemble the summary header and the three groups, replace `BadgeGrid` at its one call site, and delete `BadgeGrid.tsx`.

**Files:**
- Create: `src/components/achievements/AchievementsSection.tsx`
- Modify: `app/(app)/profile/index.tsx` (import at line 15, render at lines 419-425)
- Delete: `src/components/BadgeGrid.tsx`
- Test: none (React Native components)

**Interfaces:**
- Consumes: `groupBadges` and `NEXT_UP_LIMIT` (Task 1), `BadgeChip` (Task 2), `NextUpRow` (Task 3), `EarnedBadge`.
- Produces:
  ```ts
  export default function AchievementsSection(props: {
    badges: EarnedBadge[];
    onPressBadge?: (badge: EarnedBadge) => void;
  }): React.JSX.Element;
  ```
  Same two props `BadgeGrid` had, so the profile screen's swap is one line. The component renders its own card container, so the caller no longer wraps it.

- [ ] **Step 1: Write the section**

`src/components/achievements/AchievementsSection.tsx`:

```tsx
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "../Icon";
import BadgeChip from "./BadgeChip";
import NextUpRow from "./NextUpRow";
import { groupBadges } from "../../achievements/grouping";
import type { EarnedBadge } from "../../achievements/types";
import { C, F, press, radius } from "../../theme";

/**
 * The profile screen's achievements card. Earned badges come first so they are
 * not buried in definition order, Next up shows what is actually reachable, and
 * the untouched badges collapse behind a disclosure — 14 locked chips should not
 * be the first thing a new player scrolls past.
 */
export default function AchievementsSection({
  badges, onPressBadge,
}: {
  badges: EarnedBadge[];
  onPressBadge?: (badge: EarnedBadge) => void;
}) {
  const [showLocked, setShowLocked] = useState(false);
  const g = useMemo(() => groupBadges(badges), [badges]);
  const total = badges.length;
  const done = g.earned.length;
  const ratio = total > 0 ? done / total : 0;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.cardTitle}>Achievements</Text>
        <Text style={s.count}>{done} of {total}</Text>
      </View>
      <View
        style={s.summaryTrack}
        accessible
        accessibilityLabel={`${done} of ${total} achievements earned`}
      >
        <View style={[s.summaryFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>

      {g.earned.length > 0 ? (
        <>
          <Text style={s.groupLabel}>Earned</Text>
          <View style={s.grid}>
            {g.earned.map((b) => (
              <BadgeChip key={b.id} badge={b} onPress={onPressBadge} />
            ))}
          </View>
        </>
      ) : (
        <Text style={s.empty}>No badges yet — play a match and your first one is close.</Text>
      )}

      {g.nextUp.length > 0 && (
        <>
          <Text style={s.groupLabel}>Next up</Text>
          <View style={{ gap: 8 }}>
            {g.nextUp.map((b) => (
              <NextUpRow key={b.id} badge={b} />
            ))}
          </View>
        </>
      )}

      {g.locked.length > 0 && (
        <>
          <Pressable
            style={({ pressed }) => [s.disclosure, pressed && press]}
            onPress={() => setShowLocked((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showLocked }}
            accessibilityLabel={`Locked, ${g.locked.length} achievements. ${showLocked ? "Tap to collapse." : "Tap to expand."}`}
          >
            <Text style={s.disclosureText}>Locked ({g.locked.length})</Text>
            <Icon name={showLocked ? "chevron-down" : "chevron-forward"} color={C.text2} size={18} />
          </Pressable>
          {showLocked && (
            <View style={s.grid}>
              {g.locked.map((b) => (
                <BadgeChip key={b.id} badge={b} dimmed />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.line, gap: 10,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  count: { color: C.text2, fontSize: 13, fontFamily: F.medium },
  summaryTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" },
  summaryFill: { height: "100%", borderRadius: 3, backgroundColor: C.accent },
  groupLabel: { color: C.text2, fontSize: 12, fontFamily: F.semibold, textTransform: "uppercase", letterSpacing: 0.6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  empty: { color: C.text3, fontSize: 13, fontFamily: F.body },
  disclosure: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.bgElev, borderRadius: radius.md,
    borderWidth: 1, borderColor: C.line,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  disclosureText: { color: C.text2, fontSize: 13, fontFamily: F.semibold },
});
```

Notes on specific choices:

- `s.card` and `s.cardTitle` reproduce the profile screen's own styles (`app/(app)/profile/index.tsx:614-615`) so the section still reads as one of that screen's cards. They are duplicated rather than imported because the profile screen keeps its `StyleSheet` private, which is the existing convention in this codebase.
- `total > 0 ? done / total : 0` guards a division by zero. `evaluateBadges` always returns 22 entries, but the component should not depend on that.
- The disclosure uses `chevron-forward` collapsed and `chevron-down` expanded — both already exist in `IconName`. There is no `chevron-up`; do not add one.
- `accessibilityState={{ expanded }}` is what makes the disclosure announce its state, which is the fourth accessibility item in the spec.

- [ ] **Step 2: Swap the call site**

In `app/(app)/profile/index.tsx`, line 15 currently reads:

```ts
import BadgeGrid from "../../../src/components/BadgeGrid";
```

Change it to:

```ts
import AchievementsSection from "../../../src/components/achievements/AchievementsSection";
```

Lines 419-425 currently read:

```tsx
      {/* Achievements */}
      {a && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Achievements</Text>
          <BadgeGrid badges={badges} onPressBadge={setSelectedBadge} />
        </View>
      )}
```

Change them to:

```tsx
      {/* Achievements */}
      {a && <AchievementsSection badges={badges} onPressBadge={setSelectedBadge} />}
```

The card wrapper and the "Achievements" title move inside the component, which is why they are removed here — leaving them would nest a card inside a card and print the title twice.

- [ ] **Step 3: Delete the old grid**

```bash
git rm src/components/BadgeGrid.tsx
```

Before doing this, confirm the profile screen was its only consumer:

```bash
grep -rn "BadgeGrid" app src tests
```

Expected: no output. If anything is still listed, fix that import instead of deleting.

- [ ] **Step 4: Type-check and run the full suite**

```bash
npx tsc --noEmit && npx jest
```

Expected: tsc clean, same counts as Task 1. A `TS6133` unused-import error on `View` or `Text` in the profile screen means Step 2 removed the last use of one of them — check before deleting the import, since that file uses both extensively elsewhere.

- [ ] **Step 5: Commit**

```bash
git add src/components/achievements/AchievementsSection.tsx
git commit -m "feat(achievements): group the profile badges by earned, next up and locked" -- src/components/achievements/AchievementsSection.tsx "app/(app)/profile/index.tsx" src/components/BadgeGrid.tsx
```

The `git rm` in Step 3 already staged the deletion; naming the path here keeps it in this commit.

---

## Manual verification

Nothing in the node-environment suite covers any of the layout. Run these on a device:

- A brand-new account (0 of 22) shows the encouragement line, the summary bar at zero, and a populated Next up. This is the most common early view, not an edge case.
- An account with badges shows Earned first, Next up below it, Locked collapsed.
- The Locked disclosure expands and collapses, and a screen reader announces the expanded/collapsed state.
- Tapping an earned badge still opens the share popup, and the popup's card is the same cyan as the chip that opened it.
- Locked chips show the lock glyph, so state is legible with colour ignored.
- A long badge title in a Next up row truncates without pushing the percentage off screen.

## Self-review

**Spec coverage.** Summary header — Task 4. Earned group with `C.accent` — Tasks 2 and 4. Empty state — Task 4. Next up, capped at three, sorted descending, omitted when empty — Tasks 1 and 4. Locked collapsed by default — Task 4. Grouping derivation with no new `Badge` field — Task 1. All six defects: buried earned badges (Task 4), `C.red`/`C.accent` contradiction (Task 2), `fontSize: 10` (Task 2), unlabelled pressable (Task 2), colour-only locked state (Task 2, lock glyph), `borderRadius: 12` (Tasks 2 and 3, `radius.md`). Every spec test case appears in Task 1's file, plus a non-mutation test the spec did not name.

**Type consistency.** `groupBadges` returns `{ earned, nextUp, locked }` in Task 1 and is destructured with exactly those names in Task 4. `BadgeChip`'s props (`badge`, `onPress`, `dimmed`) match every call site. `NextUpRow` takes `{ badge }` and is called that way. `AchievementsSection` keeps `BadgeGrid`'s `{ badges, onPressBadge }` signature, so the profile screen's swap is one line.

**One gap found and closed during review:** `lock-closed-outline` was not in the `IconName` union, so Task 2 would have failed `tsc`. Adding it is now Step 1 of that task, with the warning not to put it in the `MCI` set.
