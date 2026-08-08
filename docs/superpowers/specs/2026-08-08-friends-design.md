# Friends — Design

## Goal

Let two real accounts form a mutual, consenting connection by username, so a club owner can add a known player straight into a club without an invite code.

## Why now, and why only this much

Usernames (`2026-08-07-usernames-design.md`) shipped the identity primitive and explicitly deferred every lookup/social surface built on top of it. Friends is the first such surface. It stays narrow on purpose: a connection list used for one concrete job (club quick-add), not a profile system, feed, or stats comparison.

## Scope

In scope:
- `friendships` table: mutual request/accept between two real (non-anonymous) accounts.
- Add-by-exact-username lookup (no fuzzy search, no directory/browse — same anti-enumeration posture as usernames).
- A Friends screen under Profile: accepted list, incoming/outgoing pending requests, add-friend entry point.
- Club manage-players quick-add: pick an accepted friend not already in the club, add them straight to `club_members`.

Out of scope:
- Any profile view of a friend (stats, badges, shared clubs). The friends list shows name + avatar only.
- Removing/unfriending is in scope (needed so the list stays usable) but blocking/reporting is not.
- Friend suggestions, mutual-friend counts, or any discovery beyond typing an exact username.
- Guests (`club_players` with `profile_id = null`) and anonymous/guest-mode sessions — same exclusion as usernames, they have no `profiles` row to friend.
- Using friends for tournament entrant quick-add (deferred; club quick-add is the only integration point this ships).

## Data layer

### Migration `0032_friendships.sql`

Re-check `ls supabase/migrations | tail -3` immediately before applying — this project has a history of migration-number collisions across concurrent sessions.

```sql
-- 0032_friendships.sql
create table if not exists public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- One relationship per pair regardless of direction: prevents A->B and B->A
-- both existing (e.g. two simultaneous requests, or re-requesting after a
-- symmetric read would already show them as friends).
create unique index if not exists friendships_unordered_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

create policy "friendships are readable by either party"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "a user can request a friendship as themselves"
  on public.friendships for insert to authenticated
  with check (
    auth.uid() = requester_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

create policy "either party can update status (accept/decline/remove)"
  on public.friendships for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "either party can delete the friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
```

Decline and unfriend are both modeled as `delete` (not a `'declined'` status) — there's no reason to keep a tombstone row, and it lets a declined request be re-sent later without a unique-index conflict.

### Repo — `src/repos/friendRepo.ts`

- `sendFriendRequest(username: string): Promise<void>` — resolves username to `profiles.id` via exact match, inserts a `pending` row with `requester_id = me`. Throws a clear "no user with that username" error if the lookup misses, and "already friends" / "request already pending" if the unordered-pair index would conflict.
- `respondToRequest(requesterId: string, accept: boolean): Promise<void>` — `accept` updates status to `'accepted'` and sets `responded_at`; decline deletes the row. Only callable by the addressee.
- `cancelRequest(addresseeId: string): Promise<void>` — requester deletes their own pending row.
- `removeFriend(friendId: string): Promise<void>` — either party deletes an accepted row.
- `listFriends(): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]>` — accepted rows, joined against `profiles` for the other party's display fields.
- `listIncomingRequests()` / `listOutgoingRequests()` — pending rows split by direction relative to `auth.uid()`.

All five follow the existing repo convention: `if (!supabase) throw new Error("Sign in to ...")` guard first, matching every other repo in this codebase.

## UI

### `app/(app)/profile/friends.tsx`

Reached via a new "Friends" row on `app/(app)/profile.tsx` (same list-item pattern already used there for other settings rows).

- **Add friend**: a text input + button at the top. Submits to `sendFriendRequest`; toasts the result (success, "not found", "already pending", etc. — reusing the existing `toast()` utility).
- **Incoming requests**: name/avatar + Accept/Decline buttons, only rendered when non-empty.
- **Outgoing requests**: name/avatar + Cancel, only rendered when non-empty.
- **Friends**: name/avatar list, swipe or long-press to remove (matching whatever removal affordance `TournamentPlayersTab` or similar already uses for consistency — implementer should check current patterns rather than invent a new one).

### Club quick-add

On the club's manage-players screen (where `addGuestPlayer` currently lives, `app/(app)/tournaments/new.tsx`'s guest-add pattern is the closest existing analog — actual location is the club players tab, implementer to confirm exact file), add an "Add friend" option beside "Add guest". Opens a picker over `listFriends()` filtered to exclude profile ids already present in `listPlayers(clubId)`. Selecting one calls a new `clubRepo.addFriendToClub(clubId, profileId)` that inserts directly into `club_members` (bypassing `joinClub`'s invite-code path, since friendship is the trust signal) with the same guard rails `addGuestPlayer` already has (must be club owner/manager, per existing RLS on `club_members` insert).

## Testing

- `friendRepo` unit tests (matching existing repo test patterns, e.g. `tests/*.test.ts` for other repos): send request → both directions listed correctly, accept moves it to friends for both, decline/cancel/remove all delete correctly, duplicate-request and self-request rejected.
- Migration test: unordered-pair unique index actually blocks A→B after B→A exists.
