# Club Leave + Tournament Approval Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let non-owner club members leave a club, and make tournament join approvals (player/scorer) grant the approved user club membership so the tournament and its bracket become visible to them everywhere the app already checks club membership.

**Architecture:** Two independent Supabase RPCs (`leave_club`, and an updated `approve_tournament_join`) plus small client changes: a `leaveClub()` repo function, and a club-detail screen change that swaps the share button for a leave button on non-owners.

**Tech Stack:** Supabase (Postgres RPC + RLS), TypeScript, React Native/Expo Router, Jest.

## Global Constraints

- Never `git add -A`/`.` — stage only files touched by this work.
- No `Co-Authored-By` trailer unless project settings specify one (none observed in this repo).
- Run `npx tsc --noEmit` and `npm test -- --silent` after every client-code task; both must be clean before moving on.
- Supabase migrations are numbered sequentially; the last one in the repo is `0025_block_remove_club_owner_player.sql`, so new migrations start at `0026`.
- Follow existing RPC conventions: `security definer`, `set search_path = public`, `grant execute ... to authenticated`.
- Follow existing repo-function conventions: throw `new Error(error.message)` on Supabase RPC error, call `refreshClubs()` after any mutation that changes club membership (see `clubRepo.ts`'s `joinClub`/`deleteClub`).

---

### Task 1: `leave_club` RPC

**Files:**
- Create: `supabase/migrations/0026_leave_club.sql`
- Test: none (no Supabase-function test harness in this repo — confirmed by scanning `tests/`, which only unit-tests TypeScript repo wrappers with a mocked `rpc`). Manual verification steps are listed at the end of this task.

**Interfaces:**
- Produces: SQL function `public.leave_club(p_club_id uuid) returns void`, callable via `supabase.rpc("leave_club", { p_club_id })`.

- [ ] **Step 1: Write the migration**

```sql
-- 0026_leave_club.sql
-- Lets a non-owner member remove themselves from a club: their own
-- club_members row and, if present, their own club_players roster row.
-- Mirrors the guards already in remove_club_player
-- (0025_block_remove_club_owner_player.sql): an owner can't leave (they'd
-- lock themselves out of their own club — deleting it is the only path),
-- and a player with tournament history can't be removed, because bracket
-- history references club_players.id and must stay intact.

create or replace function public.leave_club(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_club_player_id uuid;
begin
  select role into v_role from club_members
    where club_id = p_club_id and profile_id = auth.uid();
  if v_role is null then
    raise exception 'Not a member of this club';
  end if;

  if v_role = 'owner' then
    raise exception 'Club owner cannot leave — delete the club instead';
  end if;

  select id into v_club_player_id from club_players
    where club_id = p_club_id and profile_id = auth.uid();

  if v_club_player_id is not null and exists (
    select 1 from tournament_entrants where club_player_id = v_club_player_id
  ) then
    raise exception 'You have tournament history in this club — this cannot be undone once you leave';
  end if;

  if v_club_player_id is not null then
    delete from club_players where id = v_club_player_id;
  end if;

  delete from club_members where club_id = p_club_id and profile_id = auth.uid();
end;
$$;

grant execute on function public.leave_club(uuid) to authenticated;
```

- [ ] **Step 2: Manual verification checklist (record results in the PR/commit description, not in code)**

Against a local or staging Supabase instance with two test accounts (A =
owner of club X, B = member of club X):
1. B calls `leave_club(X)` → succeeds; B's `club_members` and `club_players`
   rows for X are gone; `listClubs()` for B no longer includes X.
2. A calls `leave_club(X)` → raises `'Club owner cannot leave — delete the
   club instead'`.
3. B joins X again, enters a tournament as a player (so their
   `club_players` row has a `tournament_entrants` row), then calls
   `leave_club(X)` → raises the tournament-history message.
4. A non-member calls `leave_club(X)` → raises `'Not a member of this
   club'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0026_leave_club.sql
git commit -m "feat(db): add leave_club RPC for non-owner members"
```

---

### Task 2: `approve_tournament_join` grants club membership

**Files:**
- Create: `supabase/migrations/0027_approve_join_adds_club_member.sql`
- Test: none (same reasoning as Task 1). Manual verification listed below.

**Interfaces:**
- Produces: `public.approve_tournament_join(p_request_id uuid, p_club_player_id uuid default null) returns void` (same signature as before — this is a `create or replace`, not a new function).

- [ ] **Step 1: Write the migration**

This replaces the whole function body from `0024_fix_approve_join_entrant_seed.sql`,
adding an unconditional `v_club` lookup and a `club_members` upsert.

```sql
-- 0027_approve_join_adds_club_member.sql
-- approve_tournament_join previously left the approved requester without a
-- club_members row when they weren't already in the tournament's club. Every
-- RLS read policy (tournaments, tournament_entrants, bracket_matches,
-- club_players) gates on is_club_member(club_id), so an approved scorer or
-- player who joined via a share link from outside the club could not see
-- the tournament anywhere, including their own Cups tab. Adding them as a
-- regular 'member' (same insert join_club already does in 0001_init.sql)
-- fixes visibility everywhere with no new RLS policies. Their tournament
-- rights stay scoped to their staff/entrant role — admin-only screens key
-- off club role owner/admin or tournament_staff role admin, not plain
-- membership (see app/(app)/tournaments/[id].tsx's isAdmin computation).
create or replace function public.approve_tournament_join(
  p_request_id uuid,
  p_club_player_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid; v_role text; v_profile uuid; v_club uuid; v_player uuid; v_seed int;
begin
  select tournament_id, role, profile_id into v_tourney_id, v_role, v_profile
  from tournament_join_requests where id = p_request_id and status = 'pending';
  if v_tourney_id is null then raise exception 'Request not found or decided'; end if;
  if not is_tournament_admin(v_tourney_id) then
    raise exception 'Only admin can approve';
  end if;

  select t.club_id into v_club from tournaments t where t.id = v_tourney_id;

  insert into club_members (club_id, profile_id, role)
  values (v_club, v_profile, 'member')
  on conflict do nothing;

  if v_role = 'scorer' then
    insert into tournament_staff (tournament_id, profile_id, role)
    values (v_tourney_id, v_profile, 'scorer') on conflict do nothing;
  else
    v_player := p_club_player_id;
    if v_player is null then
      select id into v_player from club_players
      where club_id = v_club and profile_id = v_profile limit 1;
      if v_player is null then
        insert into club_players (club_id, profile_id, name)
        select v_club, v_profile, coalesce(nullif(pr.display_name, ''), 'Player')
        from profiles pr where pr.id = v_profile
        returning id into v_player;
      end if;
    end if;
    select coalesce(max(seed), 0) + 1 into v_seed
    from tournament_entrants where tournament_id = v_tourney_id;
    insert into tournament_entrants (tournament_id, club_player_id, seed)
    values (v_tourney_id, v_player, v_seed) on conflict do nothing;
  end if;

  update tournament_join_requests set status = 'approved', decided_at = now()
  where id = p_request_id;
end $$;
```

- [ ] **Step 2: Manual verification checklist**

Two test accounts (A = tournament admin in club X, C = has no membership
in club X):
1. C requests to join a tournament in club X as `scorer` (via
   `request_tournament_join`). A approves it. Confirm: C's `club_members`
   now has a row for `(X, C, 'member')`; C's Cups tab (`listAllTournaments`)
   now includes that tournament; C has no Ops tab / admin controls on it
   (`isAdmin` false).
2. C requests to join a different tournament in club X as `player`. A
   approves it. Confirm: C appears in `tournament_entrants` and the
   bracket; C's Cups tab shows it; C still has no admin controls.
3. Re-run existing regression: an admin approving a request from someone
   who is already a club member behaves exactly as before (the `on conflict
   do nothing` on `club_members` makes this a no-op for them).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0027_approve_join_adds_club_member.sql
git commit -m "fix(tournaments): approve_tournament_join grants club membership so approved players/scorers can see the tournament"
```

---

### Task 3: `leaveClub()` client repo function + test

**Files:**
- Modify: `src/repos/clubRepo.ts` (add function, after `removePlayer` at the end of the file)
- Test: Create `tests/leaveClub.test.ts`

**Interfaces:**
- Consumes: nothing new — uses the existing `supabase` client and `getDb()` from `../db/db`, and the existing `refreshClubs()` in the same file.
- Produces: `leaveClub(clubId: string): Promise<void>` — exported from `src/repos/clubRepo.ts`. Later tasks (Task 4) call this exact name and signature.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/leaveClub.test.ts
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
jest.mock("../src/db/db", () => ({ getDb: async () => null }));

import { leaveClub } from "../src/repos/clubRepo";

beforeEach(() => rpc.mockReset());

test("leaveClub calls the RPC with the club id", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(leaveClub("club-1")).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith("leave_club", { p_club_id: "club-1" });
});

test("leaveClub surfaces the RPC's error message", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Club owner cannot leave — delete the club instead" } });
  await expect(leaveClub("club-1")).rejects.toThrow("Club owner cannot leave — delete the club instead");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/leaveClub.test.ts --silent`
Expected: FAIL — `leaveClub` is not exported from `../src/repos/clubRepo`.

- [ ] **Step 3: Write the implementation**

Add to the end of `src/repos/clubRepo.ts` (after the existing `removePlayer`
function, following its exact error-handling shape):

```typescript
/**
 * A non-owner member leaves a club. Blocked server-side if the caller is
 * the owner or has tournament history (see 0026_leave_club.sql).
 */
export async function leaveClub(clubId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to leave a club");
  const { error } = await supabase.rpc("leave_club", { p_club_id: clubId });
  if (error) throw new Error(error.message);
  const db = await getDb();
  await db?.runAsync("delete from clubs_cache where id = ?", clubId);
  await db?.runAsync("delete from club_players_cache where club_id = ?", clubId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/leaveClub.test.ts --silent`
Expected: PASS (2 tests).

- [ ] **Step 5: Run full check and commit**

```bash
npx tsc --noEmit
npm test -- --silent
git add src/repos/clubRepo.ts tests/leaveClub.test.ts
git commit -m "feat(club): add leaveClub repo function"
```

---

### Task 4: Club detail screen — leave button for non-owners

**Files:**
- Modify: `app/(app)/clubs/[id].tsx`

**Interfaces:**
- Consumes: `leaveClub(clubId: string): Promise<void>` from Task 3 (`../../../src/repos/clubRepo`, already imported in this file as `{ deleteClub, getClub, type Club }` — extend that import).
- Produces: nothing new for later tasks — this is the last task in the plan.

No test file for this task: `app/(app)/clubs/[id].tsx` has no existing test
coverage (confirmed — no `clubDetail`/`clubs` entry in `tests/`), and
Expo Router screen components aren't unit-tested elsewhere in this repo
either. Verify manually per Step 5 below, consistent with how the delete-club
flow in this same file was verified when it was built.

- [ ] **Step 1: Import `leaveClub` and add local state**

In `app/(app)/clubs/[id].tsx`, change the import on line 4:

```typescript
import { deleteClub, getClub, leaveClub, type Club } from "../../../src/repos/clubRepo";
```

Add a new state variable next to the existing `confirmingDelete` (around
line 24):

```typescript
const [confirmingDelete, setConfirmingDelete] = useState(false);
const [confirmingLeave, setConfirmingLeave] = useState(false);
```

- [ ] **Step 2: Add the `onLeaveClub` handler**

Add next to the existing `onDeleteClub` function (after line 47):

```typescript
const onLeaveClub = async () => {
  setConfirmingLeave(false);
  if (!id) return;
  try {
    await leaveClub(id);
    router.replace("/");
  } catch (e) {
    toast((e as Error).message || "Could not leave club", "error");
  }
};
```

- [ ] **Step 3: Swap the share button for a leave button on non-owners**

Replace the hero's share `Pressable` (lines 72-79):

```typescript
<Pressable
  style={s.shareBtn}
  accessibilityLabel="Share join link"
  hitSlop={10}
  onPress={() => shareJoinLink(buildClubJoinPath(club.id), `invited you to join "${club.name}"`)}
>
  <ShareIcon size={16} color={C.text} />
</Pressable>
```

with:

```typescript
{isOwner ? (
  <Pressable
    style={s.shareBtn}
    accessibilityLabel="Share join link"
    hitSlop={10}
    onPress={() => shareJoinLink(buildClubJoinPath(club.id), `invited you to join "${club.name}"`)}
  >
    <ShareIcon size={16} color={C.text} />
  </Pressable>
) : (
  <Pressable
    style={[s.shareBtn, s.leaveBtn]}
    accessibilityLabel="Leave club"
    hitSlop={10}
    onPress={() => setConfirmingLeave(true)}
  >
    <Icon name="log-out-outline" size={16} color={C.red} />
  </Pressable>
)}
```

This needs the `Icon` component imported — add it next to the existing
`ShareIcon` import (line 12):

```typescript
import ShareIcon from "../../../src/components/ShareIcon";
import Icon from "../../../src/components/Icon";
```

- [ ] **Step 4: Add the leave-confirm Sheet and the `leaveBtn` style**

Add a new `Sheet` right after the existing `confirmingDelete` Sheet (after
line 149, still inside the closing `</>` of the component's return):

```typescript
<Sheet
  visible={confirmingLeave}
  title="Leave club?"
  message="You'll lose access to its sessions, matches, and tournaments."
  actions={[
    { label: "Leave", onPress: onLeaveClub, destructive: true },
    { label: "Cancel", onPress: () => setConfirmingLeave(false) },
  ]}
  onClose={() => setConfirmingLeave(false)}
/>
```

Add a `leaveBtn` style next to `shareBtn` in the `StyleSheet.create` block
(after line 164):

```typescript
shareBtn: {
  position: "absolute", top: 14, right: 14, zIndex: 1,
  width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
  backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line,
},
leaveBtn: { borderColor: C.red },
```

- [ ] **Step 5: Manual verification**

Run `npx tsc --noEmit` — must be clean (this is the only check available
for this task; no test harness covers Expo Router screens in this repo).

Then, with the dev server running, sign in as a non-owner member of an
existing club and open its detail screen:
- Confirm the share button is gone and a red-outlined leave icon shows in
  its place, same position.
- Tap it → confirm Sheet appears with the leave copy.
- Tap "Leave" → screen navigates to `/` and the club is gone from the
  home/club list.
- Sign in as the club's owner and open the same club → confirm the share
  button still shows (not the leave button).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/clubs/[id].tsx"
git commit -m "feat(club): show leave button instead of share for non-owner members"
```

---

## Self-Review Notes

- **Spec coverage:** Feature 1 (leave club, share restricted to owner) →
  Tasks 1, 3, 4. Feature 2 (approval grants visibility, rights stay
  role-scoped) → Task 2; role-scoping itself required no code change since
  `isAdmin` in `app/(app)/tournaments/[id].tsx` already keys off club
  role/staff role, not plain membership — documented in Task 2's migration
  comment and verification checklist rather than a separate task.
- **Placeholder scan:** every step has literal code or an exact manual
  checklist; no TBDs.
- **Type consistency:** `leaveClub(clubId: string): Promise<void>` defined
  in Task 3 is the exact signature Task 4 imports and calls.
