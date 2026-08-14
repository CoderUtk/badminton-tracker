# Mobile UX Refinement — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the nine design-language findings in spec §6 (H7, M1, M2, M3, M9, P8, P9, P14, P15, P16) — red used for both primary action and selection, a native alert breaking the theme, four names for one concept, three stacked control rows that read as one type, an overlapping control row, unclear button hierarchy, twin-styled Create/Join, disabled states that read as live, and (possibly already-fixed) emoji-style tab icons.

**Architecture:** Phase 0 already built every primitive this phase needs — `selected`/`selectedText`/`danger`/`dangerText` tokens, `AppDialog`, `Chip`, `SegmentedControl`, `Group` (`src/theme.ts`, `src/components/`). This phase has almost no new logic: it is a token/style sweep that replaces raw `C.red`-as-background and native `Alert.alert` call sites with the primitives Phase 0 already shipped, plus one shared-component fix (`SegmentedControl`'s indicator) that cascades to its two existing consumers, one real rename, and one layout fix. Two findings (P8, P16) get a measure-first task like Phase 3's H4/P12, because reading the current code shows them possibly already closed.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, expo-router ~6.0.24, Jest 29 + ts-jest. **No new dependency is added by this plan.**

**Spec:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` — §6 is the scope, §9 and §11 bind every phase. §1 is the target palette; §2 lists the Phase 0 primitives this phase consumes.
**Audit baseline:** `docs/audit/2026-08-12-ux-audit/AUDIT.md` — H7 (line 94), M1 (103), M2 (108), M3 (120), M9 (150), P8 (186), P9 (187), P14 (192), P15 (193), P16 (194).
**Prior phase:** `docs/superpowers/plans/2026-08-14-mobile-ux-phase-3.md` (merged to `master` at `de3f4f7`; this plan branches from there).

## Naming decision (M3), made during planning

Spec §6 says the four names for one concept ("Cups" tab / "Tournaments" screen title / "New tournament" button / "Bracket" detail title) must collapse to one term, but does not pick it. Decided during brainstorming: **"Tournaments."** It matches the existing route folder (`app/(app)/tournaments/`), the existing screen-list title (`_layout.tsx:17`), the existing create button, and the audit's own vocabulary throughout `AUDIT.md`. Only the tab label ("Cups" → "Tournaments") and the detail screen title ("Bracket" → "Tournament") actually change; the rest already say Tournament(s).

## Global Constraints

- **Findings closed by this plan:** H7, M1, M2, M3, M9, P8, P9, P14, P15, P16 (spec §6, §12).
- **No new `src/lib/` pure function is expected.** This phase is StyleSheet/token/JSX changes, not new arithmetic or data selection — unlike Phases 2/3. If a task's implementer finds real branching logic worth unit-testing, that is a signal the task has grown beyond this phase's scope; stop and say so rather than inventing a module to justify a test.
- **Commit with explicit pathspec.** Never `git add -A`, `git add .`, or `git commit -a`. No `Co-Authored-By` trailer.
- **Existing code style:** double-quoted strings, 2-space indent, `StyleSheet.create` assigned to a const named `s`, comments explain *why* not *what*.
- Run `npx tsc --noEmit` before every commit. It must pass.
- **Ignore `.claude/worktrees/remove-players-scorers/` and `.claude/worktrees/profile-picture-upload/`.** These are other concurrent sessions' worktrees, not part of this plan — do not read, edit, or otherwise touch anything under them.
- **Measure before fixing (P8, P16).** Per Phase 3's lesson (its own H4/P12 corrections): read the current code and check on-device before assuming an audit finding still reproduces. Recording "already closed by prior work" with evidence is a valid task outcome, same as Phase 3's Config/Players panels and P12 variants 1/2.
- Environment, from AUDIT.md §7 / Phase 3's plan: `adb reverse tcp:8081 tcp:8081` then `npx expo start --dev-client --port 8081`. Recover a lost device handle with `adb kill-server && adb start-server`. Per Phase 3's verification README, the device may be in use by a concurrent session (a live Metro process serving the stock Expo scaffold instead of this app) — if so, do not restart Metro, override the port, or kill the dev client; record the gap honestly in Task 14 rather than disturbing it.
- Do not touch Phase 5 (M5, M7, P1, P3, P5, P7, P10, P11, P13, P18) or Phase 6 (A1-A3, A5-A6, A8) findings.

---

## File Structure

**Modified:**
- `src/components/SegmentedControl.tsx` — indicator fill token (M2 root fix).
- `app/(app)/tournaments/new.tsx` — selection color (M2), three-groups-in-one-row layout (H7), disabled `Create bracket` (P14).
- `app/(app)/tournaments/[id].tsx` — Config/Players/Scorers/Ops tab selection color (M2).
- `app/(app)/sessions/[id].tsx` — manual-pick/roster-chip selection color (M2), Attendance/Games nav + Auto/Manual toggle differentiation (M9).
- `src/screens/MatchScreen.tsx` — End match dialog (M1).
- `app/(app)/matches/index.tsx` — End match dialog (M1).
- `app/(app)/sessions/[id].tsx` — Finish session dialog (M1, same file as the M9/M2 edits above).
- `app/(app)/_layout.tsx` — tab label "Cups" → "Tournaments" (M3).
- `app/(app)/tournaments/_layout.tsx` — detail title "Bracket" → "Tournament" (M3).
- `app/(app)/clubs/[id].tsx` — button hierarchy, only if Task 9 finds it not already closed (P8).
- `src/components/ClubSheet.tsx` — Create/Join visual hierarchy (P9).
- `app/new-session.tsx` — location placeholder vs. prefilled value (P15).
- `src/components/Stepper.tsx` — disabled-state desaturation (P15).
- `app/(app)/_layout.tsx` — tab icon audit, only if Task 13 finds real emoji glyphs (P16; likely no change).

**Created:**
- `docs/audit/verify/phase-4/` — verification evidence and its README.

---

# M2 — SELECTION STOPS USING RED (root fix + two call sites)

---

### Task 1: `SegmentedControl`'s sliding indicator stops using `C.red`

`src/components/SegmentedControl.tsx:60` sets `indicator: { ..., backgroundColor: C.red }`. This is the shared primitive behind every segmented-control instance in the app (`app/(app)/sessions/[id].tsx`'s Doubles/Singles row and `app/(app)/profile/index.tsx`'s segmented control), so fixing it once closes M2 for both consumers instead of patching each call site. Selection is a state, not an action (spec §1, §4a decision literalized in `src/theme.ts:106-118`'s `selected` token), and `C.red` there collides with every other red-filled primary CTA on the same screen (audit M2's example: a red "Delete tournament" reads the same as "Start a match").

**Files:**
- Modify: `src/components/SegmentedControl.tsx:58-64`

**Interfaces:**
- Consumes: `selected` (`{ backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.lineHi }`) from `src/theme.ts:112-116` — already exported, already used by `Chip.tsx`.
- Produces: nothing consumed downstream; this is a leaf visual change to an existing component's public rendering.

- [ ] **Step 1: Swap the indicator's fill**

In `src/components/SegmentedControl.tsx`, replace:

```typescript
  indicator: { position: "absolute", top: 4, bottom: 4, left: 4, backgroundColor: C.red, borderRadius: 9 },
```

with:

```typescript
  // Selection is a state, not an action — C.red is reserved for primary CTAs
  // (audit M2). cardHi + a hairline border matches Chip's `selected` recipe.
  indicator: { position: "absolute", top: 4, bottom: 4, left: 4, backgroundColor: C.cardHi, borderRadius: 9, borderWidth: 1, borderColor: C.lineHi },
```

Add `selected` to the import if not already present — it isn't; this file currently only imports `C` and `MIN_TOUCH`. Simplest is to inline the two literals (`C.cardHi`, `C.lineHi`) as above rather than importing the `selected` object and spreading it, since `indicator`'s other properties (`position`, `top`, `bottom`, `left`, `borderRadius`) aren't part of `selected`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify on device**

Open Session Detail → Games tab (Doubles/Singles segmented control) and Profile (its segmented control, if reachable without scrolling past Phase 5 scope — just confirm it renders, not that its content is correct). Expected: the sliding highlight behind the selected option is a neutral elevated grey with a subtle border, not red.

- [ ] **Step 4: Commit**

```bash
git add src/components/SegmentedControl.tsx
git commit -m "fix(ui): stop SegmentedControl's selected indicator from using primary red

Audit M2. C.red as a backgroundColor is now a primary-CTA-only rule
(spec section 1). The shared segmented-control indicator was still
filling with it, which is the same collision the audit found between
'Delete tournament' and 'Start a match' — just for selection state
instead of a second action."
```

---

### Task 2: New tournament screen — selection stops using red or cyan

`app/(app)/tournaments/new.tsx` hand-rolls its own segment/tab styling rather than using the shared `SegmentedControl`, so Task 1's fix does not reach it. Three separate selection surfaces here use non-neutral hues: `segOn` (Singles/Doubles, Games/match, Semis onward — all built from the same local `Segmented` component) and `tabOn` (Config/Entrants) use `C.red`; `playerOn` (the entrant-picker rows) uses `C.accent` (cyan) — audit M2's second named collision: "selection is red on New match / New tournament Config, but cyan on the Entrants list."

**Files:**
- Modify: `app/(app)/tournaments/new.tsx:250-276` (styles)

**Interfaces:**
- Consumes: `selected`, `selectedText`, `unselectedText` from `src/theme.ts:112-118`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import the tokens**

In `app/(app)/tournaments/new.tsx`, extend the theme import at line 7:

```typescript
import { C, F, press, selected, selectedText, unselectedText } from "../../../src/theme";
```

- [ ] **Step 2: Replace `segOn`/`segText`/`segTextOn`**

Replace:

```typescript
  segOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15, textTransform: "capitalize" },
  segTextOn: { color: C.text },
```

with:

```typescript
  segOn: selected,
  segText: { color: C.text2, fontFamily: F.semibold, fontSize: 15, textTransform: "capitalize" },
  segTextOn: selectedText,
```

`s.segText` already applies `unselectedText`'s exact color (`C.text2`) inline, so it is left as-is rather than swapped for the token object — changing it would be a no-op restyle, not a fix.

- [ ] **Step 3: Replace `tabOn`**

Replace:

```typescript
  tabOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
```

with:

```typescript
  tabOn: selected,
```

- [ ] **Step 4: Replace `playerOn` (the cyan one)**

Replace:

```typescript
  playerOn: { borderColor: C.accent },
```

with:

```typescript
  playerOn: { borderColor: C.lineHi, backgroundColor: C.cardHi },
```

And update the inline `playerName` color override next to it — currently `on && { color: C.text }` at line 227, which already matches `selectedText`'s value, so no change needed there. The `seed` badge text (`color: C.accent`) is left as-is: it is a numeric seed-order label, not a selection indicator, and audit M2 does not name it.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Open Cups → New tournament. Expected: Singles/Doubles, Games/match, Semis onward, and Config/Entrants tabs all highlight with the same neutral elevated grey, not red. Switch to Entrants and tap a player row: expected neutral grey/border highlight, not cyan — matching the Config tab's selection style instead of contradicting it.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/tournaments/new.tsx
git commit -m "fix(tournaments): stop new-tournament selection from using red or cyan

Audit M2's second collision: selection was red on the Config tab's
segments but cyan on the Entrants list, and both used hues reserved
elsewhere for primary action (red) or DRAFT status (cyan). Both now use
the neutral 'selected' token."
```

---

### Task 3: Tournament detail's tool-tab selection stops using red

`app/(app)/tournaments/[id].tsx:420` — the Config/Players/Scorers/Ops row (the same row H4 fixed the empty-state for in Phase 3) uses `tabOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" }`, the identical pattern Task 2 just replaced in the sibling New tournament screen.

**Files:**
- Modify: `app/(app)/tournaments/[id].tsx:414-422` (styles)

**Interfaces:**
- Consumes: `selected` from `src/theme.ts:112-116`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import the token**

Find this file's existing `../../../src/theme` import and add `selected` to it.

- [ ] **Step 2: Replace `tabOn`**

Replace:

```typescript
  tabOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
```

with:

```typescript
  tabOn: selected,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify on device**

Open a tournament's detail screen. Tap Config, Players, Scorers, Ops in turn. Expected: the active tab highlights neutral grey, not red.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/tournaments/\[id\].tsx
git commit -m "fix(tournaments): stop the Config/Players/Scorers/Ops tab row from using red for selection

Audit M2, same pattern as new.tsx: a filled-red tab reads as an action,
not a state, and collides with the primary-CTA-only rule."
```

---

### Task 4: Session detail's manual-pick and roster chips stop using red

`app/(app)/sessions/[id].tsx` has two more raw-red selection fills, both in the manual-pairing UI: `manualSlotOn` (line 451, a team slot once a player is picked into it) and `playerChipOn` (line 460, the "checked in" roster chip once picked). Both are selection, not action.

**Files:**
- Modify: `app/(app)/sessions/[id].tsx:1-20` (theme import), `:450-462` (styles)

**Interfaces:**
- Consumes: `selected`, `selectedText` from `src/theme.ts:112-118`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import the tokens**

Extend the existing theme import at line 18:

```typescript
import { C, selected, selectedText, space } from "../../../src/theme";
```

- [ ] **Step 2: Replace `manualSlotOn`**

Replace:

```typescript
  manualSlotOn: { backgroundColor: C.red, borderColor: C.red, borderStyle: "solid" },
```

with:

```typescript
  manualSlotOn: { ...selected, borderStyle: "solid" },
```

`borderStyle: "solid"` stays explicit — the unselected state is `borderStyle: "dashed"` (line 450) and `selected` doesn't set `borderStyle`, so without this the dash would persist into the filled state.

Update `manualSlotTextOn` (currently `{ color: C.text }`, line 453) — this already matches `selectedText`'s value exactly, so leave it, or swap to `selectedText` directly for consistency:

```typescript
  manualSlotTextOn: selectedText,
```

- [ ] **Step 3: Replace `playerChipOn`**

Replace:

```typescript
  playerChipOn: { backgroundColor: C.red, borderColor: C.red },
```

with:

```typescript
  playerChipOn: selected,
```

`playerChipTextOn` (currently `{ color: C.text }`, line 462) may likewise become `selectedText` for consistency, same reasoning as above.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify on device**

Open a session, Games tab, switch to Manual pair. Pick two players for Team A. Expected: their roster chip and the filled team slot both highlight neutral grey, not red. The "Add to round" button (`addCourtBtn`, unaffected by this task) stays its own filled red — it's a real action, not a selection, so it is correctly out of scope here.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/sessions/\[id\].tsx
git commit -m "fix(sessions): stop manual-pairing selection from using red

Audit M2. Picked roster chips and filled team slots used the same red
fill as the screen's primary action buttons."
```

---

# H7 — OVERLAPPING CONTROL ROW (New tournament)

---

### Task 5: Fix the three-groups-in-one-row overlap on New tournament's Config tab

`app/(app)/tournaments/new.tsx:158-171` lays out `Games / match`, `Semis onward`, and `Courts` as three equal-flex columns (`gamesRow`/`gamesCol`) in one row. On a 360dp-wide screen this is the audit's exact overlap: the Semis-onward `5` chip collides with the Courts stepper's `−` button, and `Games / match`'s two-word label wraps to two lines, dropping its segment row ~50px below the other two.

**Files:**
- Modify: `app/(app)/tournaments/new.tsx:158-171` (JSX), `:258-259` (styles)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Shorten the wrapping label**

The root cause of the baseline mismatch is `Games / match` wrapping to two lines while `Semis onward` and `Courts` (both single words or short enough) do not. Replace the label text at line 160:

```typescript
              <Text style={s.h}>Games / match</Text>
```

with:

```typescript
              <Text style={s.h} numberOfLines={1}>Games</Text>
```

"Games" alone is unambiguous in context — it sits directly above a 1/3/5 segmented control on a tournament-config screen, and the adjacent `Entrants ({entrantCount})` tab, `Format` label, and `Semis onward` label are already terse. `numberOfLines={1}` is a backstop in case a future longer label is dropped in here without re-checking wrap behavior.

- [ ] **Step 2: Give the row room instead of forcing three equal columns**

Replace `gamesRow`/`gamesCol`:

```typescript
  gamesRow: { flexDirection: "row", gap: 12 },
  gamesCol: { flex: 1, gap: 6 },
```

with:

```typescript
  gamesRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  gamesCol: { flexGrow: 1, flexBasis: "40%", gap: 6 },
```

`flexBasis: "40%"` with `flexWrap: "wrap"` means two columns share a row and the third wraps to its own row rather than three columns being forced into one and overlapping — at 360dp, `Games` and `Semis onward` (the two 1/3/5 segmented groups, narrower content) share the top row, and `Courts` (the widest — a 44dp stepper button on each side of a number) wraps below with room to breathe. `flexGrow: 1` lets a lone wrapped item fill the row's width instead of sitting at 40% with dead space beside it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify on device**

Open Cups → New tournament, Config tab, on the audit's 360×800dp-equivalent device. Expected: no visual overlap between the Semis-onward chips and the Courts stepper; `Games` and `Semis onward` share a baseline; nothing wraps to a second line. Compare against `35-new-tournament.png`.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/tournaments/new.tsx
git commit -m "fix(tournaments): stop Semis-onward and Courts from overlapping on New tournament

Audit H7. Games/match, Semis onward and Courts were forced into three
equal flex columns on a 360dp screen; the two-word 'Games / match'
label also wrapped to two lines and pushed its row off the shared
baseline. Shortened the label and let the row wrap instead of
overlapping."
```

---

# M9 — SESSION GAMES: THREE ROWS, ONE STYLE

---

### Task 6: Differentiate Attendance/Games navigation from Auto/Manual mode toggle

`app/(app)/sessions/[id].tsx` stacks three control rows with identical hand-rolled `s.seg`/`s.segBtn`/`s.segOn` styling: the Attendance/Games sub-tab row (lines 227-237, real navigation), the Auto/Manual pair mode toggle (lines 243-254), and the Doubles/Singles format row (already the shared `SegmentedControl` component, line 315, plus the already-separate `Generate` button at line 324 — that part already reads as its own control type and needs no change). Only the first two need work: they use the exact same visual language as each other and as the format control, so nothing distinguishes "which screen you're on" from "how the next round gets built."

**Files:**
- Modify: `app/(app)/sessions/[id].tsx:1-20` (imports), `:226-254` (JSX), `:438-441` (styles — `seg`/`segBtn`/`segOn` deletion)

**Interfaces:**
- Consumes: `SegmentedControl` (already imported), `Chip` (already imported) — both already used elsewhere in this same file.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Replace the Attendance/Games row with the shared `SegmentedControl`**

This is real navigation between two sub-views of the same screen — the same role `SegmentedControl` already plays for Doubles/Singles two sections below. Replace lines 226-237:

```typescript
          {/* Sub-tabs */}
          {!done && (
            <View style={s.seg}>
              {(["attendance", "games"] as Tab[]).map((t) => (
                <Pressable key={t} style={[s.segBtn, tab === t && s.segOn]} onPress={() => setTab(t)}>
                  <Icon name={t === "attendance" ? "people-outline" : "scoreboard-outline"} size={16} color={tab === t ? C.text : C.text2} />
                  <Text style={[s.segText, tab === t && s.segTextOn]}>
                    {t === "attendance" ? `Attendance · ${checkedIn.length}` : `Games · ${matches.length}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
```

with:

```typescript
          {/* Sub-tabs — real navigation between attendance and games, so it
              uses the same shared control as every other tab switch in the
              app (audit M9: this used to share a visual style with the mode
              toggle below, which is a different kind of control). */}
          {!done && (
            <View style={{ marginTop: 6 }}>
              <SegmentedControl
                options={[
                  { label: `Attendance · ${checkedIn.length}`, value: "attendance" as Tab },
                  { label: `Games · ${matches.length}`, value: "games" as Tab },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
          )}
```

This drops the per-tab icon (`people-outline`/`scoreboard-outline`) — `SegmentedControl` has no icon slot and adding one would be new scope beyond this finding. The label text alone (`Attendance · 3`, `Games · 2`) already carries the same information the icon did.

- [ ] **Step 2: Replace the Auto/Manual pair row with a `Chip` pair**

This is a mode toggle, not navigation — it should not look like the segmented control Step 1 just installed one row above it. `Chip` (already used for Attendance In/Maybe/Out lower on this same screen) gives it a visually distinct language: individual pill buttons with gaps between them, not a joined sliding track. Replace lines 243-254:

```typescript
              {!done && (
                <View style={s.seg}>
                  <Pressable style={[s.segBtn, !manualMode && s.segOn]} onPress={() => setManualMode(false)}>
                    <Text style={[s.segText, !manualMode && s.segTextOn]}>Auto</Text>
                  </Pressable>
                  <Pressable
                    disabled={!canDoubles}
                    style={[s.segBtn, manualMode && s.segOn, !canDoubles && s.modeDisabled]}
                    onPress={() => setManualMode(true)}
                  >
                    <Text style={[s.segText, manualMode && s.segTextOn]}>Manual pair</Text>
                  </Pressable>
                </View>
              )}
```

with:

```typescript
              {!done && (
                <View style={s.modeToggleRow}>
                  <Chip label="Auto" isSelected={!manualMode} onPress={() => setManualMode(false)} />
                  <Chip
                    label="Manual pair"
                    isSelected={manualMode}
                    onPress={() => setManualMode(true)}
                    disabled={!canDoubles}
                  />
                </View>
              )}
```

- [ ] **Step 3: Add `modeToggleRow`, drop the now-unused `seg`/`segBtn`/`segOn`/`segText`/`segTextOn`**

`s.seg`, `s.segBtn`, `s.segOn`, `s.segText`, `s.segTextOn` (lines 438-441) were only used by the two blocks just replaced — confirm with a search of this file for `s.seg` before deleting; if any other JSX still references them, keep them and only add the new style instead of removing. Add beside them:

```typescript
  modeToggleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
```

- [ ] **Step 4: `modeDisabled` stays**

`s.modeDisabled` (`{ opacity: 0.4 }`) is still used elsewhere in this file (the manual-pairing "Add to round" button, used/picked player chips) — do not remove it even though its one Auto/Manual use is gone; `Chip`'s own `disabled` prop and internal `s.disabled` style now cover that case instead.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Open a session with 4+ checked-in players, Games tab. Expected: Attendance/Games renders as the sliding-track segmented control (same look as Doubles/Singles below); Auto/Manual pair renders as two separate pill chips with a visible gap between them, not a joined track. The three rows should now read as three different kinds of control, per spec §6's M9 requirement. Compare against `04-session-games-empty.png`.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/sessions/\[id\].tsx
git commit -m "fix(sessions): give Attendance/Games, Auto/Manual and Doubles/Singles three distinct control styles

Audit M9. All three stacked rows used identical red-fill-selected
Pressable styling, so a navigation segment, a mode toggle, and a
format-selection control (already SegmentedControl) were visually
indistinguishable. Attendance/Games now uses the same SegmentedControl
as the format row; Auto/Manual pair uses individual Chips instead, a
visually distinct language for a toggle rather than navigation."
```

---

# M1 — NATIVE ALERT REPLACED BY APPDIALOG

---

### Task 7: Replace the three remaining `Alert.alert` destructive confirmations with `AppDialog`

Three call sites still use React Native's native `Alert.alert` for a destructive confirmation, breaking the design language exactly as audit M1 describes for the End match dialog: `src/screens/MatchScreen.tsx:127-136` ("End match?"), `app/(app)/matches/index.tsx:59-70` (a second, separate "End match?" reachable from the Matches list), and `app/(app)/sessions/[id].tsx:130-139` ("Finish session?"). A fourth call site, `app/(app)/profile/index.tsx:87-93`, is a "notifications are blocked, open settings" nudge — not a destructive confirmation, and `AppDialog` has no third-button affordance for "Open settings" — so it is left as a native alert, out of scope for M1.

**Files:**
- Modify: `src/screens/MatchScreen.tsx` (imports, state, JSX), `app/(app)/matches/index.tsx` (same), `app/(app)/sessions/[id].tsx` (same — already touched by Task 6, this is an independent commit)

**Interfaces:**
- Consumes: `AppDialog` (`src/components/AppDialog.tsx`) — `{ visible, title, message?, confirmLabel, cancelLabel?, destructive?, onConfirm, onCancel }`, already built by Phase 0.
- Produces: nothing consumed downstream.

- [ ] **Step 1: `MatchScreen.tsx` — swap the End match alert**

Add the import:

```typescript
import AppDialog from "../components/AppDialog";
```

Add a visibility flag beside the screen's other `useState` calls:

```typescript
  const [confirmingEnd, setConfirmingEnd] = useState(false);
```

Replace `confirmEnd` (lines 127-136):

```typescript
  const confirmEnd = useCallback(() => {
    Alert.alert(
      "End match?",
      "Finish now and save the current score to history.",
      [
        { text: "Keep playing", style: "cancel" },
        { text: "End match", style: "destructive", onPress: async () => { await endEarly(); router.back(); } },
      ]
    );
  }, [endEarly, router]);
```

with:

```typescript
  const confirmEnd = useCallback(() => setConfirmingEnd(true), []);
  const onConfirmEnd = useCallback(async () => {
    setConfirmingEnd(false);
    await endEarly();
    router.back();
  }, [endEarly, router]);
```

Find the JSX return and add the dialog, near this screen's other top-level overlays (e.g. beside wherever the orientation sheet already renders):

```typescript
      <AppDialog
        visible={confirmingEnd}
        title="End match?"
        message="Finish now and save the current score to history."
        confirmLabel="End match"
        cancelLabel="Keep playing"
        destructive
        onConfirm={onConfirmEnd}
        onCancel={() => setConfirmingEnd(false)}
      />
```

If `Alert` (from `react-native`) has no other use in this file after this change, remove it from the import; check first with a search for `Alert.` in the rest of the file.

- [ ] **Step 2: `matches/index.tsx` — swap its own End match alert**

Same pattern. Add the `AppDialog` import and a `confirmingEndId: string | null` (or similar — this list has many rows, so track *which* match, not a bare boolean) state:

```typescript
  const [confirmingEndId, setConfirmingEndId] = useState<string | null>(null);
```

Replace the body of `endLive` (currently opens `Alert.alert` directly) so it only sets the id:

```typescript
  const endLive = (m: Row) => setConfirmingEndId(m.id);
  const onConfirmEndLive = useCallback(async () => {
    const id = confirmingEndId;
    setConfirmingEndId(null);
    if (!id) return;
    const state = await replayMatch(id);
    if (state) await endMatchEarly(id, state);
    void syncNow();
    void reload();
  }, [confirmingEndId, syncNow, reload]);
```

Add near the screen's JSX return:

```typescript
      <AppDialog
        visible={!!confirmingEndId}
        title="End match?"
        message="Finish now and save the current score to history."
        confirmLabel="End match"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmEndLive}
        onCancel={() => setConfirmingEndId(null)}
      />
```

Read the surrounding 20 lines of `endLive`'s current definition first — the exact variable names for `replayMatch`, `endMatchEarly`, `syncNow`, `reload` must match what's already imported/defined in this file; the block above assumes their current names from the earlier grep of this file's `Alert.alert` call and may need adjusting to match this file's actual closure variables.

- [ ] **Step 3: `sessions/[id].tsx` — swap the Finish session alert**

This file is already being edited in Task 6 for M9 — do this as an independent commit on top of that one. Add the `AppDialog` import and a `confirmingFinish` boolean beside the existing `confirmingDelete` state:

```typescript
  const [confirmingFinish, setConfirmingFinish] = useState(false);
```

Replace `finishSession` (lines 130-139):

```typescript
  const finishSession = () => {
    if (!session) return;
    const note = liveCount > 0
      ? `This will also end ${liveCount} live ${liveCount === 1 ? "match" : "matches"} and save their current scores.`
      : "Wrap up this session and see the summary.";
    Alert.alert("Finish session?", note, [
      { text: "Cancel", style: "cancel" },
      { text: "Finish", style: "destructive", onPress: async () => { await endSession(session.id); await reload(); } },
    ]);
  };
```

with:

```typescript
  const finishSession = () => setConfirmingFinish(true);
  const onConfirmFinish = async () => {
    setConfirmingFinish(false);
    if (!session) return;
    await endSession(session.id);
    await reload();
  };
```

Add near the JSX return, beside the existing `Sheet` for `confirmingDelete`:

```typescript
      <AppDialog
        visible={confirmingFinish}
        title="Finish session?"
        message={
          liveCount > 0
            ? `This will also end ${liveCount} live ${liveCount === 1 ? "match" : "matches"} and save their current scores.`
            : "Wrap up this session and see the summary."
        }
        confirmLabel="Finish"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmFinish}
        onCancel={() => setConfirmingFinish(false)}
      />
```

Remove the `Alert` import from this file's `react-native` import line if nothing else in the file uses it — check first.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify on device**

Trigger each of the three dialogs (end a live match from the scoring screen, end a live match from the Matches list, finish a session with a live match in it). Expected: each renders the themed `AppDialog` card — near-black card, `Russo One` title, red destructive confirm button — not the stock grey/teal Android alert. Compare against `31-end-match-dialog.png`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/MatchScreen.tsx app/\(app\)/matches/index.tsx app/\(app\)/sessions/\[id\].tsx
git commit -m "fix(ui): replace remaining native Alert.alert destructive confirmations with AppDialog

Audit M1 named the End match dialog specifically, but the same native
AlertDialog appeared at two more call sites (the Matches list's own
End match, and Finish session) that the audit didn't reach. All three
now use the themed AppDialog Phase 0 already built."
```

---

# M3 — ONE NAME FOR THE CONCEPT

---

### Task 8: Rename "Cups" tab and "Bracket" detail title to "Tournaments"/"Tournament"

**Files:**
- Modify: `app/(app)/_layout.tsx:34` (tab title), `app/(app)/tournaments/_layout.tsx:19` (detail screen title)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Rename the tab label**

In `app/(app)/_layout.tsx`, replace:

```typescript
        options={{ title: "Cups", tabBarIcon: icon("trophy"), headerShown: false }}
```

with:

```typescript
        options={{ title: "Tournaments", tabBarIcon: icon("trophy"), headerShown: false }}
```

- [ ] **Step 2: Rename the detail screen's header title**

In `app/(app)/tournaments/_layout.tsx`, replace:

```typescript
      <Stack.Screen name="[id]" options={{ title: "Bracket" }} />
```

with:

```typescript
      <Stack.Screen name="[id]" options={{ title: "Tournament" }} />
```

The list screen's own title (`Stack.Screen name="index"`, already `"Tournaments"`), the create button (already "New tournament"), and the in-body headers on `TournamentConfigTab`/`TournamentPlayersTab`/`TournamentScorersTab` need no change — they already say Tournament(s).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify on device**

Check the bottom tab bar reads "Tournaments", not "Cups". Open a tournament's detail screen and confirm its header reads "Tournament", not "Bracket".

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/_layout.tsx app/\(app\)/tournaments/_layout.tsx
git commit -m "fix(nav): rename Cups tab and Bracket detail title to Tournaments/Tournament

Audit M3 — four names for one concept (tab 'Cups', screen title
'Tournaments', button 'New tournament', detail 'Bracket'). Collapsed to
'Tournament(s)', matching the existing route folder, screen-list title,
and button, which already used that vocabulary."
```

---

# P8 — CLUB DETAIL BUTTON HIERARCHY (measure first)

---

### Task 9: Verify club detail's button hierarchy, fix only if still flat

Audit P8 describes club detail's four buttons (`Start a match`, `Live now`, `Pending requests`, `Manage players`) as "only fill colour separating primary from the rest." Reading `app/(app)/clubs/[id].tsx:118-141` today: `Start a match` uses `s.cta` (filled `C.red`, line 216); `Live now`, `Pending requests`, and `Manage players`/`Players` all use `s.secondary` (`C.cardHi` background, `C.line` border, line 218) — already a two-tier fill/outline hierarchy, not four identical buttons. This may already be closed by incidental work between the audit and now, the same pattern Phase 3 found for H4's Config/Players panels.

**Files:**
- Modify (only if Step 2 finds it still flat): `app/(app)/clubs/[id].tsx:118-141`, `:216-219`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Bring up the environment and open club detail**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

Navigate to a club's detail screen as an admin (so all four buttons render). Screenshot.

- [ ] **Step 2: Compare against the code read above**

If the screenshot shows `Start a match` visually distinct (filled red) from the other three (outlined/elevated grey) — the finding is already closed by prior work. Skip to Step 4 and record it as such, no code change.

If the screenshot shows all four rendering identically (e.g. a build/cache issue masking the style difference, or this reading of the code was wrong) — continue to Step 3.

- [ ] **Step 3: Fix, only if Step 2 found a real problem**

If needed: give `Live now` a lighter secondary treatment than `Pending requests`/`Manage players` (e.g. text-only or a thinner border) so there are three tiers (primary / secondary / tertiary) instead of two, matching the four buttons' actual different weights of importance — `Start a match` is the primary action, `Live now` is a frequent secondary check-in, `Pending requests` and `Manage players` are admin utility. Since this branch is conditional on Step 2's finding, the exact style values are decided at that point against what's actually broken, not speculated here.

- [ ] **Step 4: Record the result and commit if changed**

If no change was needed: no commit for this task (nothing to commit) — the finding is recorded closed-by-prior-work in Task 14's verification README.

If a change was made:

```bash
git add app/\(app\)/clubs/\[id\].tsx
git commit -m "fix(clubs): differentiate club detail's button hierarchy further

Audit P8."
```

---

# P9 — CLUBS SHEET: CREATE/JOIN HIERARCHY

---

### Task 10: Give Create and Join distinct visual weight

Audit P9 has two parts. Reading `src/components/ClubSheet.tsx` today: **the "tappable with empty inputs" half is already closed** — `onCreate` is gated by `disabled={!!nameError}` (line 71) and `onJoin` by `disabled={!inviteCode.trim()}` (line 90), both passed to `BusyButton`, which forwards `disabled` straight to `PressableScale`'s `disabled` prop (`src/components/BusyButton.tsx:29`) — a genuinely inert press, not just a dimmed one. **The "identical primary styling" half still reproduces**: both `Create` and `Join` use the same `s.btn` (`backgroundColor: C.red`, line 110).

**Files:**
- Modify: `src/components/ClubSheet.tsx:89-96` (Join button JSX), `:109-114` (styles)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add a secondary button style**

In `src/components/ClubSheet.tsx`, add beside `btn`/`btnOff` in the `StyleSheet.create` block:

```typescript
  btnSecondary: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  btnSecondaryText: { color: C.text },
```

- [ ] **Step 2: Apply it to Join only**

Replace the Join `BusyButton` (lines 89-94):

```typescript
          <BusyButton
            busy={joining} disabled={!inviteCode.trim()}
            style={[s.btn, !inviteCode.trim() && s.btnOff]} onPress={onJoin}
          >
            <Text style={s.btnText}>Join</Text>
          </BusyButton>
```

with:

```typescript
          <BusyButton
            busy={joining} disabled={!inviteCode.trim()}
            style={[s.btn, s.btnSecondary, !inviteCode.trim() && s.btnOff]} onPress={onJoin}
          >
            <Text style={[s.btnText, s.btnSecondaryText]}>Join</Text>
          </BusyButton>
```

`Create` (the account's/club's primary creation action, the one the sheet's title-adjacent "Create a club" heading leads with) stays filled red; `Join` — joining someone else's existing club — becomes the secondary, outlined action. `indicatorColor` on `BusyButton` defaults to `C.text` for both, which stays legible on both the red and the `cardHi` background.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify on device**

Open Home → the club-creation entry point (`+` button, per `38-club-create-join.png`). Expected: `Create` is filled red, `Join` is outlined/elevated grey — visually distinct instead of twin red buttons. Confirm both still refuse to submit with empty input (already-passing behavior, not new).

- [ ] **Step 5: Commit**

```bash
git add src/components/ClubSheet.tsx
git commit -m "fix(clubs): give Create and Join distinct visual weight

Audit P9. Both used identical filled-red primary styling. The
'tappable with empty inputs' half of this finding was already closed —
BusyButton's disabled prop genuinely blocks the press, not just dims
it — only the styling needed a change."
```

---

# P14 / P15 — DISABLED AND PREFILLED STATES

---

### Task 11: Make "Create bracket"'s disabled state read as genuinely inert

`app/(app)/tournaments/new.tsx:238` applies `s.off` (`{ opacity: 0.5 }`, line 266) on top of the button's base `backgroundColor: C.red` (line 265) when `!canCreate`. A dimmed-but-still-saturated red reads as "styled but live," not disabled (audit P14).

**Files:**
- Modify: `app/(app)/tournaments/new.tsx:238` (JSX), `:265-267` (styles)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add a genuinely-disabled style**

In `app/(app)/tournaments/new.tsx`, add beside `create`/`off`/`createText`:

```typescript
  createOff: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  createTextOff: { color: C.text3 },
```

- [ ] **Step 2: Apply it in place of `off` on this specific button**

Replace:

```typescript
      <Pressable style={({ pressed }) => [s.create, pressed && press, !canCreate && s.off]} disabled={!canCreate} onPress={onCreate}>
        <Text style={s.createText}>Create bracket</Text>
      </Pressable>
```

with:

```typescript
      <Pressable style={({ pressed }) => [s.create, pressed && press, !canCreate && s.createOff]} disabled={!canCreate} onPress={onCreate}>
        <Text style={[s.createText, !canCreate && s.createTextOff]}>Create bracket</Text>
      </Pressable>
```

`s.off` (`{ opacity: 0.5 }`) stays in the file — it is still used by the Courts stepper buttons and the guest-add button in this same screen, which are neutral-background controls where opacity dimming already reads correctly (they aren't saturated-red).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify on device**

Open New tournament with fewer than 4 entrants picked (below `startBlocker`'s minimum). Expected: "Create bracket" renders as a neutral grey/outlined button with dimmed text, not a dimmed-red one. Pick enough entrants to satisfy `canCreate`: expected the button snaps to full filled red. Compare against `35-new-tournament.png`.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/tournaments/new.tsx
git commit -m "fix(tournaments): make the disabled Create bracket button read as inert

Audit P14. Opacity-dimmed red still reads as a styled, live button.
Disabled now swaps to a neutral grey fill with dimmed text instead of
just lowering opacity on the saturated red."
```

---

### Task 12: Distinguish prefilled values from placeholders; desaturate the Stepper's floor state

Audit P15 has two parts, both in the session-planning flow. **Part one:** `app/new-session.tsx:33` initializes `location` state to the literal string `"Badminton hall"`, so the "Where" field renders that text in the same `C.text` color as anything the user actually typed — indistinguishable from a real value. **Part two:** `src/components/Stepper.tsx:45` disables its floor/ceiling buttons with `{ opacity: 0.4 }` only, the same "dimming-only" pattern Task 11 just fixed elsewhere — this stepper backs the Courts control on both New session and (via its own local `CourtsStepper`, unaffected — that one is a separate hand-rolled component in `tournaments/new.tsx`, not this shared `Stepper`) any other screen using the shared component.

**Files:**
- Modify: `app/new-session.tsx:33` (state), `:62` (save, fallback), `:99` (TextInput), `src/components/Stepper.tsx:39-47` (styles)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Make "Badminton hall" a true placeholder, not a prefilled value**

In `app/new-session.tsx`, replace the initial state:

```typescript
  const [location, setLocation] = useState("Badminton hall");
```

with:

```typescript
  const [location, setLocation] = useState("");
```

Update the `TextInput` at line 99 to carry the default as its placeholder instead of relying on state:

```typescript
          <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Venue" placeholderTextColor={C.text2} />
```

becomes:

```typescript
          <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Badminton hall" placeholderTextColor={C.text2} />
```

`createSession`'s `location` field must still fall back to something sensible if the user leaves it blank — update `save`'s call at line 62:

```typescript
      const id = await createSession({ clubId, startsAt, location, courts });
```

to:

```typescript
      const id = await createSession({ clubId, startsAt, location: location.trim() || "Badminton hall", courts });
```

This preserves the exact same default a user gets today by doing nothing, while making the field visually honest about whether they typed something (`C.text`, real) or are seeing a hint (`C.text2` via `placeholderTextColor`, RN's built-in placeholder styling — already correctly dim, since it was never actually a real value rendered through the input's own text color before this fix).

- [ ] **Step 2: Desaturate the Stepper's disabled buttons**

In `src/components/Stepper.tsx`, replace:

```typescript
  btnDisabled: { opacity: 0.4 },
```

with:

```typescript
  btnDisabled: { opacity: 0.4, borderColor: C.line, backgroundColor: C.bgElev },
```

The base `btn` style (`backgroundColor: C.card, borderColor: C.line`) is already fairly neutral (no red), so this is a smaller fix than Task 11's — `C.bgElev` (darker than `C.card`) plus the retained opacity gives the floor/ceiling state a visibly "sunken" look distinguishable from a live-but-currently-unfocused button, rather than opacity being the only signal.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify on device**

Open Plan a session. Expected: "Where" shows placeholder-grey "Badminton hall" text until typed into, at which point typed text renders in full white. Drop Courts to its minimum (1): expected the `−` button looks visibly more inert than just dimmed — darker fill, not just faded. Create a session leaving "Where" untouched: expected it still saves with location "Badminton hall" (unchanged behavior). Compare against `34-plan-session.png`.

- [ ] **Step 5: Commit**

```bash
git add app/new-session.tsx src/components/Stepper.tsx
git commit -m "fix(sessions): distinguish a prefilled venue value from a placeholder, desaturate Stepper's floor state

Audit P15. 'Badminton hall' was a real state value styled identically
to typed text, not a placeholder — now it's a true placeholder with the
same effective default preserved on save. Stepper's disabled buttons
also relied on opacity alone."
```

---

# P16 — TAB ICONS (measure first)

---

### Task 13: Verify the tab bar's icon set, fix only if still emoji-style

Audit P16 describes "multicolour emoji-style tab glyphs." Reading `app/(app)/_layout.tsx:29-56` and `src/components/Icon.tsx` today: every tab's `tabBarIcon` already routes through the shared `Icon` component, which renders `Ionicons`/`MaterialCommunityIcons` — flat, monochrome (colored via the `color` prop, not baked-in multicolor) vector icons, not emoji. This may already be closed by prior work — the same pattern as Phase 3's H4 and this plan's Task 9 (P8).

**Files:**
- Modify (only if Step 2 finds real emoji/multicolor glyphs): `app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Bring up the environment and look at the live tab bar**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

Screenshot the bottom tab bar on any screen.

- [ ] **Step 2: Compare against the code read above**

If the tab bar shows flat single-color icons (house/calendar/shuttle/trophy/person, tinted by the active/inactive tab color) — the finding is already closed, most likely by whatever change introduced the shared `Icon.tsx` component after the audit was run. Record it as such in Task 14; no code change.

If the tab bar genuinely still shows multicolor or emoji-style glyphs — a mismatch between this reading and the running build — stop and report the discrepancy rather than guessing at a fix; this would mean either a stale bundle or a code path this plan's file read did not find.

- [ ] **Step 3: No commit expected**

This task is expected to close with no diff. If Step 2 did find a real problem, the fix (swap whichever icon source is actually rendering to the `Icon` component's existing Ionicons/MCI set) would be scoped and committed at that point, following this file's existing `icon()`-helper pattern in `app/(app)/_layout.tsx:9`.

---

# VERIFICATION

---

### Task 14: Phase 4 verification re-audit

A phase is done when every finding it claims has a paired before/after (spec §10). A finding that did not fully close, or was already closed before this phase started, is a fact to record — matching Task 9's and Task 13's measure-first framing and Phase 3's own precedent.

**Files:**
- Create: `docs/audit/verify/phase-4/` and its contents.

- [ ] **Step 1: Bring the environment up**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server`. If the device shows signs of a concurrent session (per Phase 3's README: a live Metro process already bound to the port, but serving something other than this build), do not disturb it — record the gap the same way Phase 3's verification did, rather than forcing a restart.

- [ ] **Step 2: Capture the evidence**

Into `docs/audit/verify/phase-4/`, named after the baseline each answers:

| Finding | Baseline | Capture as | Passes when |
|---|---|---|---|
| M2 | `06-cups.png`, `09-tournament-config.png`, `37-entrant-selected.png` | `m2-selection.png` | Selection highlights are neutral grey everywhere, not red or cyan |
| H7 | `35-new-tournament.png` | `h7-new-tournament.png` | No overlap between Semis onward and Courts; all three groups share a baseline |
| M9 | `04-session-games-empty.png` | `m9-session-games.png` | Attendance/Games, Auto/Manual, and Doubles/Singles read as three distinct control types |
| M1 | `31-end-match-dialog.png` | `m1-end-match-dialog.png`, `m1-finish-session-dialog.png` | Both render the themed AppDialog card, not the native Android alert |
| M3 | `06-cups.png` | `m3-tab-and-title.png` | Tab reads "Tournaments"; detail screen header reads "Tournament" |
| P8 | `17-club-detail.png` | `p8-club-detail.png` | Record whether the button hierarchy needed any change (Task 9) |
| P9 | `38-club-create-join.png` | `p9-club-sheet.png` | Create is filled red, Join is outlined |
| P14 | `35-new-tournament.png` | `p14-disabled-create.png` | Disabled Create bracket reads as neutral grey, not dimmed red |
| P15 | `34-plan-session.png` | `p15-plan-session.png` | "Badminton hall" renders placeholder-grey until typed; Stepper floor state reads as sunken, not just faded |
| P16 | (tab bar, no dedicated baseline) | `p16-tab-icons.png` | Record whether icons needed any change (Task 13) |

- [ ] **Step 3: Write the verification note**

Create `docs/audit/verify/phase-4/README.md` listing each finding, its baseline, its capture, and pass/fail. Record explicitly, per this plan's own measure-first tasks:

- Whether P8's club-detail button hierarchy needed any code change, or was already closed (Task 9).
- Whether P16's tab icons needed any code change, or were already closed (Task 13).
- Whether the device was unambiguously available this session, or evidence had to be recorded as code-and-typecheck-only per Phase 3's precedent.
- Anything that did not close, and why.

- [ ] **Step 4: Run the full suite**

```bash
npx jest
```

```bash
npx tsc --noEmit
```

Expected: both PASS. This phase adds no new test files (Global Constraints), so the suite's count should be unchanged from Phase 3's 67 suites / 455 tests unless a prior-work discovery in Task 9 or 13 happened to require one.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/verify/phase-4
git commit -m "docs(audit): verify phase 4 closes H7, M1, M2, M3, M9, P8, P9, P14, P15, P16"
```

---

## Not in this plan

**`app/(app)/profile/index.tsx`'s "notifications are blocked" alert** — a native `Alert.alert`, but a system-settings nudge with an "Open settings" action, not a destructive confirmation `AppDialog` is built for. Left as-is; M1's audit language ("the only confirmation guarding an irreversible action") doesn't describe it.

**`app/(app)/clubs/[id].tsx`'s P8 fix**, if Task 9's device check confirms the fill/outline hierarchy already exists — recorded closed by prior work, not by new work in this phase.

**`app/(app)/_layout.tsx`'s P16 fix**, if Task 13's device check confirms the tab bar already renders flat vector icons — recorded closed by prior work.

**Everything in spec §6's sibling phases** — Phase 5 (UX states and content: M5, M7, P1, P3, P5, P7, P10-P11, P13, P18), Phase 6 (accessibility sweep: A1-A3, A5-A6, A8) — untouched, per spec §11's "keep Phase 4 attributable" ordering, since Phase 4 already touches nearly every screen and running the next phase on top of an unverified one would make regressions harder to attribute.
