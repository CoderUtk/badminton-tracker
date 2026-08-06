-- approve_tournament_join's entrant insert (0013_join_request_roles.sql:85-86)
-- never set `seed`, which is not-null with no default (0002_tournaments.sql:14).
-- The id fix in 0022 unmasked this: every player-request approval now fails
-- with "null value in column seed violates not-null constraint" instead.
-- Compute the next seed the same way addGuestEntrant does client-side
-- (tournamentRepo.ts:188-191): max existing seed + 1, or 1 if none yet.
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

  if v_role = 'scorer' then
    insert into tournament_staff (tournament_id, profile_id, role)
    values (v_tourney_id, v_profile, 'scorer') on conflict do nothing;
  else
    v_player := p_club_player_id;
    if v_player is null then
      select t.club_id into v_club from tournaments t where t.id = v_tourney_id;
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
