-- 0033_add_friend_to_club.sql
-- Lets a club owner/admin add an accepted friend straight into the club,
-- skipping the invite-code flow. Mirrors join_club/create_club's pattern of
-- inserting both club_members and club_players in one call.

create or replace function public.add_friend_to_club(p_club_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_are_friends boolean;
begin
  select role into v_role from club_members
    where club_id = p_club_id and profile_id = auth.uid();
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = p_friend_id)
        or (requester_id = p_friend_id and addressee_id = auth.uid()))
  ) into v_are_friends;
  if not v_are_friends then
    raise exception 'Not friends with that player';
  end if;

  insert into club_members (club_id, profile_id, role)
  values (p_club_id, p_friend_id, 'member')
  on conflict do nothing;

  insert into club_players (club_id, profile_id, name)
  select p_club_id, p_friend_id, coalesce(p.display_name, 'Player')
  from profiles p where p.id = p_friend_id
  on conflict (club_id, profile_id) do nothing;
end;
$$;

grant execute on function public.add_friend_to_club(uuid, uuid) to authenticated;
