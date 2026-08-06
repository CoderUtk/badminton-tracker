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
