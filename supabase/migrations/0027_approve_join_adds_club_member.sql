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
