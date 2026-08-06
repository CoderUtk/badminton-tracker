# Club Leave + Tournament Approval Visibility

## Problem

Two gaps found in club/tournament membership:

1. Non-creator club members have no way to leave a club. The club detail
   screen shows a share button to every member regardless of role, but only
   the creator (`owner`) can actually approve join requests, so the share
   button is misleading for everyone else.

2. When a tournament admin approves a join request (player or scorer role),
   `approve_tournament_join` inserts into `tournament_entrants` /
   `tournament_staff` but never into `club_members`. Every read policy in the
   schema (`tournaments`, `tournament_entrants`, `bracket_matches`,
   `club_players`) gates on `is_club_member(club_id)`. An approved requester
   who isn't already a member of that tournament's club is therefore
   invisible everywhere: the tournament never appears in their Cups tab, and
   if they navigate to it directly by id, the bracket and roster queries
   return nothing.

## Feature 1: Leave club

### Database

New RPC, `supabase/migrations/0026_leave_club.sql`:

```sql
create or replace function public.leave_club()
```

Actually takes `p_club_id uuid`. Behavior:
- Look up caller's `club_members` row for that club. If none, no-op error
  "Not a member of this club".
- If `role = 'owner'`, raise `'Club owner cannot leave — delete the club instead'`.
- If caller's `club_players` row (matched by `club_id` + `profile_id =
  auth.uid()`) has any `tournament_entrants` referencing it, raise
  `'You have tournament history — this cannot be undone once you leave'`
  (mirrors the existing `remove_club_player` guard in
  `0025_block_remove_club_owner_player.sql`).
- Otherwise: delete the caller's `club_players` row (if any), then delete
  the caller's `club_members` row.

`security definer`, `set search_path = public`, granted to `authenticated`.

### Client

- `src/repos/clubRepo.ts`: add `leaveClub(clubId: string): Promise<void>`
  calling the RPC, then `refreshClubs()` and removing the club from local
  cache (mirrors `deleteClub`'s cache cleanup).
- `app/(app)/clubs/[id].tsx`:
  - The existing `shareBtn` in the hero only renders when `isOwner` (not
    `isAdmin` — matches "only creator can share/approve").
  - When `!isOwner`, render a small "Leave" button in the same absolute
    top-right slot instead (reuse `shareBtn` positioning styles, swap icon
    to an exit/leave icon and red-tinted background to signal it's a
    one-way action).
  - Tapping it opens a confirm `Sheet` ("Leave club?" / "You'll lose access
    to its sessions, matches, and tournaments." with destructive "Leave" +
    "Cancel" actions), matching the existing delete-club confirm pattern.
  - On confirm, call `leaveClub(id)`, then `router.replace("/")`. On error,
    toast the RPC's message (surfaces the tournament-history guard).

## Feature 2: Tournament approval grants club visibility

### Database

Update `approve_tournament_join` (new migration
`supabase/migrations/0027_approve_join_adds_club_member.sql`, `create or
replace` over the existing function) to also run, right after resolving
`v_club`/looking up the tournament's club id:

```sql
insert into club_members (club_id, profile_id, role)
values (v_club, v_profile, 'member')
on conflict do nothing;
```

This needs `v_club` resolved unconditionally (currently only resolved in
the player branch when `p_club_player_id is null`) — restructure so
`v_club` is looked up once at the top of the function for both branches.

No changes needed to any RLS policy: `is_club_member` already governs every
read path this needs to unlock, and it becomes true for these rows.

### Rights stay role-scoped

This does not change tournament-level authorization. `app/(app)/tournaments/[id].tsx`
already computes `isAdmin` from `clubRole === 'owner' || clubRole === 'admin'
|| isTournamentAdmin` (`isTournamentAdmin` comes from `myStaffRole(id) ===
'admin'`) independent of plain club membership. A newly-added `member` who
was approved as a tournament `scorer` or player-entrant gets:
- Read access to the tournament, bracket, and roster (new: previously
  blocked).
- No admin affordances (Ops tab, pending requests, delete tournament) —
  unchanged, since their club role is `member` and their staff role (if any)
  is `scorer`, not `admin`.

### Client

No changes required — `listAllTournaments()` already iterates
`listClubs()`, and `refreshClubs()` (called on app focus / club actions
elsewhere) will pick up the new `club_members` row on next sync.

## Testing

- `tests/`: no existing RPC-level tests (Supabase functions aren't unit
  tested in this repo — confirmed via `tests/` directory scan). Verify
  manually against a local/staging Supabase instance:
  - Leave: member leaves → club disappears from their list; owner attempts
    leave → blocked; member with tournament history attempts leave →
    blocked with the guard message.
  - Approval: admin of Club A approves a join request from a user who is
    not a Club A member, as both `player` and `scorer` roles → tournament
    appears in that user's Cups tab; user has no admin controls on it.
- `npx tsc --noEmit` and `npm test -- --silent` after client changes.

## Out of scope

- Owner transferring ownership before leaving (not requested).
- Un-approving / demoting a tournament participant back out of club
  membership.
- Any UI change to tournament-level per-role permissions beyond what
  already exists (e.g. restricting bracket cell taps to a scorer's assigned
  matches) — not part of this request.
