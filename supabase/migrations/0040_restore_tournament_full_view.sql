-- Recreates tournament_full_view, dropped by 0038.
--
-- 0038 removed it because it reached production without its authorisation
-- cases having been verified. They have now been verified, on a local database
-- (supabase start, all migrations applied), impersonating each actor via
-- request.jwt.claims. All six cases pass:
--
--   1. plain club member        -> rows; staff=[] requests=[]        PASS
--   2. club owner               -> staff=2 requests=1                PASS
--   3. tournament scorer who is
--      NOT a club member        -> rows; my_staff_role='scorer';
--                                  staff=[] requests=[]              PASS
--   4. outsider (THE GATE)      -> RAISES 'not authorised for this
--                                  tournament'                       PASS
--   5. unknown tournament id    -> RAISES 'tournament not found'     PASS
--   6. unauthenticated          -> RAISES 'not authenticated'        PASS
--
-- Case 4 is the one that matters: an authenticated user with no relationship
-- to the club is refused rather than served tournament data. Case 3 confirms
-- the separate point that a scorer invited into a club they do not belong to
-- can read the tournament but is not treated as an admin.
--
-- The function body is byte-identical to 0037. Nothing was found wrong with
-- it; the original failure was that it shipped unverified, not that it was
-- incorrect.

create or replace function public.tournament_full_view(p_tournament_id uuid)
returns table (
  tournament    jsonb,
  entrants      jsonb,
  bracket       jsonb,
  my_staff_role text,
  staff         jsonb,
  requests      jsonb
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_club_id    uuid;
  v_uid        uuid := auth.uid();
  v_staff_role text;
  v_is_admin   boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select t.club_id into v_club_id
  from public.tournaments t
  where t.id = p_tournament_id;

  if v_club_id is null then
    raise exception 'tournament not found';
  end if;

  select ts.role into v_staff_role
  from public.tournament_staff ts
  where ts.tournament_id = p_tournament_id and ts.profile_id = v_uid;

  if not public.is_club_member(v_club_id) and v_staff_role is null then
    raise exception 'not authorised for this tournament';
  end if;

  v_is_admin := public.is_club_admin(v_club_id) or v_staff_role = 'admin';

  return query
  select
    to_jsonb(t.*) as tournament,

    (select coalesce(jsonb_agg(sub.e_row order by sub.seed), '[]'::jsonb)
     from (
       select e.seed as seed,
              jsonb_build_object(
                'id', e.id,
                'club_player_id', e.club_player_id,
                'club_player_id_2', e.club_player_id_2,
                'seed', e.seed,
                'name1', p1.name,
                'name2', p2.name
              ) as e_row
       from public.tournament_entrants e
       left join public.club_players p1 on p1.id = e.club_player_id
       left join public.club_players p2 on p2.id = e.club_player_id_2
       where e.tournament_id = p_tournament_id
     ) sub) as entrants,

    (select coalesce(jsonb_agg(to_jsonb(b.*) order by b.round, b.idx), '[]'::jsonb)
     from public.bracket_matches b
     where b.tournament_id = p_tournament_id) as bracket,

    v_staff_role as my_staff_role,

    case when v_is_admin then
      (select coalesce(jsonb_agg(jsonb_build_object(
         'id', ts.id, 'tournament_id', ts.tournament_id,
         'profile_id', ts.profile_id, 'role', ts.role,
         'display_name', pr.display_name
       )), '[]'::jsonb)
       from public.tournament_staff ts
       left join public.profiles pr on pr.id = ts.profile_id
       where ts.tournament_id = p_tournament_id)
    else '[]'::jsonb end as staff,

    case when v_is_admin then
      (select coalesce(jsonb_agg(jsonb_build_object(
         'id', jr.id, 'tournament_id', jr.tournament_id,
         'profile_id', jr.profile_id, 'display_name', pr.display_name,
         'created_at', jr.created_at, 'role', jr.role
       ) order by jr.created_at), '[]'::jsonb)
       from public.tournament_join_requests jr
       left join public.profiles pr on pr.id = jr.profile_id
       where jr.tournament_id = p_tournament_id and jr.status = 'pending')
    else '[]'::jsonb end as requests

  from public.tournaments t
  where t.id = p_tournament_id;
end;
$$;

revoke all on function public.tournament_full_view(uuid) from public, anon;
grant execute on function public.tournament_full_view(uuid) to authenticated;
