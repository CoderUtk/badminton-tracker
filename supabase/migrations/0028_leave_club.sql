-- 0028_leave_club.sql
-- Renumbered from 0026: that version was already taken by 0026_avatar_storage.sql,
-- so `supabase db push` treated this file as applied and silently skipped it.
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
