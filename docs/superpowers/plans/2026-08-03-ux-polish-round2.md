# UX Polish Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tournament join flow reachable, fix the Home keyboard, scope the live-match list to a club, move deletes into a header menu, and tighten display-name validation.

**Architecture:** Six independent tasks against the existing Expo Router + Supabase + expo-sqlite app. One new pure helper (`shareJoin`), one new presentational component (`MenuButton`), one migration (club DELETE policy). No changes to `src/engine`.

**Tech Stack:** TypeScript, Expo SDK 57, expo-router, react-native, Supabase (Postgres + RLS), expo-sqlite, Jest.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code.
- Gate every task on `npx tsc --noEmit && npm test`. Both must pass before commit.
- Never put a column in both `TOURNAMENT_DDL` and `TOURNAMENT_ALTER_DDL` (see `tests/schema.tournaments.test.ts`).
- Supabase deletes must `.select()` and throw on zero rows — RLS blocks report success otherwise.
- Files stay under 500 lines.
- Do not add a `Co-Authored-By` trailer to commits.
- Reuse `src/theme` tokens (`C`, `F`, `press`, `glow`); no hardcoded colours.

---

### Task 1: Display name must contain a letter

**Files:**
- Modify: `src/lib/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `validateName(value: string, label: string, opts?: { requireLetter?: boolean }): string | null`. Existing two-argument calls keep their current behaviour exactly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/validate.test.ts`:

```ts
test("requireLetter rejects a name with no letters", () => {
  expect(validateName("123", "Display name", { requireLetter: true }))
    .toBe("Display name must contain a letter");
  expect(validateName("42", "Display name", { requireLetter: true })).not.toBeNull();
  expect(validateName("...", "Display name", { requireLetter: true })).not.toBeNull();
});

test("requireLetter accepts letters mixed with digits and punctuation", () => {
  expect(validateName("Ravi 2", "Display name", { requireLetter: true })).toBeNull();
  expect(validateName("Anna-Marie", "Display name", { requireLetter: true })).toBeNull();
  expect(validateName("O'Neil", "Display name", { requireLetter: true })).toBeNull();
});

test("requireLetter accepts non-Latin scripts", () => {
  expect(validateName("उत्कर्ष", "Display name", { requireLetter: true })).toBeNull();
  expect(validateName("张伟", "Display name", { requireLetter: true })).toBeNull();
});

test("requireLetter still reports blank and length errors first", () => {
  expect(validateName("   ", "Display name", { requireLetter: true }))
    .toBe("Display name is required");
  expect(validateName("a".repeat(51), "Display name", { requireLetter: true }))
    .toBe("Display name must be 50 characters or less");
});

test("without requireLetter a digits-only name is still allowed", () => {
  expect(validateName("123", "Club name")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/validate.test.ts`
Expected: FAIL — the digits-only cases return `null` instead of an error message.

- [ ] **Step 3: Implement**

Replace the body of `src/lib/validate.ts`:

```ts
export const MAX_NAME = 50;

/**
 * Validate a user-supplied name. Returns an error message, or null when valid.
 *
 * `requireLetter` additionally rejects names with no letter at all ("123",
 * "..."), used for player display names. It matches any Unicode letter rather
 * than A-Za-z so non-Latin scripts stay valid. Club and tournament names do
 * not set it — "Summer 2026 Open" is legitimate.
 */
export function validateName(
  value: string,
  label: string,
  opts?: { requireLetter?: boolean },
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} is required`;
  if (trimmed.length > MAX_NAME) return `${label} must be ${MAX_NAME} characters or less`;
  if (opts?.requireLetter && !/\p{L}/u.test(trimmed)) return `${label} must contain a letter`;
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/validate.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Apply to the welcome screen**

In `app/welcome.tsx`, change the validation call:

```ts
const error = validateName(name, "Display name", { requireLetter: true });
```

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add src/lib/validate.ts tests/validate.test.ts app/welcome.tsx
git commit -m "feat(validate): require a letter in player display names"
```

---

### Task 2: Tournament share link (and the welcome join-kind bug)

**Files:**
- Create: `src/lib/shareJoin.ts`
- Modify: `app/(app)/tournaments/[id].tsx`
- Modify: `app/(app)/clubs/[id].tsx:30-38,62-64`
- Modify: `app/welcome.tsx`

**Interfaces:**
- Consumes: `buildClubJoinPath`, `buildTournamentJoinPath` from `src/lib/joinLink` (both already exist and are tested); `parseJoinTarget` from the same module.
- Produces: `shareJoinLink(path: string, message: string): Promise<void>`.

**Why this task matters:** `buildTournamentJoinPath` currently has zero callers, so the entire Phase 3/4 join flow is unreachable in the shipped app.

- [ ] **Step 1: Create the shared helper**

Create `src/lib/shareJoin.ts`:

```ts
import { Share } from "react-native";
import * as Linking from "expo-linking";
import { toast } from "./toast";

/**
 * Turn a join path into a deep link and hand it to the OS share sheet.
 * Shared by the club and tournament screens so the two cannot drift.
 * Failures are toasted, not thrown — a failed share is not worth a crash.
 */
export async function shareJoinLink(path: string, message: string): Promise<void> {
  try {
    const url = Linking.createURL(path);
    await Share.share({ message: `${message} ${url}` });
  } catch (e) {
    toast((e as Error).message || "Could not share the link", "error");
  }
}
```

- [ ] **Step 2: Add the share button to the tournament screen**

In `app/(app)/tournaments/[id].tsx`, add imports:

```ts
import { buildTournamentJoinPath } from "../../../src/lib/joinLink";
import { shareJoinLink } from "../../../src/lib/shareJoin";
```

Add the handler next to `onDeleteTournament`:

```ts
const onShare = () =>
  shareJoinLink(buildTournamentJoinPath(id!), `Join "${title}" on CourtSide:`);
```

Render it **above** the `isAdmin` block, so every club member sees it — joining still requires admin approval, so sharing grants no privilege:

```tsx
<Pressable
  style={{ flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 12 }}
  onPress={onShare}
>
  <Icon name="share-social-outline" color={C.text} size={18} />
  <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>Share join link</Text>
</Pressable>
```

- [ ] **Step 3: Declare the new icon**

In `src/components/Icon.tsx`, add `"share-social-outline"` to the Ionicons group of the `IconName` union (leave the `MCI` set untouched — it is an Ionicons glyph):

```ts
  | "log-out-outline" | "swap-horizontal" | "swap-vertical"
  | "share-social-outline"
```

- [ ] **Step 4: Refactor the club screen onto the helper**

In `app/(app)/clubs/[id].tsx`, delete the local `shareLink` function (lines 30-38) and the now-unused `Share`, `Linking`, and `toast` imports. Add:

```ts
import { shareJoinLink } from "../../../src/lib/shareJoin";
```

Change the button's handler (line 62) to:

```tsx
<Pressable
  style={s.secondary}
  onPress={() => shareJoinLink(buildClubJoinPath(club.id), `Join ${club.name} on CourtSide:`)}
>
```

- [ ] **Step 5: Fix the welcome screen's hardcoded join kind**

`app/welcome.tsx` currently routes every parked join link to the club screen, so a new user arriving from a tournament invite lands on the club join screen with a tournament id. `Gate` in `app/_layout.tsx:93` already does this correctly. Match it:

```ts
router.replace(target ? `/join/${target.kind}/${target.id}` : "/");
```

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add src/lib/shareJoin.ts src/components/Icon.tsx "app/(app)/tournaments/[id].tsx" "app/(app)/clubs/[id].tsx" app/welcome.tsx
git commit -m "feat(tournaments): share join link, unblocking the join flow"
```

- [ ] **Step 7: Verify on device**

Share a tournament link, open it on a second account, confirm the join landing screen shows that tournament's name and capacity.

---

### Task 3: Home keyboard no longer covers the club/invite inputs

**Files:**
- Modify: `app/(app)/index.tsx:56-127`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

**Root cause:** Home cannot use `FormScreen` because a `FlatList` may not nest in a `ScrollView`, so it keeps a bare `KeyboardAvoidingView` whose `behavior` is `undefined` on Android — a no-op there. Both forms sit below a `flex: 1` list, so the keyboard lands on them.

- [ ] **Step 1: Move the forms into the list footer**

In `app/(app)/index.tsx`, extract the `<View style={s.forms}>…</View>` block (lines 105-126) verbatim into a `ListFooterComponent` on the existing `FlatList`. Keep its contents and styles exactly as they are — only its position in the tree changes:

```tsx
<FlatList
  data={clubs}
  keyExtractor={(c) => c.id}
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={{ paddingBottom: 24 }}
  ListEmptyComponent={
    <Text style={s.empty}>No clubs yet. Create one below or join with an invite code.</Text>
  }
  ListFooterComponent={
    <View style={s.forms}>
      {/* the two rows exactly as they are today */}
    </View>
  }
  renderItem={/* unchanged */}
/>
```

`keyboardShouldPersistTaps="handled"` matters: without it the first tap on Create/Join only dismisses the keyboard.

- [ ] **Step 2: Replace the dead KeyboardAvoidingView**

Swap the `KeyboardAvoidingView` root for a plain `View` with the same `s.root` style, and drop the now-unused `KeyboardAvoidingView` and `Platform` imports. Replace the stale comment at lines 57-58 with:

```tsx
// The forms live in the list footer rather than below it: one scrollable
// surface lets RN scroll the focused input into view, which combined with
// android.softwareKeyboardLayoutMode "resize" keeps it above the keyboard.
// A KeyboardAvoidingView here was a no-op — behavior is undefined on Android.
```

- [ ] **Step 3: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add "app/(app)/index.tsx"
git commit -m "fix(home): keep club and invite inputs above the keyboard"
```

- [ ] **Step 4: Verify on device**

Focus "Invite code" on Home. The field must stay visible with the keyboard open, and a single tap on Join must submit.

---

### Task 4: Club-scoped live matches

**Files:**
- Create: `app/(app)/clubs/[id]/live.tsx`
- Delete: `app/(app)/watch/index.tsx`
- Modify: `app/(app)/watch/_layout.tsx`
- Modify: `app/(app)/clubs/_layout.tsx`
- Modify: `app/(app)/clubs/[id].tsx`
- Modify: `app/(app)/index.tsx:74-79`

**Interfaces:**
- Consumes: `getRealtimeBackend()` from `src/realtime`; `LiveMatch` from `src/realtime/backend`. Both unchanged.
- Produces: route `/(app)/clubs/[id]/live`.

**Why:** the Home pill usually leads to an empty screen, and `app/(app)/watch/index.tsx:17` reads `clubs[0]?.id ?? ""` — it only ever subscribes to the user's first club, and to `""` when they have none. Taking the id from the route deletes that bug rather than patching it.

Note: expo-router allows `app/(app)/clubs/[id].tsx` and the directory `app/(app)/clubs/[id]/` to coexist — `[id].tsx` serves `/clubs/x` and `[id]/live.tsx` serves `/clubs/x/live`.

- [ ] **Step 1: Create the club-scoped screen**

Create `app/(app)/clubs/[id]/live.tsx` with the body of the deleted `watch/index.tsx`, with the club id taken from the route instead of guessed:

```tsx
import { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getRealtimeBackend } from "../../../../src/realtime";
import type { LiveMatch } from "../../../../src/realtime/backend";
import { C, F } from "../../../../src/theme";

export default function ClubLive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<LiveMatch[]>([]);

  useEffect(() => {
    if (!id) return;
    let off = () => {};
    let cancelled = false;
    (async () => {
      const rt = getRealtimeBackend();
      const initial = await rt.listLiveMatches(id);
      if (cancelled) return;
      setItems(initial);
      off = rt.onLiveMatchesChange(id, setItems);
    })();
    return () => { cancelled = true; off(); };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
      {items.length === 0 ? (
        <Text style={{ color: C.text2, textAlign: "center", marginTop: 48 }}>No live matches right now</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.matchId}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/watch/${item.matchId}`)}
              style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderColor: C.line, borderWidth: 1 }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: C.text, fontFamily: F.semibold }} numberOfLines={1}>
                  {item.teamA.join(" / ")} vs {item.teamB.join(" / ")}
                </Text>
                <Text style={{ color: C.text2, marginTop: 4, fontFamily: F.body }}>{item.scoreSummary}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} />
                <Text style={{ color: C.red, fontFamily: F.medium, fontSize: 12 }}>LIVE</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Register the route**

In `app/(app)/clubs/_layout.tsx`, add inside `<Stack>`:

```tsx
<Stack.Screen name="[id]/live" options={{ title: "Live matches" }} />
```

- [ ] **Step 3: Add the entry point on club detail**

In `app/(app)/clubs/[id].tsx`, add below the "Share join link" button:

```tsx
<Pressable style={s.secondary} onPress={() => router.push(`/(app)/clubs/${club.id}/live`)}>
  <Text style={s.secondaryText}>Live now</Text>
</Pressable>
```

- [ ] **Step 4: Delete the old screen and its route**

Delete `app/(app)/watch/index.tsx`. In `app/(app)/watch/_layout.tsx`, remove the `index` `Stack.Screen` line and change `unstable_settings` to:

```ts
export const unstable_settings = { initialRouteName: "[matchId]" };
```

`app/(app)/watch/[matchId].tsx` stays — tournament brackets route into it directly (`app/(app)/tournaments/[id].tsx:57`).

- [ ] **Step 5: Remove the Home pill**

In `app/(app)/index.tsx`, delete the `<View style={s.row}>` block wrapping the "Watch live matches" pill (lines 74-79) and the now-unused `s.navPill` / `s.navPillText` styles. Keep `s.row` — the forms still use it.

- [ ] **Step 6: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add -A "app/(app)/clubs" "app/(app)/watch" "app/(app)/index.tsx"
git commit -m "refactor(watch): scope the live match list to a club"
```

- [ ] **Step 7: Verify on device**

With a match live in a club, open that club and tap Live now — the match appears. Confirm Home no longer shows the pill.

---

### Task 5: Header menu, tournament delete demoted, club delete added

**Files:**
- Create: `supabase/migrations/0008_club_delete.sql`
- Create: `src/components/MenuButton.tsx`
- Modify: `src/repos/clubRepo.ts`
- Modify: `app/(app)/tournaments/[id].tsx`
- Modify: `app/(app)/clubs/[id].tsx`
- Modify: `app/(app)/clubs/_layout.tsx`

**Interfaces:**
- Consumes: `Sheet` and its `SheetAction` type from `src/components/Sheet` (`{ label, onPress, destructive?, primary? }`); `Club` from `src/repos/clubRepo` (has `role: string | null`).
- Produces: `MenuButton({ actions }: { actions: SheetAction[] })`; `clubRepo.deleteClub(id: string): Promise<void>`.

**Critical:** there is no DELETE policy on `public.clubs` in any migration — the only one that exists is for tournaments (`0006_tournament_sync.sql:74`). Without the migration below, the delete silently affects zero rows and Supabase reports success. This is the exact bug `deleteTournament` shipped with.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_club_delete.sql`:

```sql
-- Club deletion. Owners only: deleting a club cascades away every member's
-- match history, which is stronger than "admin" implies. is_club_admin is
-- deliberately NOT used here — it resolves to role in ('owner','admin').
-- Child rows (club_members, club_players, sessions, matches, tournaments)
-- already cascade via "on delete cascade" in 0001_init.sql and 0002_tournaments.sql.
create policy "owners delete clubs" on public.clubs for delete to authenticated
  using (exists (
    select 1 from club_members
    where club_id = clubs.id and profile_id = auth.uid() and role = 'owner'
  ));
```

- [ ] **Step 2: Add the repo method**

Append to `src/repos/clubRepo.ts`, mirroring `deleteTournament`'s throw-on-zero-rows contract:

```ts
/**
 * Delete a club. Owners only (enforced by RLS). The .select() and row-count
 * check are load-bearing: a policy-blocked delete returns success with zero
 * rows, so without this the caller would report a delete that never happened.
 */
export async function deleteClub(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to delete a club");
  const { data, error } = await supabase.from("clubs").delete().eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete club");
  const db = await getDb();
  await db?.runAsync("delete from clubs_cache where id = ?", id);
  await db?.runAsync("delete from club_players_cache where club_id = ?", id);
}
```

- [ ] **Step 3: Create MenuButton**

Create `src/components/MenuButton.tsx`. The menu surface is the existing `Sheet` rather than a new popover primitive — same look as every other confirm in the app, and no duplicated dismissal logic:

```tsx
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Sheet, { type SheetAction } from "./Sheet";
import { C, F } from "../theme";

/**
 * Header "⋮" that opens a Sheet of actions. Presentational only — callers own
 * the behaviour, including any confirmation step. Destructive actions render
 * red via Sheet's own `destructive` flag.
 */
export default function MenuButton({ actions }: { actions: SheetAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="More actions"
        hitSlop={12}
        style={{ paddingHorizontal: 12, paddingVertical: 4 }}
      >
        <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 22 }}>⋮</Text>
      </Pressable>
      <Sheet
        visible={open}
        title="Actions"
        actions={[
          ...actions.map((a) => ({
            ...a,
            onPress: () => { setOpen(false); a.onPress(); },
          })),
          { label: "Cancel", onPress: () => setOpen(false) },
        ]}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
```

- [ ] **Step 4: Move the tournament delete into the header**

In `app/(app)/tournaments/[id].tsx`: delete the "Delete tournament" `Pressable` (lines 115-121) and keep the confirmation `Sheet` and `onDeleteTournament` exactly as they are. Add the header menu, gated on `isAdmin`:

```tsx
import { Stack } from "expo-router";
import MenuButton from "../../../src/components/MenuButton";
```

```tsx
<Stack.Screen
  options={{
    headerRight: isAdmin
      ? () => <MenuButton actions={[{ label: "Delete tournament", destructive: true, onPress: () => setConfirmingDelete(true) }]} />
      : undefined,
  }}
/>
```

"Pending requests" and "Live Ops Dashboard" stay as body buttons.

- [ ] **Step 5: Add club delete**

`app/(app)/clubs/_layout.tsx` sets a global `headerRight` (the logo), which a per-screen `headerRight` would replace. Render both so the logo survives.

In `app/(app)/clubs/[id].tsx` add state, handler, confirmation `Sheet`, and header:

```tsx
const [confirmingDelete, setConfirmingDelete] = useState(false);
const isOwner = club?.role === "owner";

const onDeleteClub = async () => {
  setConfirmingDelete(false);
  try {
    await deleteClub(id!);
    router.replace("/");
  } catch (e) {
    toast((e as Error).message || "Could not delete club", "error");
  }
};
```

```tsx
<Stack.Screen
  options={{
    headerRight: isOwner
      ? () => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MenuButton actions={[{ label: "Delete club", destructive: true, onPress: () => setConfirmingDelete(true) }]} />
            <View style={{ paddingRight: 16 }}><LogoMark size={26} /></View>
          </View>
        )
      : undefined,
  }}
/>
<Sheet
  visible={confirmingDelete}
  title="Delete club?"
  message={`This permanently deletes "${club.name}" for every member, including its sessions, matches, and tournaments.`}
  actions={[
    { label: "Delete", onPress: onDeleteClub, destructive: true },
    { label: "Cancel", onPress: () => setConfirmingDelete(false) },
  ]}
  onClose={() => setConfirmingDelete(false)}
/>
```

Imports to add: `Stack` from `expo-router`, `MenuButton`, `Sheet`, `deleteClub` from `clubRepo`, `LogoMark` from `src/components/Logo`, and `toast` (retained from Task 2 only if the file still uses it — re-add if Step 4 of Task 2 removed it).

This screen's root is a `FlatList`; mount `<Stack.Screen>` and `<Sheet>` as siblings inside a wrapping fragment.

- [ ] **Step 6: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 7: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0008_club_delete.sql src/components/MenuButton.tsx src/repos/clubRepo.ts "app/(app)/tournaments/[id].tsx" "app/(app)/clubs/[id].tsx"
git commit -m "feat(clubs): owner-only club delete behind a header menu"
```

- [ ] **Step 8: Verify on device**

As owner, delete a club and confirm it disappears — then check a second device or a fresh `refreshClubs()` to confirm it is gone remotely, not just locally. As a non-owner admin, confirm no ⋮ appears.

---

### Task 6: Profile display name becomes edit-on-tap

**Files:**
- Modify: `app/(app)/profile.tsx:84-111`

**Interfaces:**
- Consumes: `validateName(..., { requireLetter: true })` from Task 1; `setDisplayName(name: string): Promise<void>` from `src/repos/profileRepo`; `Sheet` from `src/components/Sheet`.
- Produces: nothing consumed by later tasks.

**Why:** the name renders twice — hero heading (line 90) and an always-open edit card immediately below (lines 97-111) — pushing stats down for a field set once at signup.

- [ ] **Step 1: Make the hero name tappable**

In `app/(app)/profile.tsx`, wrap the hero name in a `Pressable` that opens the editor, with a pencil to signal it:

```tsx
<Pressable
  onPress={() => { setDraftName(displayName); setEditingName(true); }}
  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
  accessibilityLabel="Edit display name"
>
  <View style={{ flex: 1 }}>
    <Text style={s.name}>{me}</Text>
    <Text style={s.sub}>{session?.user.email ?? ""}</Text>
  </View>
  <Icon name="create-outline" color={C.text2} size={18} />
</Pressable>
```

Add `"create-outline"` to the Ionicons group of `IconName` in `src/components/Icon.tsx`.

- [ ] **Step 2: Delete the standing card**

Remove the entire `{/* Display name */}` `View` block (lines 96-111). Stats now sit directly below the hero.

- [ ] **Step 3: Add the edit sheet**

The file already holds this state and helper, which the editor reuses rather
than duplicates: local `displayName` / `setDisplayName`, the persisted
`savedName` / `setSavedName`, the profile writer imported as `saveProfileName`
(aliased at `app/(app)/profile.tsx:6`), and `me = savedName || "Player"`, which
keys every stats lookup.

Replace the existing `nameError` and `saveDisplayName` (lines 62-71) with:

```tsx
const [editingName, setEditingName] = useState(false);

const nameError = validateName(displayName, "Display name", { requireLetter: true });

const saveDisplayName = () => {
  const v = displayName.trim();
  if (nameError) { toast(nameError, "error"); return; }
  setEditingName(false);
  if (v === savedName) return;
  void saveProfileName(v)
    .then(() => { setSavedName(v); toast("Name updated", "success"); })
    .catch((e: Error) => toast(e.message || "Could not save your name", "error"));
};
```

The early return on `v === savedName` is load-bearing: `me` derives from
`savedName`, and rewriting it re-runs every analytics query for no reason.

On cancel, reset the draft so an abandoned edit does not leak into the field:

```tsx
const cancelNameEdit = () => { setDisplayName(savedName); setEditingName(false); };
```

`Sheet` renders a fixed action list and accepts no children, so the input needs
its own surface. Add a react-native `Modal` (`transparent`, `animationType="fade"`,
`onRequestClose={cancelNameEdit}`) holding the existing `TextInput` — reuse the
`s.nameInput` style and the `maxLength={60}` and `returnKeyType="done"` props it
already has — plus the `nameError` message in `s.err` and Save/Cancel buttons.
Wire `onSubmitEditing` to `saveDisplayName`.

Keep `s.nameInput` and `s.err`. Keep `s.card` and `s.cardTitle` — the
Achievements and secondary-stat cards still use them.

- [ ] **Step 4: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add "app/(app)/profile.tsx" src/components/Icon.tsx
git commit -m "feat(profile): edit display name on tap instead of a standing field"
```

- [ ] **Step 5: Verify on device**

Tap the name, change it, save. Confirm the hero and Home greeting both update, and that "123" is rejected with an error.

---

## Final verification

After all six tasks:

- [ ] `npx tsc --noEmit && npm test` — green
- [ ] `npx supabase db push` — `0008` applied
- [ ] Full join flow on two accounts: share a tournament link → open on account B → request → approve as admin → B appears in the bracket → assign a court → claim as scorer
- [ ] Home: invite-code field stays visible with the keyboard open; Join submits on one tap
- [ ] Club detail: Live now shows in-progress matches for that club
- [ ] Owner deletes a club and it stays deleted after a refresh
- [ ] Blank club name still rejected on Home (round-1 report; the unit test
      already exists at `tests/validate.test.ts:3`, so this is a device check
      only — if it reproduces on a current build it is a new bug)
