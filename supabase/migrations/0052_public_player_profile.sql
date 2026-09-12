-- 0052_public_player_profile.sql
-- A public, linkable player page at /u/<username>.
--
-- Every share the app produces today is an image, so it has no inbound link
-- surface at all. This adds one -- and it is the only place in the schema that
-- deliberately shows anything to an unauthenticated caller, so it is built the
-- narrow way:
--
--   * Opt-in. Default off. Nobody is published by turning this migration on.
--   * NO table policy is loosened. `profiles` keeps its authenticated-only
--     SELECT; nothing becomes readable to `anon` at the table level. The
--     entire public surface is the one security-definer function below, and
--     it returns a fixed, hand-listed set of columns.
--   * Aggregates only. Record, club ratings and rank. No email, no club
--     membership list, no other players' names, no session locations, no
--     match history -- nothing that is not already printed on a share card
--     the player chose to post.

alter table public.profiles
  add column if not exists public_profile boolean not null default false;

-- The lookup is by username, so it needs to be findable.
create unique index if not exists profiles_username_lower
  on public.profiles (lower(username)) where username is not null;

-- Returns null for: no such username, a profile that has not opted in, and a
-- profile with no username. Those are indistinguishable on purpose -- a public
-- endpoint that answers "that user exists but is private" is a username
-- enumeration oracle.
create or replace function public.public_player_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_name     text;
  v_avatar   text;
  v_handle   text;
  v_ids      uuid[];
  v_club_ids uuid[];
  v_played   int := 0;
  v_won      int := 0;
  v_clubs    jsonb;
begin
  if p_username is null or btrim(p_username) = '' then return null; end if;

  select p.id, coalesce(p.display_name, p.username), p.avatar_url, p.username
    into v_id, v_name, v_avatar, v_handle
    from profiles p
   where lower(p.username) = lower(btrim(p_username))
     and p.public_profile;

  if v_id is null then return null; end if;

  -- Every roster row this person occupies, across their clubs. These ids are
  -- what the match jsonb cites; the club ids bound the scan below.
  select array_agg(cp.id), array_agg(distinct cp.club_id)
    into v_ids, v_club_ids
    from club_players cp where cp.profile_id = v_id;

  if v_ids is not null then
    select count(*)::int,
           count(*) filter (
             where (m.winner = 'A' and exists (
                     select 1 from jsonb_array_elements(m.side_a) e
                      where (e->>'club_player_id')::uuid = any (v_ids)))
                or (m.winner = 'B' and exists (
                     select 1 from jsonb_array_elements(m.side_b) e
                      where (e->>'club_player_id')::uuid = any (v_ids)))
           )::int
      into v_played, v_won
      from matches m
     -- MUST come first, and must stay. This function is granted to `anon`,
     -- so without a club filter every unauthenticated call is a sequential
     -- scan of the whole matches table with a jsonb_array_elements probe per
     -- row -- an anonymous request amplifier. matches_club_id (0036) turns
     -- that into an index scan over the handful of clubs this player is in,
     -- and a player's matches can only ever be in their own clubs anyway.
     where m.club_id = any (v_club_ids)
       and m.status = 'completed'
       and m.winner is not null
       and (exists (select 1 from jsonb_array_elements(m.side_a) e
                     where (e->>'club_player_id')::uuid = any (v_ids))
         or exists (select 1 from jsonb_array_elements(m.side_b) e
                     where (e->>'club_player_id')::uuid = any (v_ids)));

    -- Club name and rating only. Deliberately not the roster, the member
    -- count, or anything else about the club itself.
    select jsonb_agg(jsonb_build_object(
             'club', c.name,
             'rating', cp.rating,
             'rank', (select count(*) + 1
                        from club_players o
                       where o.club_id = cp.club_id and o.rating > cp.rating))
           order by cp.rating desc)
      into v_clubs
      from club_players cp
      join clubs c on c.id = cp.club_id
     where cp.profile_id = v_id;
  end if;

  return jsonb_build_object(
    'username',    v_handle,
    'displayName', v_name,
    'avatarUrl',   v_avatar,
    'played',      coalesce(v_played, 0),
    'won',         coalesce(v_won, 0),
    'clubs',       coalesce(v_clubs, '[]'::jsonb));
end $$;

-- The one intentionally public grant in the schema.
revoke all on function public.public_player_profile(text) from public;
grant execute on function public.public_player_profile(text) to anon, authenticated;

-- The owner's switch. Security definer so it does not depend on the profiles
-- UPDATE policy staying shaped the way it is today, and it can only ever
-- touch the caller's own row.
create or replace function public.set_public_profile(p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'set_public_profile: not authenticated';
  end if;
  -- `authenticated` includes anonymous sessions in Supabase, so the role
  -- grant above is not the account check it looks like. Same guard and same
  -- reason as register_push_token (0035): a guest has no account to publish.
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'set_public_profile: anonymous sessions have no public profile';
  end if;
  -- A profile with no username has no URL to be published at.
  if coalesce(p_public, false)
     and (select username from profiles where id = auth.uid()) is null then
    raise exception 'Pick a username before making your profile public';
  end if;
  update profiles set public_profile = coalesce(p_public, false) where id = auth.uid();
end $$;

revoke all on function public.set_public_profile(boolean) from public, anon;
grant execute on function public.set_public_profile(boolean) to authenticated;
