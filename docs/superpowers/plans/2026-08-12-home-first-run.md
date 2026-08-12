# Home First-Run State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Home tab a first-run state so an account with no matches and no clubs sees what to do next instead of three empty dashboard blocks.

**Architecture:** One new pure predicate in `src/home/dashboard.ts` decides the state from data Home already fetches. One new presentational component, `src/components/FirstRunPanel.tsx`, holds the first-run content. `app/(app)/index.tsx` gains a `loaded` flag and one ternary below the START A MATCH button. No new routes, no new queries, no schema change.

**Tech Stack:** Expo 54 / expo-router, React Native, TypeScript, Jest + ts-jest (`npm test`, `testEnvironment: "node"`, roots `tests/` only).

**Spec:** `docs/superpowers/specs/2026-08-12-home-first-run-design.md`

## Global Constraints

- Jest runs against `tests/` with `testEnvironment: "node"`. There is **no** React Native render-test infrastructure in this repo. Do not add one, do not add `@testing-library/react-native`. Only pure logic gets unit tests; component and screen changes are verified by `npx tsc --noEmit` plus the manual pass in Task 3.
- Theme tokens only — import `C`, `F`, `press` from `src/theme`. No literal hex colours except the existing `rgba(...)` icon-wrap convention.
- Copy strings are exact, verbatim from the spec. Do not reword:
  - Eyebrow, first-run: `WELCOME`
  - Eyebrow, otherwise: `WELCOME BACK`
  - Subtitle: `Set the court, tap to score. No club needed.`
  - Step 1: `Name the players and pick the format`
  - Step 2: `Tap the side that won each rally`
  - Step 3: `History and stats build up as you play`
  - Club line: `Play with a regular group? Create or join a club`
- First-run threshold is **zero matches and zero clubs**. It is not `MIN_MATCHES_FOR_RATES` (5). `shouldShowFeatureCopy` and `statTileValues` keep their existing 5-match threshold and are not modified.
- Commit with an explicit pathspec every time (`git add <paths>`). Never `git add -A`, `git add .`, or `git commit -a`.
- Do not add a `Co-Authored-By` trailer.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/home/dashboard.ts` (modify) | Add `isFirstRun`. Stays pure: no React, no database, no imports beyond types. |
| `tests/homeDashboard.test.ts` (modify) | Add an `isFirstRun` describe block beside the existing ones. |
| `src/components/FirstRunPanel.tsx` (create) | Presentational only: subtitle, three numbered steps, club line. One prop. No data fetching, no navigation. |
| `app/(app)/index.tsx` (modify) | Owns state and the branch. Keeps its current size because the first-run markup lives in the component. |

---

### Task 1: `isFirstRun` predicate

**Files:**
- Modify: `src/home/dashboard.ts` (append at end of file)
- Test: `tests/homeDashboard.test.ts` (append at end of file, and extend the import list at lines 1-11)

**Interfaces:**
- Consumes: `PlayerAnalytics` from `src/analytics/player`, `Club` from `src/repos/clubRepo` — both are already imported as types at the top of `src/home/dashboard.ts`.
- Produces: `isFirstRun(analytics: PlayerAnalytics | null, clubs: Club[], loaded: boolean): boolean` — Task 3 calls this.

- [ ] **Step 1: Write the failing test**

Append to `tests/homeDashboard.test.ts`:

```ts
describe("isFirstRun", () => {
  const club = { id: "club-1", name: "Smash Club" } as Club;

  test("no matches, no clubs, loaded -> true", () => {
    expect(isFirstRun(null, [], true)).toBe(true);
    expect(isFirstRun({ played: 0 } as PlayerAnalytics, [], true)).toBe(true);
  });

  test("a club is enough to leave the first-run state", () => {
    expect(isFirstRun(null, [club], true)).toBe(false);
  });

  test("a played match is enough to leave the first-run state", () => {
    expect(isFirstRun({ played: 1 } as PlayerAnalytics, [], true)).toBe(false);
  });

  test("false until the first load resolves, whatever the inputs", () => {
    expect(isFirstRun(null, [], false)).toBe(false);
    expect(isFirstRun({ played: 0 } as PlayerAnalytics, [], false)).toBe(false);
  });

  test("does not use the rate threshold -> a user with 4 matches is not first-run", () => {
    expect(isFirstRun({ played: 4 } as PlayerAnalytics, [], true)).toBe(false);
  });
});
```

Then add `isFirstRun` to the existing import block at the top of the same file (the one that opens `import {` on line 1 and closes with `} from "../src/home/dashboard";` on line 11). Keep it alphabetically adjacent to `liveClubIds`, matching the loose ordering already there.

`Club` and `PlayerAnalytics` are already imported as types on lines 12-14 of that file — do not re-import them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/homeDashboard.test.ts -t isFirstRun`

Expected: FAIL. ts-jest reports `Module '"../src/home/dashboard"' has no exported member 'isFirstRun'`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/home/dashboard.ts`:

```ts
/**
 * The account has nothing yet: no completed match and no club. Home swaps its
 * dashboard blocks — which would all be empty — for content that names the
 * next step.
 *
 * The threshold is zero, not MIN_MATCHES_FOR_RATES: one club or one match
 * gives the account a shape, and the dashboard is true for it from then on.
 *
 * `loaded` is the caller's "the first cache read has resolved" flag. Without
 * it, analytics starting as null would render the first-run state for a frame
 * on every focus, for every user.
 */
export function isFirstRun(
  analytics: PlayerAnalytics | null,
  clubs: Club[],
  loaded: boolean
): boolean {
  return loaded && (analytics?.played ?? 0) === 0 && clubs.length === 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: PASS — the new `isFirstRun` block plus every pre-existing test in the suite.

- [ ] **Step 5: Commit**

```bash
git add src/home/dashboard.ts tests/homeDashboard.test.ts
git commit -m "feat(home): add a first-run predicate for the dashboard"
```

---

### Task 2: `FirstRunPanel` component

**Files:**
- Create: `src/components/FirstRunPanel.tsx`
- Reference for style conventions: `src/components/NextSessionCard.tsx`

**Interfaces:**
- Consumes: `C`, `F`, `press` from `../theme`; `Icon` from `./Icon`. Nothing from Task 1.
- Produces: `export default function FirstRunPanel({ onCreateClub }: { onCreateClub: () => void })` — Task 3 renders this and passes the club-sheet opener.

This task has no unit test: the repo runs Jest in a `node` environment against `tests/` and has no RN render infrastructure (see Global Constraints). Verification is `npx tsc --noEmit` here, and the manual pass in Task 3.

- [ ] **Step 1: Create the component**

Create `src/components/FirstRunPanel.tsx`:

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./Icon";
import { C, F, press } from "../theme";

const STEPS = [
  "Name the players and pick the format",
  "Tap the side that won each rally",
  "History and stats build up as you play",
];

/**
 * Everything below the START A MATCH button while the account has no matches
 * and no clubs. The caller decides when this replaces the dashboard blocks
 * (isFirstRun in src/home/dashboard.ts) and owns the club sheet itself — this
 * component only reports the tap.
 */
export default function FirstRunPanel({ onCreateClub }: { onCreateClub: () => void }) {
  return (
    <View style={s.wrap}>
      <Text style={s.subtitle}>Set the court, tap to score. No club needed.</Text>

      <View style={s.steps}>
        {STEPS.map((text, i) => (
          <View key={text} style={s.step}>
            <View style={s.badge}>
              <Text style={s.badgeText}>{i + 1}</Text>
            </View>
            <Text style={s.stepText}>{text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [s.clubRow, pressed && press]}
        onPress={onCreateClub}
        accessibilityRole="button"
        accessibilityLabel="Create or join a club"
      >
        <Text style={s.clubText}>
          Play with a regular group?{" "}
          <Text style={s.clubLink}>Create or join a club</Text>
        </Text>
        <Icon name="chevron-forward" color={C.text2} size={18} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },
  subtitle: {
    color: C.text2, fontSize: 13, fontFamily: F.body, lineHeight: 19,
    textAlign: "center", paddingHorizontal: 8, marginTop: -4,
  },
  steps: { gap: 12, paddingHorizontal: 4 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(255,59,48,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: C.red, fontSize: 13, fontFamily: F.bold },
  stepText: { color: C.text2, fontSize: 13, fontFamily: F.body, flex: 1, lineHeight: 18 },
  clubRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  clubText: { color: C.text2, fontSize: 14, fontFamily: F.body, flex: 1 },
  clubLink: { color: C.text, fontFamily: F.semibold },
});
```

The `subtitle` style is copied from the `featureCopy` rule in `app/(app)/index.tsx` on purpose — this line takes that line's place in the first-run state, at the same size and spacing.

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: clean exit, no output. If `press` or `F.semibold` is reported missing, check `src/theme.ts` for the real export name rather than inventing one.

- [ ] **Step 3: Commit**

```bash
git add src/components/FirstRunPanel.tsx
git commit -m "feat(home): add the first-run panel component"
```

---

### Task 3: Wire the state into Home

**Files:**
- Modify: `app/(app)/index.tsx`

**Interfaces:**
- Consumes: `isFirstRun` (Task 1), `FirstRunPanel` (Task 2).
- Produces: nothing — this is the top of the tree.

No unit test, same reason as Task 2. Verified by `npx tsc --noEmit`, `npm test` (nothing must regress), and the manual pass in Step 6.

- [ ] **Step 1: Add the imports**

In `app/(app)/index.tsx`, add `isFirstRun` to the existing multi-line import from `"../../src/home/dashboard"` (currently lines 14-17, the block importing `liveClubIds`, `pickNextSession`, and friends).

Then add, beside the other component imports around lines 18-22:

```tsx
import FirstRunPanel from "../../src/components/FirstRunPanel";
```

- [ ] **Step 2: Add the `loaded` flag and make analytics non-fatal**

Add the state declaration next to the existing `now` state (line 33):

```tsx
  // Gates the blocks below the CTA on the first cache read. Without it,
  // analytics and clubs both start empty and every focus would flash the
  // first-run layout at an established user.
  const [loaded, setLoaded] = useState(false);
```

Then, inside `loadFromCache`, replace these two lines (currently lines 63-65):

```tsx
      const stats = name ? await getPlayerAnalytics(name) : null;
      if (epoch !== epochRef.current) return;
      setAnalytics(stats);
```

with:

```tsx
      // Own try/catch rather than falling through to the chain's catch below:
      // a failing analytics read must not leave `loaded` false forever, which
      // would blank everything under the CTA. A user whose analytics fail but
      // who has clubs still gets the dashboard, because isFirstRun checks both.
      const stats = name
        ? await getPlayerAnalytics(name).catch(() => null)
        : null;
      if (epoch !== epochRef.current) return;
      setAnalytics(stats);
      setLoaded(true);
```

The outer `.catch` on the `refreshClubs()`/`refreshSessions()` chain keeps its existing comment and behaviour, but gains one line so a throw earlier in the chain (an offline cold start failing `listRealClubs`) cannot leave the screen gated forever:

```tsx
      .catch(() => {
        // ...existing comment, unchanged...
        setLoaded(true);
      });
```

That is safe against a stale epoch: it only ever reveals the blocks, and a
newer focus re-runs the whole chain anyway.

- [ ] **Step 3: Derive the state and branch the eyebrow**

Beside the existing derived values (lines 90-95, where `next`, `live`, `stats`, and `showCopy` are computed), add:

```tsx
  const firstRun = isFirstRun(analytics, clubs, loaded);
```

Then change the eyebrow on line 102 from the hardcoded string:

```tsx
            <Text style={s.greetEyebrow}>{firstRun ? "WELCOME" : "WELCOME BACK"}</Text>
```

- [ ] **Step 4: Branch the blocks below the CTA**

Everything from the `{showCopy && (` block (line 122) through the closing `</View>` of the stat row (the `s.statRow` view ending near line 197) becomes the else-branch of one conditional. The `NextSessionCard` block stays inside the dashboard branch — a first-run account has no clubs, so it can have no sessions.

Structure it as:

```tsx
        {firstRun ? (
          <FirstRunPanel onCreateClub={() => setSheetOpen(true)} />
        ) : (
          <>
            {showCopy && (
              <Text style={s.featureCopy}>
                Track points, serve orientation, rally history, and set points — live.
              </Text>
            )}

            {/* the existing NextSessionCard block, Your clubs section,
                and Recent performance block, moved in unchanged */}
          </>
        )}
```

Do not delete or reword any of the moved markup — including the `clubs.length === 0` empty-state `Pressable`, which still serves a signed-in user who has played matches but left every club. Only its indentation changes.

The `ClubSheet` render at the bottom of the file stays where it is, outside the branch: both states open it.

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; the full Jest suite passes, including the Task 1 block.

- [ ] **Step 6: Manual verification on a device or simulator**

Run: `npm run android` (or `npm run ios`)

Check all four:

1. **Fresh account** (no clubs, no matches) — eyebrow reads `WELCOME`; the subtitle, three numbered steps, and club line are visible; no `Your clubs` header, no `Recent performance` heading, no stat tiles; nothing scrolls.
2. **Existing account** — the dashboard is unchanged, eyebrow reads `WELCOME BACK`, and switching to another tab and back shows **no** flash of the first-run layout.
3. **Club line** — tapping it opens the existing `ClubSheet`; creating a club closes the sheet and Home reloads into the dashboard state, `Your clubs` now listing that club.
4. **START A MATCH from the first-run state** — opens `/new-match` with the Personal club default, confirming the "No club needed." claim is true.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(home): show a first-run state for empty accounts"
```

---

## Out of Scope

- The sign-in and welcome screens. Feedback pointed at the Home tab.
- The guest stack (`app/guest*`), which never renders `(app)/index`.
- Any change to `statTileValues`, `shouldShowFeatureCopy`, or the
  `MIN_MATCHES_FOR_RATES` threshold.
- Tab-bar labels, including `Cups`.
