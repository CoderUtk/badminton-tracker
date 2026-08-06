# Remove Club Players & Tournament Scorers — Design

## Goal

Club admins can remove a player from the club roster. Tournament admins can remove a scorer from tournament staff.

## Scope

In scope:
- Remove a `club_players` row (club owner/admin only), blocked if the player has any `tournament_entrants` row.
- Remove a `tournament_staff` row where `role = 'scorer'` (tournament admin only). Admin rows are never removable through this feature.
- New "Players" screen under the clubs stack listing the roster with a remove action.
- Remove action added to the existing scorer roster in `TournamentScorersTab`.

Out of scope:
- Removing an entrant from a tournament that already has a bracket (existing `removeEntrant` stays draft-only, unchanged).
- Removing a tournament admin.
- Revoking `club_members` access (club membership itself is untouched — only the player-roster entry).

## Data layer

### `remove_club_player` RPC (new migration `0022_remove_club_player.sql`)

```sql
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
```

`club_players` already cascades `attendance` on delete (existing FK) — no extra cleanup needed there. `matches.side_a`/`side_b` are denormalized JSON, not FKs, so match history is unaffected.

### `remove_tournament_staff` RPC (same migration file)

```sql
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

### Repo functions

`src/repos/clubRepo.ts` — add:

```ts
export async function removePlayer(clubPlayerId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage players");
  const { error } = await supabase.rpc("remove_club_player", { p_club_player_id: clubPlayerId });
  if (error) throw new Error(error.message);
  await refreshClubs();
}
```

`src/repos/tournamentStaffRepo.ts` — add:

```ts
export async function removeStaff(staffId: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage staff");
  const { error } = await supabase.rpc("remove_tournament_staff", { p_staff_id: staffId });
  if (error) throw new Error(error.message);
}
```

## UI

### Club players screen — `app/(app)/clubs/players/[clubId].tsx` (new)

Mirrors `app/(app)/clubs/requests/[clubId].tsx`: `FlatList` of `listPlayers(clubId)`, each row shows name + a trash `PressableScale` (admin-only, gated by `getClub(clubId)?.role`). Tapping trash opens a `Sheet` confirm ("Remove <name>? They can't have any tournament history."); on confirm calls `removePlayer`, drops the row locally on success, shows a toast on error (surfaces the RPC's blocking message verbatim).

Register in `app/(app)/clubs/_layout.tsx`:
```tsx
<Stack.Screen name="players/[clubId]" options={{ title: "Players" }} />
```

Link to it from `app/(app)/clubs/[id].tsx`, next to the existing "Pending requests" secondary button, admin-only:
```tsx
<Pressable style={s.secondary} onPress={() => router.push(`/(app)/clubs/players/${club.id}`)}>
  <Text style={s.secondaryText}>Manage players</Text>
</Pressable>
```

### `TournamentScorersTab.tsx`

Add a trash `PressableScale` to each `staff` row where `m.role === "scorer"` and `isAdmin`. Tapping opens a `Sheet` confirm ("Remove <name> as scorer?"); on confirm calls `removeStaff(m.id)`, then `onChanged()`. Errors toast.

## Testing

- Unit: none needed beyond existing repo-layer patterns (RPC calls are thin wrappers already covered by existing repo test conventions — no new pure logic to unit test).
- Manual: club admin removes a roster player with no tournament history → succeeds, row disappears. Club admin removes a player who's a tournament entrant → RPC error toasts, row stays. Tournament admin removes a scorer → row disappears, scorer's `myStaffRole` becomes `null` next reload. Non-admin sees no trash icons in either screen.
