-- 0025_block_remove_club_owner_player.sql
-- The club owner's own roster row must not be removable — it would leave
-- the owner unable to enter their own matches/tournaments.

create or replace function public.remove_club_player(p_club_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_target_profile_id uuid;
  v_role text;
begin
  select club_id, profile_id into v_club_id, v_target_profile_id
    from club_players where id = p_club_player_id;
  if v_club_id is null then
    raise exception 'Player not found';
  end if;

  select role into v_role from club_members
    where club_id = v_club_id and profile_id = auth.uid();
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  if v_target_profile_id is not null and exists (
    select 1 from club_members
      where club_id = v_club_id and profile_id = v_target_profile_id and role = 'owner'
  ) then
    raise exception 'Cannot remove the club owner';
  end if;

  if exists (select 1 from tournament_entrants where club_player_id = p_club_player_id) then
    raise exception 'Player has tournament history — remove them from tournaments first';
  end if;

  delete from club_players where id = p_club_player_id;
end;
$$;

grant execute on function public.remove_club_player(uuid) to authenticated;
