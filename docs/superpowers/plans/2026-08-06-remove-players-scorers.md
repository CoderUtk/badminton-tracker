# Remove Club Players & Tournament Scorers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a club owner/admin remove a player from the club roster, and let a tournament admin remove a scorer from tournament staff.

**Architecture:** Two new Postgres RPCs (`remove_club_player`, `remove_tournament_staff`) enforce authorization and guard rails server-side. Two thin repo wrappers call them. A new club "Players" screen and an addition to the existing `TournamentScorersTab` expose remove buttons.

**Tech Stack:** Expo Router, React Native, Supabase (Postgres + RPC), Jest (`ts-jest`, node env, factory-mocked `supabase`/`db` modules).

## Global Constraints

- `remove_club_player` blocks removal if the player has any `tournament_entrants` row (spec: "Block removal (Recommended)").
- `remove_tournament_staff` only allows removing `role = 'scorer'` rows; removing an `admin` row is refused (spec: "Scorers only").
- No changes to `removeEntrant` (draft-only stays as-is) or to `club_members` (membership untouched).
- Migration file numbering continues from the last migration, `0021_tournament_spectator_live_score.sql` → this plan's migration is `0022_remove_club_player_and_staff.sql`.

---

### Task 1: Migration — `remove_club_player` and `remove_tournament_staff` RPCs

**Files:**
- Create: `supabase/migrations/0022_remove_club_player_and_staff.sql`

**Interfaces:**
- Produces: RPC `remove_club_player(p_club_player_id uuid) returns void`, callable via `supabase.rpc("remove_club_player", { p_club_player_id })`.
- Produces: RPC `remove_tournament_staff(p_staff_id uuid) returns void`, callable via `supabase.rpc("remove_tournament_staff", { p_staff_id })`.

- [ ] **Step 1: Write the migration file**

```sql
-- 0022_remove_club_player_and_staff.sql

create or replace function public.remove_club_player(p_club_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_role text;
begin
  select club_id into v_club_id from club_players where id = p_club_player_id;
  if v_club_id is null then
    raise exception 'Player not found';
  end if;

  select role into v_role from club_members
    where club_id = v_club_id and profile_id = auth.uid();
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  if exists (select 1 from tournament_entrants where club_player_id = p_club_player_id) then
    raise exception 'Player has tournament history — remove them from tournaments first';
  end if;

  delete from club_players where id = p_club_player_id;
end;
$$;

grant execute on function public.remove_club_player(uuid) to authenticated;

create or replace function public.remove_tournament_staff(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_target_role text;
  v_caller_role text;
begin
  select tournament_id, role into v_tournament_id, v_target_role
    from tournament_staff where id = p_staff_id;
  if v_tournament_id is null then
    raise exception 'Staff member not found';
  end if;

  select role into v_caller_role from tournament_staff
    where tournament_id = v_tournament_id and profile_id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Not authorized';
  end if;

  if v_target_role = 'admin' then
    raise exception 'Cannot remove a tournament admin';
  end if;

  delete from tournament_staff where id = p_staff_id;
end;
$$;

grant execute on function public.remove_tournament_staff(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration to the live Supabase database**

Run from a checkout that already has `supabase link` configured (per project history, the worktree checkout may not — copy the file to the linked main checkout first if `supabase db push` reports "Cannot find project ref"):

```bash
supabase db push
```

Expected: migration `0022_remove_club_player_and_staff.sql` applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0022_remove_club_player_and_staff.sql
git commit -m "feat(db): add remove_club_player and remove_tournament_staff RPCs"
```

---

### Task 2: `clubRepo.removePlayer`

**Files:**
- Modify: `src/repos/clubRepo.ts`
- Test: `tests/removeClubPlayer.test.ts` (new)

**Interfaces:**
- Consumes: `refreshClubs()` (existing, `src/repos/clubRepo.ts`).
- Produces: `removePlayer(clubPlayerId: string): Promise<void>`, exported from `src/repos/clubRepo.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/removeClubPlayer.test.ts
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
// refreshClubs() short-circuits when getDb() resolves null — keeps this test
// off expo-sqlite, same pattern as tests/tournamentEntrants.test.ts.
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import { removePlayer } from "../src/repos/clubRepo";

beforeEach(() => rpc.mockReset());

test("removePlayer calls the RPC with the player id", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(removePlayer("cp-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("remove_club_player", { p_club_player_id: "cp-1" });
});

test("removePlayer surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Player has tournament history — remove them from tournaments first" } });
  await expect(removePlayer("cp-1")).rejects.toThrow("Player has tournament history — remove them from tournaments first");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/removeClubPlayer.test.ts`
Expected: FAIL — `removePlayer is not a function` (not yet exported).

- [ ] **Step 3: Implement `removePlayer`**

Add to `src/repos/clubRepo.ts`, directly below `listAllPlayerNames` (end of file):

```ts
export async function removePlayer(clubPlayerId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage players");
  const { error } = await supabase.rpc("remove_club_player", { p_club_player_id: clubPlayerId });
  if (error) throw new Error(error.message);
  await refreshClubs();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/removeClubPlayer.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/repos/clubRepo.ts tests/removeClubPlayer.test.ts
git commit -m "feat(club): add removePlayer repo function"
```

---

### Task 3: `tournamentStaffRepo.removeStaff`

**Files:**
- Modify: `src/repos/tournamentStaffRepo.ts`
- Test: `tests/removeTournamentStaff.test.ts` (new)

**Interfaces:**
- Produces: `removeStaff(staffId: string): Promise<void>`, exported from `src/repos/tournamentStaffRepo.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/removeTournamentStaff.test.ts
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { removeStaff } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("removeStaff calls the RPC with the staff id", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(removeStaff("staff-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("remove_tournament_staff", { p_staff_id: "staff-1" });
});

test("removeStaff surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Cannot remove a tournament admin" } });
  await expect(removeStaff("staff-1")).rejects.toThrow("Cannot remove a tournament admin");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/removeTournamentStaff.test.ts`
Expected: FAIL — `removeStaff is not a function`

- [ ] **Step 3: Implement `removeStaff`**

Add to `src/repos/tournamentStaffRepo.ts`, at the end of the file (after `getTournamentStaff`):

```ts
export async function removeStaff(staffId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage staff");
  const { error } = await supabase.rpc("remove_tournament_staff", { p_staff_id: staffId });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/removeTournamentStaff.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/repos/tournamentStaffRepo.ts tests/removeTournamentStaff.test.ts
git commit -m "feat(tournament): add removeStaff repo function"
```

---

### Task 4: Club "Players" screen with remove action

**Files:**
- Create: `app/(app)/clubs/players/[clubId].tsx`
- Modify: `app/(app)/clubs/_layout.tsx`
- Modify: `app/(app)/clubs/[id].tsx`

**Interfaces:**
- Consumes: `listPlayers(clubId: string): Promise<ClubPlayer[]>` and `removePlayer(clubPlayerId: string): Promise<void>` (Task 2, `src/repos/clubRepo.ts`), `getClub(clubId: string): Promise<Club | null>` (existing, `src/repos/clubRepo.ts` — `Club.role` is `"owner" | "admin" | "member" | null`), `toast` (existing, `src/lib/toast.ts`), `Sheet` (existing, `src/components/Sheet.tsx`), `Icon`, `PressableScale` (existing, `src/components`).

- [ ] **Step 1: Create the players screen**

```tsx
// app/(app)/clubs/players/[clubId].tsx
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { getClub, listPlayers, removePlayer, type ClubPlayer } from "../../../../src/repos/clubRepo";
import { toast } from "../../../../src/lib/toast";
import Sheet from "../../../../src/components/Sheet";
import Icon from "../../../../src/components/Icon";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function ClubPlayers() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<ClubPlayer | null>(null);

  const reload = useCallback(async () => {
    if (!clubId) return;
    try {
      const [list, club] = await Promise.all([listPlayers(clubId), getClub(clubId)]);
      setPlayers(list);
      setIsAdmin(club?.role === "owner" || club?.role === "admin");
    } catch (e) {
      toast((e as Error).message || "Could not load players", "error");
    } finally {
      setLoading(false);
    }
  }, [clubId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const doRemove = async () => {
    const player = pending;
    setPending(null);
    if (!player) return;
    setBusyId(player.id);
    try {
      await removePlayer(player.id);
      setPlayers((cur) => cur.filter((p) => p.id !== player.id));
      toast(`${player.name} removed`, "success");
    } catch (e) {
      toast((e as Error).message || "Could not remove that player", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  return (
    <>
      <FlatList
        style={s.root}
        contentContainerStyle={s.content}
        data={players}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={s.empty}>No players yet.</Text>}
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
      />
      <Sheet
        visible={!!pending}
        title="Remove player?"
        message={pending ? `${pending.name} will be removed from the roster. They can't have any tournament history.` : ""}
        actions={[
          { label: "Remove", onPress: doRemove, destructive: true },
          { label: "Cancel", onPress: () => setPending(null) },
        ]}
        onClose={() => setPending(null)}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  empty: { color: C.text2, fontSize: 15, lineHeight: 22, padding: 24, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  name: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.semibold },
  remove: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.bgElev },
  off: { opacity: 0.45 },
});
```

- [ ] **Step 2: Register the screen in the clubs stack**

In `app/(app)/clubs/_layout.tsx`, add a `Stack.Screen` after the `requests/[clubId]` entry (`app/(app)/clubs/_layout.tsx:21`):

```tsx
      <Stack.Screen name="requests/[clubId]" options={{ title: "Pending requests" }} />
      <Stack.Screen name="players/[clubId]" options={{ title: "Players" }} />
```

- [ ] **Step 3: Link to it from the club detail screen**

In `app/(app)/clubs/[id].tsx`, add a secondary button after the existing "Pending requests" button (`app/(app)/clubs/[id].tsx:94-101`), inside the same `isAdmin` block:

```tsx
            {isAdmin ? (
              <Pressable
                style={s.secondary}
                onPress={() => router.push(`/(app)/clubs/requests/${club.id}`)}
              >
                <Text style={s.secondaryText}>Pending requests</Text>
              </Pressable>
            ) : null}
            {isAdmin ? (
              <Pressable
                style={s.secondary}
                onPress={() => router.push(`/(app)/clubs/players/${club.id}`)}
              >
                <Text style={s.secondaryText}>Manage players</Text>
              </Pressable>
            ) : null}
```

- [ ] **Step 4: Manual verification**

Run: `npx expo start -c`
On device: as a club owner/admin, open a club → "Manage players" → tap trash on a roster player with no tournament history → confirm in the sheet → row disappears, success toast shows. Tap trash on a player who's an entrant in any tournament → confirm → error toast shows the RPC's message, row stays. As a non-admin club member, open the same club → no "Manage players" button is shown.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/clubs/players/[clubId].tsx" "app/(app)/clubs/_layout.tsx" "app/(app)/clubs/[id].tsx"
git commit -m "feat(club): add players screen with remove action"
```

---

### Task 5: Remove-scorer action in `TournamentScorersTab`

**Files:**
- Modify: `src/components/TournamentScorersTab.tsx`

**Interfaces:**
- Consumes: `removeStaff(staffId: string): Promise<void>` (Task 3, `src/repos/tournamentStaffRepo.ts`), `onChanged: () => void` (existing prop on `TournamentScorersTab`).

- [ ] **Step 1: Add remove state, handler, and confirm sheet**

In `src/components/TournamentScorersTab.tsx`, update the import (line 5-8) to include `removeStaff`:

```tsx
import {
  approveTournamentRequest, denyTournamentRequest, removeStaff,
  type TournamentJoinRequest, type TournamentStaff,
} from "../repos/tournamentStaffRepo";
```

Add `Sheet` import alongside the existing component imports (after line 11):

```tsx
import Sheet from "./Sheet";
```

Add a `pending` state next to `busy` (line 25):

```tsx
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<TournamentStaff | null>(null);
```

Add a `doRemove` handler after `decide` (after line 43, before the `return`):

```tsx
  const doRemove = async () => {
    const member = pending;
    setPending(null);
    if (!member) return;
    setBusy(true);
    try {
      await removeStaff(member.id);
      toast(`${member.displayName} removed`, "success");
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not remove that scorer", "error");
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 2: Add the remove button to scorer rows and render the confirm sheet**

Replace the staff row rendering (lines 54-59):

```tsx
      {staff.map((m) => (
        <View key={m.id} style={s.row}>
          <Text style={s.name} numberOfLines={1}>{m.displayName}</Text>
          <Text style={s.role}>{m.role === "admin" ? "Admin" : "Scorer"}</Text>
        </View>
      ))}
```

with:

```tsx
      {staff.map((m) => (
        <View key={m.id} style={s.row}>
          <Text style={s.name} numberOfLines={1}>{m.displayName}</Text>
          <Text style={s.role}>{m.role === "admin" ? "Admin" : "Scorer"}</Text>
          {isAdmin && m.role === "scorer" ? (
            <PressableScale disabled={busy} onPress={() => setPending(m)} style={s.remove}>
              <Icon name="trash-outline" color={C.text2} size={16} />
            </PressableScale>
          ) : null}
        </View>
      ))}
```

Add the `Sheet` right before the closing `</View>` of the root (after the pending-requests block, before line 77's `</View>`):

```tsx
      <Sheet
        visible={!!pending}
        title="Remove scorer?"
        message={pending ? `${pending.displayName} will lose scorer access to this tournament.` : ""}
        actions={[
          { label: "Remove", onPress: doRemove, destructive: true },
          { label: "Cancel", onPress: () => setPending(null) },
        ]}
        onClose={() => setPending(null)}
      />
```

- [ ] **Step 3: Add the `remove` style**

In the `StyleSheet.create` block (after `role`, line 87), add:

```tsx
  remove: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.bgElev },
```

- [ ] **Step 4: Manual verification**

Run: `npx expo start -c`
On device: as a tournament admin, open a tournament → Scorers tab → tap trash next to a scorer row → confirm → row disappears, success toast shows. Admin rows show no trash icon. As a scorer (non-admin), open the same tab → no trash icons shown on any row.

- [ ] **Step 5: Commit**

```bash
git add src/components/TournamentScorersTab.tsx
git commit -m "feat(tournament): add remove-scorer action to scorers tab"
```

---

## Self-Review Notes

- Spec coverage: `remove_club_player` RPC (Task 1) ✓, `remove_tournament_staff` RPC (Task 1) ✓, `clubRepo.removePlayer` (Task 2) ✓, `tournamentStaffRepo.removeStaff` (Task 3) ✓, club players screen (Task 4) ✓, scorers tab remove action (Task 5) ✓. `removeEntrant` and `club_members` explicitly untouched, per spec's out-of-scope section.
- Placeholder scan: none — every step has literal code.
- Type consistency: `removePlayer(clubPlayerId: string)` (Task 2) matches the call in Task 4 Step 1 (`removePlayer(player.id)` where `player: ClubPlayer`, `ClubPlayer.id: string`). `removeStaff(staffId: string)` (Task 3) matches Task 5 Step 1 (`removeStaff(member.id)` where `member: TournamentStaff`, `TournamentStaff.id: string`).
