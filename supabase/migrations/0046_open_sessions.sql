-- Open sessions: claim a slot in a club night from a shared link, without
-- becoming a member of that club.
--
-- The link is the access grant, scoped to exactly one session — the same shape
-- as tournament_spectator_view (0017), not the club join-request flow (0004).
-- A joiner receives a club_players roster row and NOT a club_members row, so
-- is_club_member() stays false for them and every existing club policy keeps
-- them out of the club, its other sessions, its stats and its matches.
--
-- No table policies change. All access runs through the security-definer
-- functions below, each gated internally.

alter table public.sessions
  add column open_join  boolean not null default false,
  add column max_players int check (max_players is null or max_players between 1 and 100);

-- One definition of "organiser" — the session creator or a club admin.
--
-- 0045 introduced this predicate as can_manage_session_cost. Open-join needs
-- the identical rule, so the concept is renamed here and the old name becomes a
-- wrapper: set_session_cost and set_attendance_settled keep resolving, and
-- there is one place to change who counts as an organiser rather than two that
-- drift apart.
create or replace function public.can_manage_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session_id
       and (public.is_club_admin(s.club_id) or s.created_by = auth.uid())
  );
$$;

create or replace function public.can_manage_session_cost(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_session(p_session_id);
$$;

-- Organiser toggles the link on/off and sets the cap.
--
-- The sessions UPDATE policy is admin-only (0001), so a creator who is not an
-- admin cannot write these columns directly — hence an RPC, exactly as 0045
-- needed for the cost columns.
create or replace function public.set_session_open_join(
  p_session_id uuid,
  p_open boolean,
  p_max_players int
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_session(p_session_id) then
    raise exception 'Only the session creator or a club admin can open this session';
  end if;
  if p_max_players is not null and (p_max_players < 1 or p_max_players > 100) then
    raise exception 'Player limit must be between 1 and 100';
  end if;
  -- Lowering the cap below the current head count is allowed and evicts nobody;
  -- it only stops further joins. Evicting players because a number was edited
  -- would be a destructive surprise from a settings change.
  update sessions
     set open_join = coalesce(p_open, false),
         max_players = p_max_players
   where id = p_session_id;
end $$;

-- What a link holder may see. No player names, no cost, no other session.
-- Returns zero rows when the session is closed, so a revoked link is
-- indistinguishable from one that never existed.
create or replace function public.session_open_preview(p_session_id uuid)
returns table (
  session_id uuid,
  club_name text,
  location text,
  starts_at timestamptz,
  status text,
  checked_in int,
  max_players int,
  already_in boolean
) language sql security definer stable set search_path = public as $$
  select
    s.id,
    c.name,
    s.location,
    s.starts_at,
    s.status,
    (select count(*)::int from attendance a
      where a.session_id = s.id and a.status = 'in'),
    s.max_players,
    exists (
      select 1 from attendance a
        join club_players p on p.id = a.club_player_id
       where a.session_id = s.id and a.status = 'in' and p.profile_id = auth.uid()
    )
  from sessions s
  join clubs c on c.id = s.club_id
  where s.id = p_session_id and s.open_join
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false;
$$;

-- Claim a slot. Returns the caller's club_player_id.
create or replace function public.join_open_session(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_club  uuid;
  v_open  boolean;
  v_status text;
  v_max   int;
  v_count int;
  v_player uuid;
  v_name  text;
begin
  if auth.uid() is null then raise exception 'Sign in to join this session'; end if;
  -- Matches the convention in 0018_anon_rls_restrictions.sql: a zero-friction
  -- anon session must not be able to mint itself a club_players roster row and
  -- an attendance slot, which 0045's cost split would then divide real players'
  -- cost across.
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Sign in with a real account to join this session';
  end if;

  -- FOR UPDATE is load-bearing, not defensive. It serialises concurrent joiners
  -- on the session row so the capacity count below cannot be read stale — two
  -- people racing for the last slot would otherwise both see room and both win.
  select club_id, open_join, status, max_players
    into v_club, v_open, v_status, v_max
    from sessions where id = p_session_id for update;

  if v_club is null or not v_open then raise exception 'This link is no longer active'; end if;
  if v_status not in ('scheduled', 'live') then
    raise exception 'This session has already finished';
  end if;

  -- Reuse this player's existing roster row when they have played this club
  -- before, so a repeat visitor rejoins as themselves instead of cloning a
  -- second same-named entry onto the roster.
  select id into v_player
    from club_players
   where club_id = v_club and profile_id = auth.uid()
   limit 1;

  if v_player is null then
    select coalesce(nullif(display_name, ''), 'Player') into v_name
      from profiles where id = auth.uid();
    insert into club_players (club_id, profile_id, name)
      values (v_club, auth.uid(), coalesce(v_name, 'Player'))
      on conflict (club_id, profile_id) do nothing
      returning id into v_player;
    -- A concurrent first-ever join for this same player won the insert.
    -- ON CONFLICT DO NOTHING returns no row, so adopt the row they created
    -- rather than failing — either way the player ends up with exactly one.
    if v_player is null then
      select id into v_player from club_players
       where club_id = v_club and profile_id = auth.uid() limit 1;
    end if;
  end if;

  if exists (select 1 from attendance
              where session_id = p_session_id
                and club_player_id = v_player and status = 'in') then
    return v_player; -- idempotent: already in, nothing to do
  end if;

  select count(*)::int into v_count
    from attendance where session_id = p_session_id and status = 'in';
  if v_max is not null and v_count >= v_max then
    raise exception 'This session is full';
  end if;

  insert into attendance (session_id, club_player_id, status)
    values (p_session_id, v_player, 'in')
    on conflict (session_id, club_player_id) do update set status = 'in';

  return v_player;
end $$;

-- Give the slot back. Only ever touches the caller's own row.
--
-- Required, not a nicety: a joiner is checked in, and 0045 therefore hands them
-- a share of the night's cost. Right when they played, wrong when they mistapped
-- a link — so there has to be a way out.
create or replace function public.leave_open_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_player uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in to leave this session'; end if;
  -- Same convention as join_open_session / 0018_anon_rls_restrictions.sql.
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Sign in with a real account to leave this session';
  end if;

  -- Same gate as join_open_session. Without it, a joiner can flip themselves
  -- to 'out' after the session is done and the organiser has entered the
  -- cost (0045_session_cost.sql) — that shrinks the 'in'-count divisor and
  -- silently raises everyone else's share.
  select status into v_status from sessions where id = p_session_id;
  if v_status is null or v_status not in ('scheduled', 'live') then
    raise exception 'This session has already finished';
  end if;

  select p.id into v_player
    from club_players p
    join sessions s on s.id = p_session_id and s.club_id = p.club_id
   where p.profile_id = auth.uid()
   limit 1;
  if v_player is null then raise exception 'You are not in this session'; end if;
  update attendance set status = 'out'
   where session_id = p_session_id and club_player_id = v_player;
  if not found then
    raise exception 'You are not in this session';
  end if;
end $$;

revoke all on function public.can_manage_session(uuid) from public, anon;
revoke all on function public.can_manage_session_cost(uuid) from public, anon;
revoke all on function public.set_session_open_join(uuid, boolean, int) from public, anon;
revoke all on function public.session_open_preview(uuid) from public, anon;
revoke all on function public.join_open_session(uuid) from public, anon;
revoke all on function public.leave_open_session(uuid) from public, anon;
grant execute on function public.can_manage_session(uuid) to authenticated;
grant execute on function public.can_manage_session_cost(uuid) to authenticated;
grant execute on function public.set_session_open_join(uuid, boolean, int) to authenticated;
grant execute on function public.session_open_preview(uuid) to authenticated;
grant execute on function public.join_open_session(uuid) to authenticated;
grant execute on function public.leave_open_session(uuid) to authenticated;
