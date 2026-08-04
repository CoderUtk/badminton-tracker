-- Requests carry the role the link invited. Defaulting to 'player' keeps
-- in-flight requests created before this migration valid.
alter table public.tournament_join_requests
  add column if not exists role text not null default 'player'
  check (role in ('player', 'scorer'));

create or replace function public.request_tournament_join(
  p_tournament_id uuid,
  p_role text default 'player'
) returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_tstatus text;
begin
  select status into v_tstatus from tournaments where id = p_tournament_id;
  if v_tstatus is null then raise exception 'Tournament not found'; end if;

  if p_role not in ('player', 'scorer') then
    raise exception 'Unknown role';
  end if;

  -- A bracket is sized at start, so a late entrant has nowhere to go.
  -- Scorers do not affect the draw and may join at any time.
  if p_role = 'player' and v_tstatus <> 'draft' then
    raise exception 'This tournament has already started';
  end if;

  if p_role = 'scorer' and exists (
    select 1 from tournament_staff
    where tournament_id = p_tournament_id and profile_id = auth.uid()
  ) then
    return 'member';
  end if;

  if p_role = 'player' and exists (
    select 1 from tournament_entrants e
    join club_players p on e.club_player_id = p.id
    where e.tournament_id = p_tournament_id and p.profile_id = auth.uid()
  ) then
    return 'member';
  end if;

  select status into v_status from tournament_join_requests
  where tournament_id = p_tournament_id and profile_id = auth.uid() and role = p_role
  limit 1;
  if v_status = 'denied' then return 'denied'; end if;
  if v_status is null then
    insert into tournament_join_requests (tournament_id, profile_id, role)
    values (p_tournament_id, auth.uid(), p_role);
  end if;
  return 'pending';
end $$;

-- Approving branches on the request's role: a player becomes an entrant, a
-- scorer becomes staff. p_club_player_id is ignored for scorer requests.
create or replace function public.approve_tournament_join(
  p_request_id uuid,
  p_club_player_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid; v_role text; v_profile uuid; v_club uuid; v_player uuid;
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
    -- Entrants reference club_players, so a requester who is not yet one needs
    -- a row. Creating it here spares the admin pre-registering everybody.
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
    insert into tournament_entrants (tournament_id, club_player_id)
    values (v_tourney_id, v_player) on conflict do nothing;
  end if;

  update tournament_join_requests set status = 'approved', decided_at = now()
  where id = p_request_id;
end $$;

create or replace function public.deny_tournament_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid;
begin
  select tournament_id into v_tourney_id from tournament_join_requests
  where id = p_request_id and status = 'pending';
  if v_tourney_id is null then raise exception 'Request not found or decided'; end if;
  if not is_tournament_admin(v_tourney_id) then
    raise exception 'Only admin can deny';
  end if;
  update tournament_join_requests set status = 'denied', decided_at = now()
  where id = p_request_id;
end $$;
