# Mobile UX Refinement — Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the ten UX-states-and-content findings in spec §7 (M5, M7, P1, P3, P5, P7, P10, P11, P13, P18) — a truncating achievement grid, an ambiguous notification toggle, misaligned home stat tiles, a name that wraps mid-word, filter chips with nothing to filter, a possibly-missing back chevron, exact-match-only friend search with no field label, club roster rows with no role/avatar and a removable owner, unreadable entrant rows, and a leaked invite code.

**Architecture:** No new primitives are needed — Phase 0's tokens (`selected`, `space`, corrected `text3`) and Phase 4's `AppDialog`/`SegmentedControl`/`Chip` already cover this phase's UI vocabulary. Two findings (P7) are measure-first, following Phase 4's precedent for P8/P16 — read the code first, verify on the live device, only change code if the device disagrees. One finding (P11) needs new data, not just new style: `listPlayers()` reads from an offline SQLite cache (`club_players_cache`) that was never populated with role or avatar, so this phase adds a live supplementary Supabase query rather than reworking the sync/cache pipeline. One finding (P10) needs a new repo function (`searchUsers`) — no migration, since `profiles` is already readable by any authenticated user (`supabase/migrations/0001_init.sql:125`).

**Tech Stack:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9, expo-router ~6.0.24, Jest 29 + ts-jest, Supabase JS client. **No new dependency is added by this plan.**

**Spec:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` — §7 is the scope, §9 and §11 bind every phase.
**Audit baseline:** `docs/audit/2026-08-12-ux-audit/AUDIT.md` — M5 (130), M7 (140), P1 (179), P3 (181), P5 (183), P7 (185), P10 (188), P11 (189), P13 (191), P18 (196).
**Prior phase:** `docs/superpowers/plans/2026-08-14-mobile-ux-phase-4.md` (merged to `master`; this plan branches from there). Its verification note (`docs/audit/verify/phase-4/README.md`) records phase 4 had **no device at all** this session; this phase's environment **does** have one (`adb devices` → `007517460425921a`), so verification gets real screenshots, not code-only evidence.

## Decisions made during brainstorming (bind this plan)

- **P10** builds full live search: a new `searchUsers(prefix)` function, a debounced dropdown, and a field label — not just the label alone. The pending-requests section (`Requests`/`Sent`) already exists in `friends.tsx`; it is **not** rebuilt, only re-verified.
- **P13** uses a leading checkbox-circle affordance (empty ring unselected, filled check selected), matching the audit's own suggested fix ("no checkbox or chevron").
- **P7** is measure-first, not a guaranteed code change: `HeaderLogoLeft` (`src/components/HeaderLogoLeft.tsx:27-37`) already renders a back chevron whenever `canGoBack` is true, and is wired into `app/(app)/clubs/[id].tsx` for owners; non-owners fall through to the default Stack header, which has its own back button. This looks already closed, the same shape as Phase 4's P8/P16.
- **P11** is real, not measure-first: `listPlayers()` (`src/repos/clubRepo.ts:152-158`) reads only `{id, club_id, profile_id, name}` from the local `club_players_cache` table — no role, no avatar. Closing it needs a new live Supabase query (role from `club_members`, avatar from `profiles`), not a style change.

## Global Constraints

- **Findings closed by this plan:** M5, M7, P1, P3, P5, P7, P10, P11, P13, P18 (spec §7).
- **Commit with explicit pathspec.** Never `git add -A`, `git add .`, or `git commit -a`. No `Co-Authored-By` trailer.
- **Existing code style:** double-quoted strings, 2-space indent, `StyleSheet.create` assigned to a const named `s`, comments explain *why* not *what*.
- Run `npx tsc --noEmit` before every commit. It must pass.
- **Check for concurrent-session worktrees before touching shared files.** Run `ls .claude/worktrees` first; if a worktree exists for a screen this plan also touches, treat its files as off-limits and note the conflict instead of editing them.
- **Measure before fixing (P7).** Per Phase 4's own precedent (its P8/P16 tasks): read the current code and check on-device before assuming an audit finding still reproduces. Recording "already closed by prior work" with evidence is a valid task outcome.
- Environment, from AUDIT.md §7 / Phase 3-4's plans: `adb reverse tcp:8081 tcp:8081` then `npx expo start --dev-client --port 8081`. Recover a lost device handle with `adb kill-server && adb start-server`. **A device is confirmed present this session** (`007517460425921a`) — verification tasks should capture real screenshots, not fall back to code-only evidence by default; only record a gap if the device genuinely becomes unavailable mid-phase.
- Do not touch Phase 6 (A1-A3, A5-A6, A8) findings.

---

## File Structure

**Modified:**
- `src/components/BadgeGrid.tsx` — 2-column grid, numeric progress, locked-tile contrast (M5).
- `app/(app)/profile/index.tsx` — notification `Switch` (M7), display-name truncation (P3).
- `app/(app)/index.tsx` — invite code removed from club row (P18).
- `src/components/StatTile.tsx` — reserved label height (P1).
- `app/(app)/matches/index.tsx` — hide filter chips when no matches exist at all (P5).
- `app/(app)/clubs/[id].tsx` — only if Task 4 finds the back chevron genuinely missing (P7).
- `src/repos/friendRepo.ts` — new `searchUsers` function (P10).
- `app/(app)/profile/friends.tsx` — field label, debounced search dropdown (P10).
- `src/repos/clubRepo.ts` — new `listPlayerRoles` function (P11).
- `app/(app)/clubs/players/[clubId].tsx` — role badge, avatar, owner's row loses remove control (P11).
- `app/(app)/tournaments/new.tsx` — checkbox affordance, zero-state hint (P13).

**Created:**
- `docs/audit/verify/phase-5/` — verification evidence and its README.

---

# M5 — ACHIEVEMENT GRID

---

### Task 1: Achievement grid drops to 2 columns, progress bars carry a numeric value, locked-tile text is measured for contrast

`src/components/BadgeGrid.tsx:63` sets each chip's `width: "31%"` (3 per row), which is why titles clip (`Weekend …`, `Monthly R…`) on a 360dp screen. `desc` (line 86) uses `C.text3`, and progress (`b.progress`, a 0–1 fraction) has no numeric readout — only the bare `track`/`fill` bars at lines 49-51.

**Files:**
- Modify: `src/components/BadgeGrid.tsx`

**Interfaces:**
- Consumes: `EarnedBadge` (`src/achievements/types.ts:2`) — `Badge & { earned: boolean; progress: number }`, `progress` is a 0–1 fraction, already imported.
- Produces: nothing consumed downstream; this is a leaf visual change.

- [ ] **Step 1: Drop to 2 columns**

Replace:

```typescript
  chip: {
    width: "31%",
```

with:

```typescript
  chip: {
    width: "48%",
```

`gap: 10` on the parent `grid` (line 61, unchanged) already leaves room for two ~48%-wide chips per row without overflow.

- [ ] **Step 2: Add a numeric progress readout**

Replace the progress block (lines 48-52):

```typescript
            {!b.earned && (
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round(b.progress * 100)}%` }, inProgress && s.fillActive]} />
              </View>
            )}
```

with:

```typescript
            {!b.earned && (
              <>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.round(b.progress * 100)}%` }, inProgress && s.fillActive]} />
                </View>
                <Text style={s.progressLabel}>{Math.round(b.progress * 100)}%</Text>
              </>
            )}
```

Add `progressLabel` beside `track`/`fill`:

```typescript
  progressLabel: { color: C.text2, fontSize: 10, fontFamily: F.medium, marginTop: 2 },
```

`C.text2` is used deliberately, not `C.text3` — this is new text next to the already-flagged-low-contrast `desc`, so it should not repeat the same risk while Step 3 is still measuring `text3`.

- [ ] **Step 3: Measure locked-tile contrast against the chip's actual background**

`text3` was already raised in Phase 0 (`src/theme.ts:28`, now `#838B9D`) and documented as checked against `C.card`/`C.cardHi` — but `BadgeGrid`'s chip background is `C.bgElev` (line 64), a third surface never checked against `text3`. Compute the contrast ratio of `#838B9D` on `C.bgElev`'s hex value (read it from `src/theme.ts`) using the WCAG relative-luminance formula (same one used for the Phase 0 `text3` correction — check `src/theme.ts`'s comments/git history near line 28 for the exact method if unclear). If it measures **below 4.5:1**, change `desc`'s color from `C.text3` to `C.text2` (already used elsewhere in this same file's `titleLocked`, so it is a locally-consistent fallback, not a new token). If it measures **at or above 4.5:1**, leave `desc` as `C.text3` and record the measured ratio in the verification note (Task 12) instead of changing code.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify on device**

Open Profile, scroll to the achievement grid. Expected: 2 tiles per row, no title truncation (`Weekend Warrior`, `Monthly Regular`, etc. fully readable), each in-progress tile shows a `NN%` label under its progress bar, locked-tile description text is legible against its dark card. Compare against `14-profile-scrolled.png`.

- [ ] **Step 6: Commit**

```bash
git add src/components/BadgeGrid.tsx
git commit -m "fix(profile): drop achievement grid to 2 columns, add numeric progress, verify locked-tile contrast

Audit M5. 3-column tiles at ~100dp wide clipped roughly half the
achievement set's titles and descriptions. Progress bars now show a
percentage; locked-tile text contrast was measured against the tile's
actual background rather than assumed fixed by Phase 0's text3 change."
```

---

# M7 — NOTIFICATIONS TOGGLE

---

### Task 2: Replace the ambiguous "ON"/"OFF" pill with a platform `Switch`

`app/(app)/profile/index.tsx:477-486` renders a filled pill whose label is the current state (`"ON"`/`"OFF"`) rather than an action — audit M7's exact complaint: "ambiguous whether 'ON' reports the current state or is the button that turns notifications on."

**Files:**
- Modify: `app/(app)/profile/index.tsx:1` (import), `:477-487` (JSX), `:603-607` (styles, partial removal)

**Interfaces:**
- Consumes: `remindersOn: boolean`, `remindersBusy: boolean`, `toggleReminders: () => Promise<void>` — all already defined in this file (state at lines 34-35, handler referenced at line 479).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import `Switch` from react-native**

Find this file's `react-native` import line and add `Switch` to the destructured list (check the existing import first — it already pulls several RN components).

- [ ] **Step 2: Replace the pill with a `Switch`**

Replace (lines 477-487, exact JSX may have a line or two of surrounding whitespace — match on the `s.toggleChip` block):

```typescript
          <Pressable
            style={[s.toggleChip, remindersOn && s.toggleChipOn, remindersBusy && s.off]}
            onPress={() => void toggleReminders()}
            disabled={remindersBusy}
            accessibilityRole="switch"
            accessibilityState={{ checked: remindersOn, busy: remindersBusy }}
          >
            <Text style={[s.toggleChipText, remindersOn && s.toggleChipTextOn]}>
              {remindersOn ? "ON" : "OFF"}
            </Text>
          </Pressable>
```

with:

```typescript
          <Switch
            value={remindersOn}
            onValueChange={() => void toggleReminders()}
            disabled={remindersBusy}
            trackColor={{ false: C.line, true: C.red }}
            thumbColor={C.text}
            accessibilityLabel="Match reminders"
          />
```

Read the 10 lines immediately above line 477 first — if this row already has its own `accessibilityLabel` on a wrapping `View`/`Text` (e.g. "Match reminders" as a heading), don't duplicate the label text; otherwise keep the inline `accessibilityLabel` above so the control is still announced correctly (A1 in Phase 6 covers icon/tab labels specifically, not this — a `Switch` needs its own label regardless of nearby text, since RN doesn't auto-associate them).

- [ ] **Step 3: Remove now-unused styles**

`s.toggleChip`, `s.toggleChipOn`, `s.toggleChipText`, `s.toggleChipTextOn` (lines 603-606) were only used by the block just replaced — confirm with a search of this file for `s.toggleChip` before deleting; if nothing else references them, remove all four. `s.off` (line 607) is used elsewhere in this file (check before touching) — leave it either way.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify on device**

Open Profile, find the reminders row. Expected: a native platform `Switch` (track + thumb), not a red pill with text. Toggle it: expected it flips and the underlying `toggleReminders` behavior (including the "notifications are blocked" alert path, unchanged by this task) still fires correctly.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/profile/index.tsx
git commit -m "fix(profile): replace ambiguous ON/OFF pill with a platform Switch

Audit M7. A filled pill labelled with the current state read as either
a status readout or the control itself. A Switch is unambiguous."
```

---

# P1 / P3 — HOME STAT TILES AND DISPLAY NAME

---

### Task 3: Reserve label height on `StatTile` so all three tiles share a baseline; truncate the display name instead of letting it wrap mid-word

Two independent findings, one shared root cause pattern (unreserved space around variable-length text pushing a sibling element out of alignment) — bundled into one task since both are single-file, few-line fixes.

**P1:** `src/components/StatTile.tsx`'s `label` sits above `value` in a column with no reserved height (`s.tile: { ..., gap: 6 }`, `s.label` has no `minHeight`). `Longest Streak` wraps to 2 lines; `Matches`/`Win Rate` don't — so `Longest Streak`'s value renders ~1 line-height lower than its siblings.

**P3:** `app/(app)/profile/index.tsx:255` renders `<Text style={s.name}>{me}</Text>` with no `numberOfLines`. A long unspaced name (`UtkarshAgrawal`) has no space to wrap at, so RN's default text layout breaks it mid-word (`UtkarshAgra` / `wal`), and the edit pencil (line 258, a sibling in the same row) shifts down with the now-2-line name.

**Files:**
- Modify: `src/components/StatTile.tsx:19-26` (styles)
- Modify: `app/(app)/profile/index.tsx:255` (JSX)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1 (P1): Give `StatTile`'s label a fixed, 2-line-tall reservation**

Replace:

```typescript
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA.
  label: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3 },
```

with:

```typescript
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA.
  // minHeight reserves space for a 2-line label (e.g. "Longest Streak")
  // so every tile's value starts at the same y regardless of wrap (P1).
  label: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3, minHeight: 30, textAlign: "center" },
```

`minHeight: 30` is two `fontSize: 12` lines at roughly 15px line-height each, with a small margin — big enough for "Longest Streak" at this tile's width without over-reserving space above single-line labels. `textAlign: "center"` is added because a 2-line-tall reserved box otherwise left-aligns the shorter single-line labels off-center from the tile.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify on device (P1)**

Open Home. Expected: `Matches`, `Win Rate`, `Longest Streak` values all render at the same vertical position, regardless of `Longest Streak`'s label wrapping to 2 lines. Compare against `01-home.png`.

- [ ] **Step 4 (P3): Truncate the display name instead of letting it wrap**

Replace:

```typescript
            <Text style={s.name}>{me}</Text>
```

with:

```typescript
            <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">{me}</Text>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device (P3)**

Set a display name long enough to overflow the row width (e.g. "UtkarshAgrawalTester" via the existing edit-name flow, or check with the account already carrying a long name per the audit's `13-profile.png`). Expected: the name truncates with an ellipsis on one line, does not break mid-word, and the edit pencil icon stays vertically centered in the row regardless of name length. Compare against `13-profile.png`.

- [ ] **Step 7: Commit**

```bash
git add src/components/StatTile.tsx app/\(app\)/profile/index.tsx
git commit -m "fix(home,profile): reserve stat-tile label height, stop display name wrapping mid-word

Audit P1 and P3. StatTile's label had no reserved height, so a
2-line-wrapping 'Longest Streak' label pushed its value below the
single-line 'Matches'/'Win Rate' values. The profile display name had
no numberOfLines, so an unspaced long name broke mid-word and shifted
the edit pencil down with it."
```

---

# P5 — MATCHES FILTER CHIPS

---

### Task 4: Hide the filter-chip row when there are no matches at all

`app/(app)/matches/index.tsx:112-121` always renders the `All`/`Live`/`Completed`/`Forfeited` filter row, even when `live` and `done` (the two pieces of unfiltered state, lines 41-42) are both empty — audit P5's point is the chips render "with nothing to filter," not that a specific filtered view is empty (that already has its own empty state with a "Show all" CTA at lines 129-137).

**Files:**
- Modify: `app/(app)/matches/index.tsx:110-127`

**Interfaces:**
- Consumes: `live: Row[]`, `done: Row[]` — both already defined (lines 41-42).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Gate the filter bar on total match count**

Replace:

```typescript
  return (
    <View style={s.root}>
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
```

with:

```typescript
  const hasAnyMatches = live.length > 0 || done.length > 0;

  return (
    <View style={s.root}>
      {hasAnyMatches && (
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
```

Find the matching closing tags for `s.filterBar`'s `View` (the block that closes just after the `FILTERS.map(...)` at line 121 — read the next few lines to find its exact closing `</View>`) and add the matching `)}` immediately after that `</View>` closes, before whatever renders next (the `SectionList`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify on device**

On an account/club with zero matches (or temporarily filter to a state with none, then check the true empty-account case if reachable), open Matches. Expected: no filter chip row renders above the empty state. Create or view any match: expected chips reappear.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/matches/index.tsx
git commit -m "fix(matches): hide filter chips when there is nothing to filter

Audit P5. All/Live/Completed/Forfeited rendered even with zero total
matches, which the chips imply exist to filter."
```

---

# P7 — CLUB DETAIL BACK CHEVRON (measure first)

---

### Task 5: Verify club detail's back chevron, fix only if genuinely missing

`app/(app)/clubs/[id].tsx:69-77` sets `headerLeft` to `HeaderLogoLeft` only when `isOwner`; `HeaderLogoLeft` (`src/components/HeaderLogoLeft.tsx:27-37`) renders a back chevron whenever `canGoBack` is true, ahead of the logo. Non-owners get `headerLeft: undefined`, i.e. the default Stack header, which has its own back button. Reading the code, both paths should already show a back affordance — this may already be closed, the same pattern as Phase 4's P8/P16.

**Files:**
- Modify (only if Step 2 finds a real problem): `app/(app)/clubs/[id].tsx:69-77`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Bring up the environment and open club detail as both an owner and a non-owner**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

Navigate to a club's detail screen twice: once as its owner, once as a plain member (or any other non-owner role, if reachable with the current test account/club setup). Screenshot both headers.

- [ ] **Step 2: Compare against the code read above**

If both screenshots show a back chevron in the header — the finding is already closed. Skip to Step 4 and record it as such, no code change.

If either screenshot shows no back affordance — continue to Step 3.

- [ ] **Step 3: Fix, only if Step 2 found a real problem**

If the owner path is missing it: check whether `HeaderLogoLeft` is actually receiving `canGoBack: true` from the navigator (log or inspect `props` momentarily) — a false `canGoBack` would mean this screen is reached in a way that isn't a push (e.g. a tab root), which changes the fix (a fallback to `router.back()`-driven custom button rather than relying on the prop). If the non-owner path is missing it: `headerLeft: undefined` should fall through to expo-router's default, so a missing chevron there would point at a `headerShown: false` or similar option elsewhere in this file's `Stack.Screen` — read the full `options` object before assuming the fix is in `headerLeft` specifically. Since this branch is conditional on Step 2's finding, the exact fix is decided at that point against what's actually broken.

- [ ] **Step 4: Record the result and commit if changed**

If no change was needed: no commit for this task — the finding is recorded closed-by-prior-work in Task 12's verification README.

If a change was made:

```bash
git add app/\(app\)/clubs/\[id\].tsx
git commit -m "fix(clubs): restore club detail's back chevron

Audit P7."
```

---

# P10 — FRIENDS SEARCH

---

### Task 6: Add `searchUsers` to `friendRepo.ts`

`app/(app)/profile/friends.tsx`'s add-friend flow (lines 39-53) requires an exact username match with no feedback until submit. This task adds the data layer; Task 7 wires it into the UI.

**Files:**
- Modify: `src/repos/friendRepo.ts`

**Interfaces:**
- Consumes: `supabase` client (already imported in this file — check the existing import at the top before adding a new one).
- Produces: `searchUsers(prefix: string): Promise<{ id: string; username: string; displayName: string }[]>` — consumed by Task 7.

- [ ] **Step 1: Read the file's existing query patterns first**

Open `src/repos/friendRepo.ts` and read `listFriends` (line 94) and `listIncomingRequests` (line 108) in full — this task's new function should match their existing error-handling and `supabase` client-guard style (`if (!supabase) throw new Error(...)` or equivalent — copy whatever pattern those two already use, don't invent a new one).

- [ ] **Step 2: Add `searchUsers`**

Add near the other list functions (after `listOutgoingRequests`, before the file's closing):

```typescript
/** Live username/display-name prefix search. profiles are readable by any
 *  authenticated user (0001_init.sql), so no RLS change was needed for this. */
export async function searchUsers(prefix: string): Promise<{ id: string; username: string; displayName: string }[]> {
  const trimmed = prefix.trim();
  if (!supabase || trimmed.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .or(`username.ilike.${trimmed}%,display_name.ilike.${trimmed}%`)
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ id: p.id, username: p.username, displayName: p.display_name }));
}
```

`trimmed.length < 2` avoids a full-table scan on a single keystroke; Task 7's debounce is the primary guard, this is a cheap second one at the data layer. `.limit(8)` keeps the dropdown short — this is a search-as-you-type affordance, not a paged directory.

Read the exact column name for display name in this file's existing `Friend`/`FriendRequestRow` interfaces (lines 3-14) before finalizing the `select` string — `display_name` is the Supabase-side snake_case column per the usernames migration (`supabase/migrations/0029_usernames.sql:5` uses `display_name` already for a different table's naming convention; confirm `profiles.display_name` is the actual column name by checking the same migration file or `0003_display_name_set.sql`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/repos/friendRepo.ts
git commit -m "feat(friends): add searchUsers for live username/display-name lookup

Audit P10 (search-or-suggestion half). No RLS change needed — profiles
are already readable by any authenticated user."
```

---

### Task 7: Wire search into the Friends screen with a field label and a debounced dropdown

**Files:**
- Modify: `app/(app)/profile/friends.tsx`

**Interfaces:**
- Consumes: `searchUsers` from Task 6 — `(prefix: string) => Promise<{ id: string; username: string; displayName: string }[]>`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import `searchUsers` and add search state**

Extend the import at line 4-8:

```typescript
import {
  cancelRequest, listFriends, listIncomingRequests, listOutgoingRequests,
  removeFriend, respondToRequest, searchUsers, sendFriendRequest,
  type Friend, type FriendRequestRow,
} from "../../../src/repos/friendRepo";
```

Add beside the existing `useState` calls (after `pendingRemove`, line 23):

```typescript
  const [results, setResults] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [searching, setSearching] = useState(false);
```

- [ ] **Step 2: Debounce the search as `username` changes**

Add a `useEffect` after the `reload`/`useFocusEffect` block (after line 37), importing `useEffect` alongside the existing `useCallback`/`useState` import at line 1:

```typescript
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchUsers(trimmed)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [username]);
```

300ms is a standard search-debounce window — long enough to skip intermediate keystrokes, short enough to feel live.

- [ ] **Step 3: Add a field label and render the dropdown below the input**

Replace the `addRow` block (lines 118-133):

```typescript
            <View style={s.addRow}>
              <TextInput
                style={s.input}
                placeholder="Username"
                placeholderTextColor={C.text3}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                onSubmitEditing={onAdd}
              />
              <PressableScale style={[s.addBtn, sending && s.off]} disabled={sending} onPress={onAdd}>
                <Icon name="person-add" color={C.text} size={16} />
                <Text style={s.addBtnText}>Add</Text>
              </PressableScale>
            </View>
```

with:

```typescript
            <Text style={s.fieldLabel}>Add by username</Text>
            <View style={s.addRow}>
              <TextInput
                style={s.input}
                placeholder="Search by username or name"
                placeholderTextColor={C.text3}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                onSubmitEditing={onAdd}
              />
              <PressableScale style={[s.addBtn, sending && s.off]} disabled={sending} onPress={onAdd}>
                <Icon name="person-add" color={C.text} size={16} />
                <Text style={s.addBtnText}>Add</Text>
              </PressableScale>
            </View>
            {searching && <Text style={s.searchHint}>Searching…</Text>}
            {!searching && results.length > 0 && (
              <View style={s.resultsBox}>
                {results.map((r) => (
                  <Pressable
                    key={r.id}
                    style={s.resultRow}
                    onPress={() => { setUsername(r.username); setResults([]); }}
                  >
                    <Text style={s.resultName} numberOfLines={1}>{r.displayName}</Text>
                    <Text style={s.resultUsername} numberOfLines={1}>@{r.username}</Text>
                  </Pressable>
                ))}
              </View>
            )}
```

Tapping a result fills the exact username into the input rather than sending the request directly — this keeps `onAdd`'s existing `sendFriendRequest(trimmed)` call (line 44) as the single send path, so the dropdown is a suggestion aid, not a second code path that could drift from the exact-match flow's error handling.

Add `Pressable` to this file's `react-native` import (line 2) if not already present — check first.

- [ ] **Step 4: Add the new styles**

Add beside `addRow`/`input` in the `StyleSheet.create` block:

```typescript
  fieldLabel: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3, marginBottom: 6 },
  searchHint: { color: C.text2, fontSize: 12, fontFamily: F.body, marginTop: 4, marginBottom: 4 },
  resultsBox: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginTop: 4, marginBottom: 8, overflow: "hidden" },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  resultName: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 14 },
  resultUsername: { color: C.text2, fontFamily: F.body, fontSize: 13, marginLeft: 8 },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Open Profile → Friends. Expected: an "Add by username" label above the input; typing 2+ characters of a known user's name or username shows a "Searching…" hint then a dropdown of matches within ~300ms; tapping a result fills the input with their exact username; the existing `Add` button still sends the request. Confirm the `Requests`/`Sent` sections (already present, unchanged by this task) still render correctly. Compare against `16-friends.png`.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/profile/friends.tsx
git commit -m "fix(friends): add a field label and live search-as-you-type dropdown

Audit P10. The username field was placeholder-only with no label, and
required an exact match with no suggestions. The existing Requests/Sent
sections already closed the other half of this finding — no change
needed there."
```

---

# P11 — CLUB ROSTER: ROLE, AVATAR, OWNER PROTECTION

---

### Task 8: Add `listPlayerRoles` — a live Supabase query for role and avatar by profile

`listPlayers()` (`src/repos/clubRepo.ts:152-158`) reads only the offline `club_players_cache` table, which was never populated with role or avatar (confirmed: the sync code populating it, near this file's `refreshClubs`, only writes `id, club_id, profile_id, name`). Rather than extending the offline cache and its sync pipeline — a much larger change — this adds a live supplementary query, since the club roster management screen already requires a live connection for its other actions (`addFriendToClub`, `removePlayer` are both RPC calls, not offline-capable).

**Files:**
- Modify: `src/repos/clubRepo.ts`

**Interfaces:**
- Consumes: `supabase` client (already imported, line 2).
- Produces: `listPlayerRoles(clubId: string): Promise<Map<string, { role: string; avatarUrl: string | null }>>`, keyed by `profile_id` — consumed by Task 9. Returns an empty `Map` (not a throw) when offline, so callers can degrade gracefully rather than special-casing a network error on a read this secondary.

- [ ] **Step 1: Add `listPlayerRoles`**

Add after `listMyClubPlayers` (after line 166):

```typescript
/**
 * Role + avatar per club member, keyed by profile_id. Live query only —
 * club_players_cache (used by listPlayers) never synced these columns, and
 * this screen already requires a connection for add/remove actions, so a
 * supplementary live fetch is smaller than extending the offline cache.
 * Returns an empty map (not a throw) when offline — callers degrade to
 * name-only rows rather than failing the whole screen for a secondary field.
 */
export async function listPlayerRoles(clubId: string): Promise<Map<string, { role: string; avatarUrl: string | null }>> {
  if (!supabase) return new Map();
  const { data: members, error: mErr } = await supabase
    .from("club_members")
    .select("profile_id, role")
    .eq("club_id", clubId);
  if (mErr || !members) return new Map();
  const ids = members.map((m) => m.profile_id).filter(Boolean) as string[];
  if (ids.length === 0) return new Map();
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, avatar_url")
    .in("id", ids);
  const avatarById = new Map((profiles ?? []).map((p) => [p.id, p.avatar_url as string | null]));
  const out = new Map<string, { role: string; avatarUrl: string | null }>();
  for (const m of members) {
    if (!m.profile_id) continue;
    out.set(m.profile_id, { role: m.role, avatarUrl: pErr ? null : (avatarById.get(m.profile_id) ?? null) });
  }
  return out;
}
```

Two queries rather than one join — the Supabase JS client's `.select()` embedding syntax (`profiles(avatar_url)`) requires a foreign-key relationship Postgrest can discover, which needs checking against this project's actual schema relationships; two flat queries avoid that assumption and are simple enough at roster-list scale (a club's member count) to not need optimizing away.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/repos/clubRepo.ts
git commit -m "feat(clubs): add listPlayerRoles for role+avatar lookup by profile

Audit P11 (data half). listPlayers() only ever synced id/club_id/
profile_id/name to the offline cache; role and avatar need a live
query. Degrades to an empty map offline rather than throwing."
```

---

### Task 9: Render role badge and avatar per roster row; hide the remove control on the owner's own row

**Files:**
- Modify: `app/(app)/clubs/players/[clubId].tsx`

**Interfaces:**
- Consumes: `listPlayerRoles` from Task 8 — `(clubId: string) => Promise<Map<string, { role: string; avatarUrl: string | null }>>`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Import `listPlayerRoles` and add state for the role map**

Extend the import at line 4:

```typescript
import { addFriendToClub, getClub, listPlayerRoles, listPlayers, removePlayer, type ClubPlayer } from "../../../../src/repos/clubRepo";
```

Add beside the existing `useState` calls (after `addingId`, line 21):

```typescript
  const [roles, setRoles] = useState<Map<string, { role: string; avatarUrl: string | null }>>(new Map());
```

- [ ] **Step 2: Fetch roles alongside the player list**

In `reload` (lines 23-34), add a third parallel fetch:

```typescript
  const reload = useCallback(async () => {
    if (!clubId) return;
    try {
      const [list, club, roleMap] = await Promise.all([listPlayers(clubId), getClub(clubId), listPlayerRoles(clubId)]);
      setPlayers(list);
      setIsAdmin(club?.role === "owner" || club?.role === "admin");
      setRoles(roleMap);
    } catch (e) {
      toast((e as Error).message || "Could not load players", "error");
    } finally {
      setLoading(false);
    }
  }, [clubId]);
```

- [ ] **Step 3: Render role badge, avatar, and gate the remove control on the row's own role**

Replace the `renderItem` block (lines 97-110):

```typescript
        renderItem={({ item }) => (
          <View style={s.row}>
            <Text style={s.name} numberOfLines={1}>{item.name}</Text>
            {isAdmin ? (
              <PressableScale
                style={[s.remove, busyId === item.id && s.off]}
                disabled={busyId === item.id}
                onPress={() => setPending(item)}
              >
                <Icon name="trash-outline" color={C.text2} size={18} />
              </PressableScale>
            ) : null}
          </View>
        )}
```

with:

```typescript
        renderItem={({ item }) => {
          const meta = item.profile_id ? roles.get(item.profile_id) : undefined;
          const isRowOwner = meta?.role === "owner";
          return (
            <View style={s.row}>
              {meta?.avatarUrl ? (
                <Image source={{ uri: meta.avatarUrl }} style={s.avatar} />
              ) : (
                <View style={s.avatarFallback}>
                  <Icon name="person" color={C.text2} size={16} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                {meta?.role ? <Text style={s.roleBadge}>{meta.role}</Text> : null}
              </View>
              {isAdmin && !isRowOwner ? (
                <PressableScale
                  style={[s.remove, busyId === item.id && s.off]}
                  disabled={busyId === item.id}
                  onPress={() => setPending(item)}
                >
                  <Icon name="trash-outline" color={C.text2} size={18} />
                </PressableScale>
              ) : null}
            </View>
          );
        }}
```

`item.profile_id` is `null` for free-text/guest players (per `ClubPlayer`'s type, line 18 of `clubRepo.ts`) — those rows get no `meta`, so they render with the fallback avatar and no role badge, and keep the remove control if the viewer is admin (unchanged behavior for guest rows, since a guest can't be "the owner").

- [ ] **Step 4: Add `Image` import and the new styles**

Add `Image` to this file's `react-native` import (line 2).

Add to the `StyleSheet.create` block:

```typescript
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgElev },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgElev, alignItems: "center", justifyContent: "center" },
  roleBadge: { color: C.text2, fontSize: 11, fontFamily: F.medium, textTransform: "capitalize", marginTop: 2 },
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Verify on device**

Open a club's manage-players screen as an admin. Expected: each registered member's row shows an avatar (or fallback icon) and a lowercase-to-capitalized role label under their name; guest/free-text rows show the fallback icon and no role label; the club owner's own row has no trash icon even though other rows do (as an admin viewing it). Compare against `18-club-manage-players.png`.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/clubs/players/\[clubId\].tsx
git commit -m "fix(clubs): show role and avatar on roster rows, protect the owner's row from removal

Audit P11. Roster rows showed name only, and the owner's own row
carried the same remove control as every other member's."
```

---

# P13 — ENTRANT ROWS

---

### Task 10: Add a checkbox-circle affordance to entrant rows; show the min-players hint at zero

`app/(app)/tournaments/new.tsx`'s entrant `Pressable` rows (lines 221-230) signal selection only via border/background color (`s.playerOn`, line 262) — no icon, so unselected rows don't visually read as tappable. Separately, the min-players hint (line 237) only renders once `picked.length > 0`, so a user who hasn't picked anyone yet sees no guidance.

**Files:**
- Modify: `app/(app)/tournaments/new.tsx:221-230` (JSX), `:261-264` (styles), `:237` (hint condition)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Add the checkbox circle to each row**

Replace (lines 225-230):

```typescript
                return (
                  <Pressable style={({ pressed }) => [s.player, pressed && press, on && s.playerOn]} onPress={() => toggle(item.id)}>
                    <Text style={[s.playerName, on && { color: C.text }]}>{item.name}</Text>
                    {on ? <Text style={s.seed}>{badge}</Text> : null}
                  </Pressable>
                );
```

with:

```typescript
                return (
                  <Pressable style={({ pressed }) => [s.player, pressed && press, on && s.playerOn]} onPress={() => toggle(item.id)}>
                    <View style={[s.checkbox, on && s.checkboxOn]}>
                      {on && <Icon name="checkmark" color={C.text} size={14} />}
                    </View>
                    <Text style={[s.playerName, { flex: 1 }, on && { color: C.text }]}>{item.name}</Text>
                    {on ? <Text style={s.seed}>{badge}</Text> : null}
                  </Pressable>
                );
```

Confirm `Icon` and `View` are already imported in this file (both are used elsewhere here — check before adding).

- [ ] **Step 2: Add the checkbox styles**

Add beside `player`/`playerOn`/`playerName` (lines 261-264):

```typescript
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center", marginRight: 10 },
  checkboxOn: { backgroundColor: C.red, borderColor: C.red },
```

`checkboxOn` uses `C.red` deliberately, not the `selected` token — this is a genuine "picked into the roster" affirmative state on a leaf checkbox glyph, the same category as a native checkbox fill, not a segmented-control-style selection state; `s.playerOn`'s row-level highlight (already `C.lineHi`/`C.cardHi` from Phase 4's M2 fix) remains the neutral one.

- [ ] **Step 3: Show the hint at zero picks too**

Replace:

```typescript
      {picked.length > 0 && entrantsBlocker ? <Text style={s.err}>{entrantsBlocker}</Text> : null}
```

with:

```typescript
      {entrantsBlocker ? <Text style={s.err}>{entrantsBlocker}</Text> : null}
```

Read `entrantsBlocker`'s definition (`startBlocker(picked.length, matchType)`, line 51) first — confirm it already returns a non-null message at `picked.length === 0` (e.g. "Add at least 4 players to start") rather than `null` specifically for the zero case; if it returns `null` at zero by design, this step also needs a one-line change to `startBlocker` itself (check `src/lib/` or wherever `startBlocker` is defined) so zero is treated the same as "not enough," not as "no opinion."

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify on device**

Open New tournament → Entrants tab with zero players picked. Expected: the "Add at least N players to start" hint is visible immediately, before any selection. Tap a player row: expected an empty ring becomes a filled red checkmark circle, and the row's background/border highlight (unchanged) still applies. Compare against `36-new-tournament-config.png`, `37-entrant-selected.png`.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/tournaments/new.tsx
git commit -m "fix(tournaments): add checkbox affordance to entrant rows, show min-players hint at zero

Audit P13. Entrant rows only signalled selection via border/background
color with no icon, so unselected rows didn't read as tappable. The
minimum-players hint also only appeared after the first pick, not at
zero, when a first-time user most needs it."
```

---

# P18 — INVITE CODE ON HOME

---

### Task 11: Remove the invite code from the Home club list row

`app/(app)/index.tsx:204-207` appends `· code {invite_code}` to the club list row's meta text — a shareable secret surfaced without the user asking, when it's already on club detail behind a dedicated share button (`app/(app)/clubs/[id].tsx`'s `shareBtn`/`ShareIcon`, confirmed present).

**Files:**
- Modify: `app/(app)/index.tsx:204-207`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Drop the invite-code clause**

Replace:

```typescript
                    <Text style={s.clubMeta}>
                      {club.role ?? "member"}
                      {club.invite_code ? ` · code ${club.invite_code}` : ""}
                    </Text>
```

with:

```typescript
                    <Text style={s.clubMeta}>
                      {club.role ?? "member"}
                    </Text>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify on device**

Open Home. Expected: club list rows show only the role (`owner`/`admin`/`member`), no invite code. Open that club's detail screen: expected the invite code is still reachable via its existing share button, unaffected by this change.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/index.tsx
git commit -m "fix(home): stop surfacing the club invite code in the club list row

Audit P18. The invite code is a shareable secret already reachable via
club detail's dedicated share button; the Home list row exposed it
without the user asking."
```

---

# VERIFICATION

---

### Task 12: Phase 5 verification re-audit

A phase is done when every finding it claims has a paired before/after (spec §10). A device is confirmed present this session — verification should capture real screenshots, matching the audit's own baseline format, not fall back to code-only evidence unless the device is genuinely lost partway through.

**Files:**
- Create: `docs/audit/verify/phase-5/` and its contents.

- [ ] **Step 1: Bring the environment up**

```bash
adb reverse tcp:8081 tcp:8081
```

```bash
npx expo start --dev-client --port 8081
```

If mobile-mcp reports no device, recover with `adb kill-server && adb start-server`. If the device shows signs of a concurrent session, do not disturb it — record the gap honestly rather than forcing a restart, same as prior phases.

- [ ] **Step 2: Capture the evidence**

Into `docs/audit/verify/phase-5/`, named after the baseline each answers:

| Finding | Baseline | Capture as | Passes when |
|---|---|---|---|
| M5 | `14-profile-scrolled.png` | `m5-achievement-grid.png` | 2-column grid, no title/description clipping, progress bars show a percentage, locked-tile text is legible |
| M7 | `15-profile-bottom.png` | `m7-reminders-switch.png` | Native `Switch`, not a red ON/OFF pill |
| P1 | `01-home.png` | `p1-stat-tiles.png` | Matches/Win Rate/Longest Streak values share a baseline |
| P3 | `13-profile.png` | `p3-display-name.png` | Long name truncates with ellipsis, does not wrap mid-word, pencil stays anchored |
| P5 | `05-matches.png` | `p5-matches-empty.png` | No filter chips when there are zero total matches |
| P7 | `17-club-detail.png` | `p7-club-detail-header.png` | Record whether a code change was needed (Task 5) |
| P10 | `16-friends.png` | `p10-friends-search.png` | Field label present; typing shows a live match dropdown |
| P11 | `18-club-manage-players.png` | `p11-roster-rows.png` | Rows show role + avatar; owner's row has no remove control |
| P13 | `36-new-tournament-config.png`, `37-entrant-selected.png` | `p13-entrant-rows.png` | Checkbox circle on every row; hint visible at zero picks |
| P18 | `01-home.png` | `p18-home-club-row.png` | No invite code in the club list row |

- [ ] **Step 3: Write the verification note**

Create `docs/audit/verify/phase-5/README.md` listing each finding, its baseline, its capture, and pass/fail. Record explicitly:

- Whether P7's back chevron needed any code change, or was already closed (Task 5).
- Whether the device stayed available for the full verification pass, and if not, exactly which findings fell back to code-only evidence and why.
- The measured contrast ratio from Task 1 Step 3 (M5's locked-tile text against `C.bgElev`), whether it passed at 4.5:1, and whether a code change was needed as a result.
- Anything that did not close, and why.

- [ ] **Step 4: Run the full suite**

```bash
npx jest
```

```bash
npx tsc --noEmit
```

Expected: both PASS. This phase adds no new test files (no new `src/lib/` pure functions — `searchUsers` and `listPlayerRoles` are thin Supabase-query wrappers, not logic worth unit-testing in isolation from a live backend), so the suite's count should be unchanged from Phase 4's 67 suites / 456 tests unless a Task 1 Step 3 contrast fix or a P7 Task 5 discovery happened to require one.

- [ ] **Step 5: Commit**

```bash
git add docs/audit/verify/phase-5
git commit -m "docs(audit): verify phase 5 closes M5, M7, P1, P3, P5, P7, P10, P11, P13, P18"
```

---

## Not in this plan

**Phase 6** (accessibility sweep: A1-A3, A5-A6, A8) — untouched, per spec §11's phase-attributability ordering.

**Extending the offline SQLite cache to carry role/avatar** (P11) — `listPlayerRoles` is a live-only supplementary query specifically to avoid this larger change; if the roster screen later needs to work fully offline with role/avatar, that is separate scope from this finding.

**A join-based single-query version of `listPlayerRoles`** — two flat queries were chosen over a Postgrest embedded `.select()` join because the latter requires confirming a discoverable foreign-key relationship between `club_members` and `profiles` in this project's actual schema, which this plan's research did not verify; if a future pass confirms the relationship, collapsing to one query is a safe follow-up, not a requirement of closing P11.
