# Mobile UX Refinement — Phase 6 (Accessibility Sweep) + Two Ad-Hoc Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last of the mobile-ux-refinement audit's seven phases (accessibility findings A1, A2, A3, A5, A6, A8) and land two unrelated ad-hoc UI decisions (Home CTA shrink, truncation audit) in their own commit groups.

**Architecture:** Five independent, additive changes to existing screens/components — no new files, no new dependencies, no schema/migration changes. Each accessibility fix adds `accessibilityLabel`/`accessibilityRole`/`accessibilityHint` props to an existing element; the CTA change is a style-only edit; the truncation item and the A8 contrast measurement are documentation-only and land in the verification README, not as code.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, expo-router ~6.0.24, Jest 29 + ts-jest.

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` §8 (Phase 6 scope), §9 (cross-cutting acceptance criteria), §11 (risks).
- Design doc for this phase: `docs/superpowers/specs/2026-08-15-mobile-ux-phase-6-design.md`.
- §9 binding rule: "Every icon-only control labelled. No control announces as a bare string." and "Selected state exposed via `accessibilityState`, never implied by colour alone." (no selected-state work in this phase — A4 belongs to a different finding, not in scope here).
- Commit discipline: explicit pathspec only (`git add <exact files>`), never `git add -A`/`.`/`-a`. No `Co-Authored-By` trailer (project CLAUDE.md rule).
- No new dependency. No migration. Phase 4b (`segOn`/`chipOn` → `selected` sweep, 10 sites) is explicitly out of scope — do not touch those files.
- Per the design doc §4: no findings in this phase are logic-testable (label/style changes only) — verification is `npx tsc --noEmit` + the existing Jest suite (regression, must stay green) + live-device evidence where a device is available, not new unit tests.
- Read `docs/superpowers/plans/2026-08-14-mobile-ux-phase-5.md` for the verification README format this plan's final task follows.

## File Structure

**Modified:**
- `app/(app)/_layout.tsx` — A1: `tabBarAccessibilityLabel` on all five `Tabs.Screen` entries.
- `src/components/BracketView.tsx` — A2: composed `accessibilityLabel` on `BracketCell`.
- `app/(app)/tournaments/[id].tsx` — A3: `accessibilityLabel` on the refresh button.
- `src/components/CourtBox.tsx` — A5: `accessibilityRole`/`accessibilityHint` on the player-slot pressable; A6: `accessibilityLabel` on the serve dot.
- `app/(app)/index.tsx` — Ad-hoc #1: shrink the "Start a match" CTA (size + label only; gradient/glow/position untouched).

**Created:**
- `docs/audit/verify/phase-6/README.md` — verification results: per-finding evidence table, A8 contrast measurements, truncation-audit conclusion (documentation, no code).

---

### Task 1: A1 — Tab bar labels

**Files:**
- Modify: `app/(app)/_layout.tsx:29-58`

**Interfaces:** None (no other task depends on this file).

- [ ] **Step 1: Add `tabBarAccessibilityLabel` to each `Tabs.Screen`**

Edit `app/(app)/_layout.tsx` lines 29-58 so every tab screen sets an explicit label matching its `title`, preventing the icon-font glyph / empty-string leak the audit found:

```tsx
<Tabs.Screen
  name="index"
  options={{ title: "Home", tabBarIcon: icon("home"), tabBarAccessibilityLabel: "Home" }}
/>
<Tabs.Screen
  name="sessions"
  options={{
    title: "Sessions", tabBarIcon: icon("calendar"), headerShown: false,
    tabBarAccessibilityLabel: "Sessions",
  }}
/>
<Tabs.Screen
  name="matches"
  options={{
    title: "Matches", tabBarIcon: icon("badminton"), headerShown: false,
    tabBarAccessibilityLabel: "Matches",
  }}
/>
<Tabs.Screen
  name="tournaments"
  options={{
    title: "Tournaments", tabBarIcon: icon("trophy"), headerShown: false,
    tabBarAccessibilityLabel: "Tournaments",
  }}
  listeners={({ navigation, route }) => ({
    tabPress: (e) => {
      const state = navigation.getState();
      const routeIndex = state.routes.findIndex((r: { name: string }) => r.name === route.name);
      const isFocused = routeIndex !== -1 && state.index === routeIndex;
      const nested = state.routes[routeIndex]?.state as
        | NavigationState
        | PartialState<NavigationState>
        | undefined;
      if (isFocused && shouldResetTabStack(nested?.index)) {
        const firstRouteName = nested?.routes?.[0]?.name;
        if (!firstRouteName || !nested) return;
        e.preventDefault();
        navigation.dispatch({
          ...CommonActions.reset({ index: 0, routes: [{ name: firstRouteName }] }),
          target: nested.key,
        });
      }
    },
  })}
/>
<Tabs.Screen
  name="profile"
  options={{
    title: "Profile", tabBarIcon: icon("person"), headerShown: false,
    tabBarAccessibilityLabel: "Profile",
  }}
/>
```

Leave the `clubs` and `watch` `Tabs.Screen` entries (lines 57-58) untouched — `href: null` means they never appear in the tab bar, so they have no announced label to fix.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Run full test suite (regression)**

Run: `npx jest`
Expected: same suite/test counts as the pre-phase baseline, all passing.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/_layout.tsx
git commit -m "fix(a11y): give every tab bar entry an explicit accessibility label

Closes audit finding A1 — tabs previously fell through to a default
announcement that leaked icon-font glyphs and empty strings (e.g. \", Home\")."
```

---

### Task 2: A2 — Bracket cell match semantics

**Files:**
- Modify: `src/components/BracketView.tsx:57-112`

**Interfaces:**
- Consumes: `BracketCell`'s existing props (`cell: BracketMatch`, `nameA: string`, `nameB: string`) — no signature change, just a new derived label inside the component.

- [ ] **Step 1: Compose an `accessibilityLabel` inside `BracketCell`**

Edit `src/components/BracketView.tsx`. Inside `BracketCell` (starts line 57), after the existing `const current = ...` line (64), add:

```tsx
  const matchDesc = cell.entrantA && cell.entrantB
    ? `${nameA} versus ${nameB}`
    : cell.entrantA
      ? `${nameA}, waiting for opponent`
      : cell.entrantB
        ? `${nameB}, waiting for opponent`
        : "Empty match slot";
  const resultDesc = cell.winnerEntrant
    ? cell.winnerEntrant === cell.entrantA
      ? `, ${nameA} won`
      : `, ${nameB} won`
    : cell.entrantA && cell.entrantB
      ? ", in progress"
      : "";
  const courtDesc = cell.court ? `, Court ${cell.court}` : "";
  const cellLabel = `Round ${cell.round}${courtDesc}, ${matchDesc}${resultDesc}`;
```

Then add the label to the `TouchableOpacity` (line 66-73):

```tsx
    <TouchableOpacity
      disabled={!onPress || (!cell.entrantA && !cell.entrantB)}
      onPress={() => onPress?.(cell)}
      accessibilityLabel={cellLabel}
      accessibilityRole={onPress && (cell.entrantA || cell.entrantB) ? "button" : undefined}
      style={[
        s.cell,
        { left, top, borderColor: live ? C.accent : isChampCell ? C.red : C.line },
      ]}
    >
```

This replaces the raw-text-concatenation announcement (`"3, —"`) the audit found with e.g. `"Round 2, Court 3, Alice versus Bob, Alice won"` or `"Round 1, Alice versus Bob, in progress"`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Run full test suite (regression)**

Run: `npx jest`
Expected: same suite/test counts as baseline, all passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/BracketView.tsx
git commit -m "fix(a11y): give bracket cells a composed match-semantics label

Closes audit finding A2 — cells previously announced as raw
concatenated text (e.g. \"3, --\") with no round/court/versus/winner
semantics."
```

---

### Task 3: A3 — Bracket refresh button label

**Files:**
- Modify: `app/(app)/tournaments/[id].tsx:308-312`

**Interfaces:** None (no other task depends on this file).

- [ ] **Step 1: Add `accessibilityLabel` to the refresh button**

Edit `app/(app)/tournaments/[id].tsx` lines 308-312:

```tsx
        {!isDraft ? (
          <PressableScale
            style={s.refreshBtn}
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityLabel="Refresh tournament"
          >
            {refreshing
              ? <ActivityIndicator size="small" color={C.text2} />
              : <Icon name="sync-outline" color={C.text2} size={16} />}
          </PressableScale>
        ) : null}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Run full test suite (regression)**

Run: `npx jest`
Expected: same suite/test counts as baseline, all passing.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/tournaments/[id].tsx"
git commit -m "fix(a11y): label the tournament bracket refresh button

Closes audit finding A3 — the button previously had no
accessibilityLabel and announced as empty."
```

---

### Task 4: A5 + A6 — Player slot role/hint and serve-dot label

**Files:**
- Modify: `src/components/CourtBox.tsx:83, 103-109`

**Interfaces:** None (no other task depends on this file). `CourtBox`'s exported prop shape (`CourtBoxEdit`, the component's own props) is unchanged — this only adds accessibility props to existing JSX elements.

- [ ] **Step 1: Add role/hint to the player-name pressable (A5)**

Edit `src/components/CourtBox.tsx` lines 103-109. The player-name `Pressable` (`onPress={edit?.onNamePress}`, opens the name picker) currently announces as bare label text with no role or hint — add both, gated the same way `disabled` already is (only meaningful when `edit` is present):

```tsx
        <Pressable
          style={s.player}
          onPress={edit?.onNamePress}
          disabled={!edit}
          hitSlop={8}
          accessible={!!edit}
          accessibilityRole={edit ? "button" : undefined}
          accessibilityHint={edit ? "Opens player picker" : undefined}
        >
```

- [ ] **Step 2: Label the serve dot (A6)**

Edit `src/components/CourtBox.tsx` line 83. The serve indicator `View` currently has no accessibility label at all:

```tsx
      {isServer && (
        <View
          style={[s.dot, { backgroundColor: servingColor, shadowColor: servingColor }]}
          accessible
          accessibilityLabel="Serving"
        />
      )}
```

Note: the audit's A6 finding also flagged the court swap controls as "near-identical unlabeled arrow circles," but `src/components/Court.tsx:105` (`accessibilityLabel={\`Swap team ${team} players\`}`) and `Court.tsx:133` (`accessibilityLabel="Swap sides"`) already carry distinct labels — confirmed by direct code read during design. No change needed there; this step closes the one confirmed remaining gap (the serve dot). Re-check the swap buttons on-device during the verification task (Task 7) in case they still read ambiguously despite the labels — only touch `Court.tsx` if that re-check finds a real problem.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Run full test suite (regression)**

Run: `npx jest`
Expected: same suite/test counts as baseline, all passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/CourtBox.tsx
git commit -m "fix(a11y): label player-slot role/hint and the serve indicator

Closes audit findings A5 (player slots announced with no role or hint
that they open a picker) and A6's confirmed remaining gap (the serve
dot had no label at all; the swap buttons already had distinct labels)."
```

---

### Task 5: Ad-hoc #1 — Shrink the Home "Start a match" CTA

**Files:**
- Modify: `app/(app)/index.tsx:135-147, 245-250`

**Interfaces:** None (style/JSX-only change local to this screen).

- [ ] **Step 1: Shrink the CTA button and its label**

Edit `app/(app)/index.tsx`. JSX change (lines 141-146) — sentence-case label instead of all-caps:

```tsx
          <LinearGradient
            colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}
          >
            <Icon name="play" color={C.text} size={20} />
            <Text style={s.ctaText}>Start a match</Text>
          </LinearGradient>
```

Style changes (lines 246-250) — `minHeight` 96→72, drop the all-caps `letterSpacing`, `fontSize` 22→18. Gradient, glow (`ctaWrap`), and position stay exactly as they are — they carry the button's visual hierarchy, not its size:

```ts
  cta: {
    flexDirection: "row", gap: 12, borderRadius: 16, minHeight: 72,
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: C.text, fontSize: 18, fontFamily: F.display },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Run full test suite (regression)**

Run: `npx jest`
Expected: same suite/test counts as baseline, all passing.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "style(home): shrink the Start a match CTA

Both height and label were shortened together: the button's hierarchy
on Home comes from its gradient/glow treatment and top-of-scroll
position, not its footprint, so there was room to address \"too big /
long\" on both axes without losing prominence against the plain-styled
stat tiles and club rows below it."
```

---

### Task 6: A8 — Contrast measurement pass

No code changes are expected from this task — it is a measurement pass, same pattern as Phase 5's M5 (measured, passed, no fix). Do the measurement here so the numbers are ready for the verification README (Task 7); do not skip actually computing it even though the answer below is precomputed.

**Files:** None modified. Read-only references:
- `app/new-match.tsx:485-486` — `segText: { color: C.text2, ... }`, on `C.card` background (`s.segBtn`/`tabBtn` family, `app/new-match.tsx:484`).
- `app/(app)/tournaments/[id].tsx:421-422` — `tabText: { color: C.text2, ... }`, also on `C.card` (the four tournament tool buttons: Config/Players/Scorers/Ops, `tabBtn` style at line 419).
- `src/theme.ts:8-24` — color tokens (`C.text2 = "#9BA3B2"`, `C.card = "#171A21"`, `C.text3 = "#838B9D"`, `C.bgElev = "#12151B"`).

- [ ] **Step 1: Measure unselected segment labels and tournament tool buttons**

Both sites use the same pair: `C.text2` (`#9BA3B2`) text on `C.card` (`#171A21`) background. Using the WCAG relative-luminance method (same as Phase 5 M5 Task 1 Step 3):

- `C.text2` relative luminance ≈ 0.3637
- `C.card` relative luminance ≈ 0.0103
- Contrast ratio = (0.3637 + 0.05) / (0.0103 + 0.05) ≈ **6.86:1**

This passes the WCAG AA threshold of 4.5:1 with margin. Covers: `Singles`/`Doubles` segment (`app/new-match.tsx:423`), the points/best-of segments (`app/new-match.tsx:444,454`), and all four tournament tool buttons (`app/(app)/tournaments/[id].tsx:346,355,373`) — they all share the `segText`/`tabText` → `C.text2` on `C.card` pattern.

- [ ] **Step 2: Confirm locked-achievement text is already covered**

`src/components/BadgeGrid.tsx`'s locked-tile description text (`C.text3` on `C.bgElev`) was already measured in Phase 5 (`docs/audit/verify/phase-5/README.md`, "M5 — locked-tile contrast"): **5.34:1**, passing. No re-measurement needed — record this as already-closed in the Task 7 README rather than re-doing the work.

- [ ] **Step 3: Record — no commit**

No files change. Numbers above go into `docs/audit/verify/phase-6/README.md` in Task 7. A8 closes as **measured, passed, no fix needed** for all three site categories the audit named.

---

### Task 7: Ad-hoc #2 — Truncation audit (documentation only) + Verification

**Files:**
- Create: `docs/audit/verify/phase-6/README.md`

**Interfaces:** None.

- [ ] **Step 1: Check device availability**

Run: `adb devices`

If a device is listed as `device` (not `unauthorized`/`offline`), attempt recovery if needed (`adb kill-server && adb start-server`), then `adb reverse tcp:8081 tcp:8081` and start the dev client (`npx expo start --dev-client --port 8081`) to get live screenshots for Tasks 1-5's findings, matching the baseline screens in `docs/audit/2026-08-12-ux-audit/screens/` (specifically `01-home.png` for Task 5, `07-tournament-live.png` for Tasks 2-3, `19-new-match.png` for Task 4). Use `mobile_list_elements_on_screen` to confirm each new `accessibilityLabel`/`accessibilityRole`/`accessibilityHint` actually appears in the announced tree, not just the source.

If no device is available (`adb devices` returns empty, matching this session's state at design time), skip straight to Step 2 and record the gap honestly — do not fabricate screenshots or tree dumps.

- [ ] **Step 2: Run full verification suite**

Run: `npx tsc --noEmit` (expect exit 0) and `npx jest` (expect all suites passing, same counts as the pre-phase-6 baseline — no new pure-function code landed this phase, so the count should be unchanged from Phase 5's 67 suites / 456 tests unless earlier phases changed it).

- [ ] **Step 3: Write the truncation-audit conclusion into the README**

No code files change for this item — record the decision made during design (all 26 `numberOfLines` sites read for context; single-line sites are appropriate `flex:1` list-row truncation, multi-line sites already size for their content; no systemic fix is warranted). Reference: `docs/superpowers/specs/2026-08-15-mobile-ux-phase-6-design.md` §3 for the full site-by-site rationale — don't re-derive it, cite it.

- [ ] **Step 4: Write `docs/audit/verify/phase-6/README.md`**

Follow the Phase 5 README's structure (`docs/audit/verify/phase-5/README.md`): a header with date/branch/plan/device state, a suite-count line, a device-availability paragraph, a per-finding evidence table (A1, A2, A3, A5, A6, A8, plus the two ad-hoc items), explicit call-outs for anything that didn't get full device evidence, and a closing "Files created" list. Include:
- The A8 contrast numbers from Task 6.
- The truncation-audit conclusion from Step 3, with a note that no files changed for it.
- Confirmation that this closes the last of the audit's seven phases and all 43 findings (spec §12), OR an honest list of any finding from this phase that didn't fully verify, following the same "CODE-CONFIRMED, PARTIAL DEVICE EVIDENCE" language Phase 5 used for its own gaps (P5, P7) rather than overclaiming.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/verify/phase-6/README.md
git commit -m "docs(audit): verify phase 6 closes A1, A2, A3, A5, A6, A8

Also records the truncation-audit conclusion (no systemic fix needed)
and the A8 contrast measurements. This is the last of the seven
mobile-ux-refinement phases -- all 43 findings from the 2026-08-12
audit are now closed."
```

---

## Not in this plan

- **Phase 4b** (`segOn`/`chipOn` → `selected` sweep, 10 sites listed in `docs/audit/verify/phase-4/README.md`): explicitly declined by the user for this session. Do not start it as part of this plan.
- **A4** (selection state via `accessibilityState`) and **A7** (`uiautomator dump` failing on the scoring screen): not in this phase's scope per spec §12 — different phases/backlog items.
- Any rewrite of `Court.tsx`'s swap buttons: only in scope if Task 7's live device re-check finds they still read ambiguously despite their existing distinct labels; the design's working assumption (confirmed by code read) is that they're already fine.
