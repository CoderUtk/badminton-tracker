# Delete, Onboarding Fields, and Session Auto-Finish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner/admin can hard-delete a session or tournament (matches survive, unlinked); new users are asked for age (optional) and playing hand (required) on the welcome screen; live sessions older than 24 hours auto-finish the next time anyone reads them.

**Architecture:** Delete permission is a client-side check only (`clubs_cache.role`), because sessions/tournaments never reach Supabase — a pre-existing gap, not something this plan fixes. Deletes remove local SQLite rows directly (no FK cascade exists locally) and unlink matches by setting `session_id`/nothing rather than destroying match history. Auto-finish is a pure predicate (`isStaleLive`) called as a side effect of `listSessions`/`getSession`. Onboarding fields are two new nullable `profiles` columns, written in one Supabase call alongside the existing display-name save.

**Tech Stack:** Expo SDK 54, expo-router v6, Supabase, expo-sqlite, Jest. No new dependencies.

## Global Constraints

- `src/engine/*` untouched.
- No new dependencies.
- Delete permission ("owner" or "admin") is enforced client-side only via `Club.role` from `getClub()` — sessions/tournaments have no Supabase presence yet, so there is no server-side boundary to add here.
- Hard delete only — no soft-delete/`'cancelled'`-status path. Matches created under a deleted session/tournament survive, unlinked from it.
- No native `Alert` — use the existing `Sheet` component (`src/components/Sheet.tsx`) for delete confirmation.
- Age/hand fields apply only to users going through the welcome screen for the first time; no backfill, no re-prompting existing users.
- Session auto-finish is a lazy check on read (no scheduled job) — extends the existing `endSession` behavior rather than a bare status flip.
- Gate every task on `npx tsc --noEmit && npm test`.

## Global Constraints — user-provided

`supabase/migrations/0005_profile_age_hand.sql` must be applied by the user in the Supabase SQL Editor (or `supabase db push`) before Task 5's write path works end-to-end. Manual on-device verification (delete as admin vs. non-admin, welcome flow for a fresh account, a session left live past 24h) happens after implementation — it cannot be done from this environment.

---

## Task 1: Pure 24h-staleness helper

**Files:**
- Create: `src/session/autoFinish.ts`
- Test: `tests/autoFinish.test.ts`

**Interfaces:**
- Produces:
  - `AUTO_FINISH_HOURS = 24`
  - `isStaleLive(session: { status: string; starts_at: number }, now: number): boolean`

**Why a separate file, not inline in `sessionRepo.ts`:** `sessionRepo.ts` statically imports `expo-crypto`, which Jest cannot resolve without a mock (the project has none — confirmed via `jest.config.js`, which has no `moduleNameMapper`/transform for Expo native modules). This is the exact failure that previously forced `src/tournament/rows.ts` to be extracted from `tournamentRepo.ts`. `isStaleLive` must live in a module with zero native imports so `tests/autoFinish.test.ts` can import it directly.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/autoFinish.test.ts
import { isStaleLive, AUTO_FINISH_HOURS } from "../src/session/autoFinish";

const HOUR = 60 * 60 * 1000;

test("not stale when status is not live", () => {
  expect(isStaleLive({ status: "scheduled", starts_at: 0 }, HOUR * 100)).toBe(false);
  expect(isStaleLive({ status: "done", starts_at: 0 }, HOUR * 100)).toBe(false);
});

test("not stale when live and within the window", () => {
  const now = 1000 * HOUR;
  expect(isStaleLive({ status: "live", starts_at: now - (AUTO_FINISH_HOURS - 1) * HOUR }, now)).toBe(false);
});

test("stale when live and older than the window", () => {
  const now = 1000 * HOUR;
  expect(isStaleLive({ status: "live", starts_at: now - (AUTO_FINISH_HOURS + 1) * HOUR }, now)).toBe(true);
});

test("exactly at the boundary is not yet stale", () => {
  const now = 1000 * HOUR;
  expect(isStaleLive({ status: "live", starts_at: now - AUTO_FINISH_HOURS * HOUR }, now)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/autoFinish.test.ts`
Expected: FAIL — "Cannot find module '../src/session/autoFinish'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/session/autoFinish.ts
export const AUTO_FINISH_HOURS = 24;

/**
 * True when a session is still marked live long after it should have ended.
 * Strictly-greater-than the window, so a session exactly AUTO_FINISH_HOURS old
 * is not yet stale — it becomes stale on the next check after that instant.
 */
export function isStaleLive(session: { status: string; starts_at: number }, now: number): boolean {
  if (session.status !== "live") return false;
  return now - session.starts_at > AUTO_FINISH_HOURS * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/autoFinish.test.ts && npx tsc --noEmit`
Expected: PASS, 4 tests. tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/session/autoFinish.ts tests/autoFinish.test.ts
git commit -m "feat(sessions): pure 24h-staleness helper"
```

---

## Task 2: Wire auto-finish into session reads

**Files:**
- Modify: `src/repos/sessionRepo.ts`

**Interfaces:**
- Consumes: `isStaleLive` (Task 1), existing `endSession` (already defined in this file, below `listSessions`/`getSession` — safe to call, `async function` declarations are hoisted).

- [ ] **Step 1: Import the helper and sweep stale rows in both read functions.**

In `src/repos/sessionRepo.ts`, add the import:

```typescript
import { isStaleLive } from "../session/autoFinish";
```

Replace `listSessions`:

```typescript
export async function listSessions(clubId?: string): Promise<ClubSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = clubId
    ? await db.getAllAsync<ClubSession>(
        "select * from sessions_cache where club_id = ? order by starts_at desc", clubId
      )
    : await db.getAllAsync<ClubSession>("select * from sessions_cache order by starts_at desc");
  const now = Date.now();
  for (const row of rows) {
    if (isStaleLive(row, now)) {
      await endSession(row.id);
      row.status = "done";
    }
  }
  return rows;
}
```

Replace `getSession`:

```typescript
export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>("select * from sessions_cache where id = ?", id)) ?? null;
  if (row && isStaleLive(row, Date.now())) {
    await endSession(row.id);
    row.status = "done";
  }
  return row;
}
```

- [ ] **Step 2: Typecheck and run the full suite.**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all existing tests still pass (this touches read paths only, no schema change).

- [ ] **Step 3: Commit**

```bash
git add src/repos/sessionRepo.ts
git commit -m "feat(sessions): auto-finish stale live sessions on read"
```

---

## Task 3: Session delete

**Files:**
- Modify: `src/components/Icon.tsx` (add a trash icon)
- Modify: `src/repos/sessionRepo.ts` (delete function)
- Modify: `app/(app)/sessions/[id].tsx` (delete UI)

**Interfaces:**
- Produces:
  - `IconName` gains `"trash-outline"`.
  - `deleteSession(id: string): Promise<void>` in `sessionRepo.ts`.

- [ ] **Step 1: Add a trash icon.** `src/components/Icon.tsx`'s `IconName` union has no delete-appropriate glyph (`"close"` is used elsewhere for cancel/dismiss, not destroy). Add `"trash-outline"` to the Ionicons branch of the union (Ionicons has this glyph natively; it does not go in the `MCI` set):

```typescript
export type IconName =
  // Ionicons
  | "home" | "home-outline"
  | "calendar" | "calendar-outline"
  | "person" | "person-outline"
  | "people-outline"
  | "play" | "pause" | "stop" | "flag"
  | "time-outline"
  | "arrow-undo" | "arrow-redo"
  | "chevron-forward" | "add" | "close"
  | "log-out-outline" | "swap-horizontal" | "swap-vertical"
  | "ellipse" | "trash-outline"
  // MaterialCommunityIcons
  | "badminton" | "trophy" | "trophy-outline"
  | "shuffle-variant" | "account-group" | "account-plus"
  | "scoreboard-outline";
```

- [ ] **Step 2: Add `deleteSession` to `sessionRepo.ts`.**

```typescript
/**
 * Hard-delete a session. Matches created under it survive, unlinked — SQLite
 * has no FK enforcement locally, so this mirrors in code the same
 * on-delete-set-null relationship the Supabase schema already declares for
 * matches.session_id (0001_init.sql:77).
 */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync("update matches set session_id = null where session_id = ?", id);
  await db?.runAsync("delete from sessions_cache where id = ?", id);
}
```

- [ ] **Step 3: Add delete UI to `app/(app)/sessions/[id].tsx`.**

Add to the imports:

```typescript
import {
  deleteSession, endSession, getSession, getSessionStats, listAttendance, setAttendance, updateSessionStatus,
  type Attendance, type ClubSession, type SessionStats,
} from "../../../src/repos/sessionRepo";
import { getClub } from "../../../src/repos/clubRepo";
import Sheet from "../../../src/components/Sheet";
```

Add state, alongside the existing `useState` calls:

```typescript
const [clubRole, setClubRole] = useState<string | null>(null);
const [confirmingDelete, setConfirmingDelete] = useState(false);
```

In `reload`, inside the existing `if (next) { ... }` block, add a fetch of the club role (place it anywhere inside that block, e.g. right after `setSession(next)` and before the attendance/matches fetches):

```typescript
const club = await getClub(next.club_id);
setClubRole(club?.role ?? null);
```

After the existing `openMatch` function (or anywhere before the `if (!session) return ...` guard), add:

```typescript
const onDeleteSession = async () => {
  if (!session) return;
  setConfirmingDelete(false);
  try {
    await deleteSession(session.id);
    router.back();
  } catch (e) {
    toast((e as Error).message || "Could not delete session", "error");
  }
};
```

After the `if (!session) return ...` guard (so `session` is known non-null below it), add:

```typescript
const isAdmin = clubRole === "owner" || clubRole === "admin";
```

Add a `ListFooterComponent` prop to the existing `<FlatList ...>` (the component currently has no footer — add this prop alongside `ListHeaderComponent`/`ListEmptyComponent`/`renderItem`), so the delete action sits at the true bottom of the screen regardless of which tab is active:

```tsx
ListFooterComponent={
  isAdmin ? (
    <>
      <Pressable style={s.deleteBtn} onPress={() => setConfirmingDelete(true)}>
        <Icon name="trash-outline" color={C.red} size={18} />
        <Text style={s.deleteText}>Delete session</Text>
      </Pressable>
      <Sheet
        visible={confirmingDelete}
        title="Delete session?"
        message={`This permanently deletes "${session.location || "this session"}". Matches already played stay in history.`}
        actions={[
          { label: "Delete", onPress: onDeleteSession, destructive: true },
          { label: "Cancel", onPress: () => setConfirmingDelete(false) },
        ]}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  ) : null
}
```

Add to the `StyleSheet.create` block at the bottom of the file:

```typescript
deleteBtn: { flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 16 },
deleteText: { color: C.red, fontSize: 16, fontWeight: "700" },
```

- [ ] **Step 4: Typecheck and run the full suite.**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/Icon.tsx src/repos/sessionRepo.ts "app/(app)/sessions/[id].tsx"
git commit -m "feat(sessions): owner/admin can delete a session"
```

---

## Task 4: Tournament delete

**Files:**
- Modify: `src/repos/tournamentRepo.ts` (delete function)
- Modify: `app/(app)/tournaments/[id].tsx` (delete UI)

**Interfaces:**
- Consumes: `"trash-outline"` `IconName` (added in Task 3).
- Produces: `deleteTournament(id: string): Promise<void>` in `tournamentRepo.ts`.

- [ ] **Step 1: Add `deleteTournament` to `tournamentRepo.ts`.**

```typescript
/**
 * Hard-delete a tournament and its bracket structure. Matches created under
 * it survive, unlinked — SQLite has no FK cascade locally, so entrants and
 * bracket cells are removed explicitly rather than relying on the cascade
 * the Supabase schema declares (0002_tournaments.sql:12,18).
 */
export async function deleteTournament(id: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync("delete from tournament_entrants where tournament_id = ?", id);
  await db?.runAsync("delete from bracket_matches where tournament_id = ?", id);
  await db?.runAsync("delete from tournaments where id = ?", id);
}
```

- [ ] **Step 2: Add delete UI to `app/(app)/tournaments/[id].tsx`.**

Replace the imports at the top of the file:

```tsx
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteTournament, finishBracketMatch, getTournament, startBracketMatch,
} from "../../../src/repos/tournamentRepo";
import { getMatch } from "../../../src/repos/matchRepo";
import { getClub } from "../../../src/repos/clubRepo";
import { bracketStatus } from "../../../src/tournament/bracket";
import type { BracketMatch, Entrant } from "../../../src/tournament/types";
import BracketView from "../../../src/components/BracketView";
import Icon from "../../../src/components/Icon";
import Sheet from "../../../src/components/Sheet";
import { toast } from "../../../src/lib/toast";
import { C, F } from "../../../src/theme";
```

Add state, alongside the existing `useState` calls:

```typescript
const [clubRole, setClubRole] = useState<string | null>(null);
const [confirmingDelete, setConfirmingDelete] = useState(false);
```

In `reload`'s async block, after `const { tournament, entrants: ents, bracket } = await getTournament(id);`, add:

```typescript
const club = await getClub(tournament.clubId);
setClubRole(club?.role ?? null);
```

After the existing `doStart` function, add:

```typescript
const isAdmin = clubRole === "owner" || clubRole === "admin";

const onDeleteTournament = async () => {
  if (!id) return;
  setConfirmingDelete(false);
  try {
    await deleteTournament(id);
    router.back();
  } catch (e) {
    toast((e as Error).message || "Could not delete tournament", "error");
  }
};
```

Replace the returned JSX (add the delete button and a second `Sheet` — this screen already has one `Sheet` for starting a match, driven by `pending`; the delete confirmation needs its own, driven by `confirmingDelete`):

```tsx
return (
  <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
    {title ? <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 18, marginBottom: 4 }}>{title}</Text> : null}
    {champName ? (
      <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
    ) : null}
    <BracketView bracket={bracket} entrants={entrants} onCellPress={onCellPress} />
    {isAdmin && (
      <Pressable
        style={{ flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 12 }}
        onPress={() => setConfirmingDelete(true)}
      >
        <Icon name="trash-outline" color={C.red} size={18} />
        <Text style={{ color: C.red, fontSize: 16, fontWeight: "700" }}>Delete tournament</Text>
      </Pressable>
    )}
    <Sheet
      visible={!!pending}
      title="Start match"
      message="Create and score this match now?"
      actions={[
        { label: "Start", onPress: doStart, primary: true },
        { label: "Cancel", onPress: () => setPending(null) },
      ]}
      onClose={() => setPending(null)}
    />
    <Sheet
      visible={confirmingDelete}
      title="Delete tournament?"
      message={`This permanently deletes "${title}". Matches already played stay in history.`}
      actions={[
        { label: "Delete", onPress: onDeleteTournament, destructive: true },
        { label: "Cancel", onPress: () => setConfirmingDelete(false) },
      ]}
      onClose={() => setConfirmingDelete(false)}
    />
  </View>
);
```

This file uses inline styles throughout (no `StyleSheet.create` block) — the delete button follows that existing convention rather than introducing a new stylesheet object.

- [ ] **Step 3: Typecheck and run the full suite.**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/repos/tournamentRepo.ts "app/(app)/tournaments/[id].tsx"
git commit -m "feat(tournaments): owner/admin can delete a tournament"
```

---

## Task 5: Profile migration + `completeOnboarding`

**Files:**
- Create: `supabase/migrations/0005_profile_age_hand.sql`
- Modify: `src/repos/profileRepo.ts`

**Interfaces:**
- Produces:
  - `type Hand = "left" | "right"`
  - `completeOnboarding(name: string, age: number | null, hand: Hand): Promise<void>`

`completeOnboarding` is a new function, separate from the existing `setDisplayName`. `setDisplayName` is still used unchanged by `app/(app)/profile.tsx` to edit just the display name later — extending its signature would couple an unrelated caller to fields it doesn't use. The welcome screen gets its own one-shot save that writes name, age, hand, and `display_name_set` together, matching the spec's "one save call, not three."

- [ ] **Step 1: Write the migration.**

```sql
-- supabase/migrations/0005_profile_age_hand.sql
-- Optional onboarding fields captured at first login. Both nullable —
-- existing users never see the welcome screen again (display_name_set is
-- already true for them), so there is nothing to backfill and no forced
-- re-prompt.
alter table public.profiles add column if not exists age int;
alter table public.profiles add column if not exists hand text check (hand in ('left', 'right'));
```

- [ ] **Step 2: Apply it.**

Paste the file into the Supabase SQL Editor and run it (or `supabase db push`). Expect "Success. No rows returned."

- [ ] **Step 3: Add `completeOnboarding` to `profileRepo.ts`.**

```typescript
export type Hand = "left" | "right";

/**
 * First-login save: name, optional age, and required hand, in one write.
 * Distinct from setDisplayName, which app/(app)/profile.tsx uses later to
 * edit only the name — that caller has no reason to touch age/hand.
 */
export async function completeOnboarding(name: string, age: number | null, hand: Hand): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name.trim(), display_name_set: true, age, hand })
    .eq("id", uid);
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
}
```

- [ ] **Step 4: Typecheck and run the full suite.**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_profile_age_hand.sql src/repos/profileRepo.ts
git commit -m "feat(profile): age and hand fields for first-login onboarding"
```

---

## Task 6: Welcome screen age + hand fields

**Files:**
- Modify: `app/welcome.tsx`

**Interfaces:** Consumes `completeOnboarding`, `type Hand` (Task 5).

- [ ] **Step 1: Update imports.** Replace the `profileRepo` import (drop the now-unused `setDisplayName`; add `completeOnboarding` and the `Hand` type) and add `Pressable`:

```typescript
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { completeOnboarding, getMyProfile, type Hand } from "../src/repos/profileRepo";
import { validateName } from "../src/lib/validate";
import { toast } from "../src/lib/toast";
import { consumePendingLink } from "../src/lib/pendingLink";
import { parseJoinTarget } from "../src/lib/joinLink";
import FormScreen from "../src/components/FormScreen";
import Logo from "../src/components/Logo";
import PressableScale from "../src/components/PressableScale";
import { C, F, GRAD, glow } from "../src/theme";
```

- [ ] **Step 2: Add state and replace `onContinue`.**

Add alongside the existing `name`/`touched`/`busy` state:

```typescript
const [age, setAge] = useState("");
const [hand, setHand] = useState<Hand | null>(null);
```

Replace `onContinue`:

```typescript
const onContinue = async () => {
  if (error) { setTouched(true); toast(error, "error"); return; }
  if (!hand) { toast("Choose your playing hand", "error"); return; }
  setBusy(true);
  try {
    const ageValue = age.trim() ? Number(age.trim()) : null;
    await completeOnboarding(name, ageValue, hand);
    // Gate may have re-parked a join destination while this profile lacked a
    // display name — honour it instead of always landing on home.
    const path = consumePendingLink();
    const target = path ? parseJoinTarget(path) : null;
    router.replace(target ? `/join/club/${target.id}` : "/");
  } catch (e) {
    toast((e as Error).message || "Could not save your name", "error");
  } finally {
    setBusy(false);
  }
};
```

- [ ] **Step 3: Add the fields to the JSX, and update the CTA's disabled condition.**

Inside the `<View style={s.card}>`, between the existing name-error `Text` and the `PressableScale` CTA, add:

```tsx
<Text style={[s.label, { marginTop: 4 }]}>Age (optional)</Text>
<TextInput
  style={s.input}
  placeholder="Your age"
  placeholderTextColor={C.text3}
  keyboardType="number-pad"
  maxLength={3}
  value={age}
  onChangeText={setAge}
  returnKeyType="done"
/>

<Text style={[s.label, { marginTop: 4 }]}>Playing hand</Text>
<View style={s.handRow}>
  {(["left", "right"] as Hand[]).map((h) => (
    <Pressable key={h} style={[s.handChip, hand === h && s.handChipOn]} onPress={() => setHand(h)}>
      <Text style={[s.handChipText, hand === h && s.handChipTextOn]}>{h === "left" ? "Left" : "Right"}</Text>
    </Pressable>
  ))}
</View>
```

Update the CTA's `PressableScale` to also require `hand`:

```tsx
<PressableScale
  style={[s.ctaWrap, (!!error || !hand || busy) && s.off]}
  disabled={!!error || !hand || busy}
  onPress={onContinue}
>
```

- [ ] **Step 4: Add styles.** In the `StyleSheet.create` block:

```typescript
handRow: { flexDirection: "row", gap: 8 },
handChip: { flex: 1, backgroundColor: C.bgElev, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingVertical: 14, alignItems: "center" },
handChipOn: { backgroundColor: C.red, borderColor: C.red },
handChipText: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
handChipTextOn: { color: C.text },
```

- [ ] **Step 5: Typecheck and run the full suite.**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

Manual, on device: a fresh sign-up lands on welcome with Continue disabled until a hand is picked; age is skippable; after Continue, the profile has `age`/`hand` set (verify in Supabase table editor).

- [ ] **Step 6: Commit**

```bash
git add app/welcome.tsx
git commit -m "feat(onboarding): age and playing-hand fields on the welcome screen"
```

---

## Self-Review

**Spec coverage:**
- Delete session & tournament, owner/admin, client-side permission check, hard delete, matches survive unlinked, `Sheet` confirmation → Tasks 3, 4. ✅
- Onboarding age (optional) + hand (required) → Tasks 5, 6. ✅
- Session auto-finish after 24h, lazy check on read, reuses `endSession` → Tasks 1, 2. ✅

**Type consistency:** `Hand` defined once in Task 5, consumed unchanged in Task 6. `isStaleLive`'s signature matches between Task 1's definition and Task 2's two call sites. `deleteSession`/`deleteTournament` signatures match their single call sites in Tasks 3/4. `"trash-outline"` added once in Task 3, consumed by Task 4.

**Placeholder scan:** none — every function, migration, and JSX block is written out in full; UI-shaped steps name exact files, state, and styles.

**Ordering:** Task 1 precedes Task 2 (consumes `isStaleLive`). Task 3 precedes Task 4 (adds the `"trash-outline"` icon Task 4 reuses). Task 5 precedes Task 6 (consumes `completeOnboarding`/`Hand`). Tasks 1–2, 3, 4, and 5–6 are otherwise independent of each other and could be reordered as a group if needed.

**Known pre-existing inconsistency, not introduced by this plan:** `app/(app)/sessions/[id].tsx` already uses React Native's `Alert` twice (`finishSession`, the "share to story" placeholder) despite the project's stated no-`Alert` rule. This plan's new delete flow uses `Sheet` as required; the existing `Alert` calls are left as-is — fixing them is out of scope here.

**Out of scope (confirmed, matches spec):** editing age/hand from Profile after first login; tournament share link, court config, live bracket scores (blocked on the separate tournament-cloud-sync plan); any change to the scoring engine; any change to how sessions/tournaments sync with Supabase.
