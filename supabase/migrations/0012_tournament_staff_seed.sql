-- Phase 3 gated every approval on a tournament_staff row with role = 'admin',
-- but nothing ever inserted one: approve/deny always raised and the queue
-- policy was always false. This seeds that row and backfills existing rows.

alter table public.tournaments
  add column if not exists created_by uuid references public.profiles (id);

-- Trigger keeps staff seeding atomic with creation. A second client call could
-- fail on its own and leave a tournament nobody can administer.
create or replace function public.seed_tournament_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  insert into public.tournament_staff (tournament_id, profile_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_tournament_created on public.tournaments;
create trigger on_tournament_created
  after insert on public.tournaments
  for each row execute function public.seed_tournament_staff();

-- Backfill: every club admin of the owning club becomes a tournament admin.
-- created_by is unknown for these rows, so club admins are the only honest
-- source. Without this, tournaments made before today keep a dead queue.
insert into public.tournament_staff (tournament_id, profile_id, role)
select t.id, m.profile_id, 'admin'
from public.tournaments t
join public.club_members m on m.club_id = t.club_id and m.role in ('owner', 'admin')
on conflict do nothing;

-- Mirrors is_club_admin. An admin implies scorer rights; there is deliberately
-- no second 'scorer' row per admin, because two rows can disagree.
create or replace function public.is_tournament_admin(p_tournament_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from tournament_staff
    where tournament_id = p_tournament_id and profile_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_tournament_staff(p_tournament_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from tournament_staff
    where tournament_id = p_tournament_id and profile_id = auth.uid()
  );
$$;

-- A tournament admin who is not a club admin must still be able to start.
-- This is 0011's function reproduced with ONE line changed (the authorisation
-- check). Every other guard is byte-identical and must stay that way.
create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_bracket jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_status text;
  v_type text;
  v_entrants int;
  v_players int;
  v_draw int;
begin
  select club_id, status, match_type into v_club, v_status, v_type
  from tournaments where id = p_tournament_id;

  if v_club is null then
    raise exception 'Tournament not found';
  end if;
  -- CHANGED from 0011: a tournament admin who is not a club admin may start.
  if not (is_club_admin(v_club) or is_tournament_admin(p_tournament_id)) then
    raise exception 'Only an admin can start this tournament';
  end if;
  -- Blocks a second start from rebuilding a live bracket over played results.
  if v_status <> 'draft' then
    raise exception 'This tournament has already started';
  end if;
  -- Legacy drafts created before the two-phase split already carry a full
  -- bracket. Starting one again would insert a second, overlapping set of
  -- rows (no unique constraint on tournament_id/round/idx) and corrupt
  -- finish_bracket_match's advance update.
  if exists (select 1 from bracket_matches where tournament_id = p_tournament_id) then
    raise exception 'This tournament already has a bracket';
  end if;

  select count(*) into v_entrants from tournament_entrants
  where tournament_id = p_tournament_id;

  v_players := v_entrants * (case when v_type = 'doubles' then 2 else 1 end);
  if v_type = 'doubles' and v_players < 6 then
    raise exception 'Add at least 6 players to start';
  end if;
  if v_type <> 'doubles' and v_players < 4 then
    raise exception 'Add at least 4 players to start';
  end if;
  if v_entrants > 64 then
    raise exception 'A tournament holds at most 64 entrants';
  end if;

  v_draw := 4;
  while v_draw < v_entrants loop v_draw := v_draw * 2; end loop;

  -- Validate the client payload rather than trusting it.
  if jsonb_array_length(p_bracket) <> v_draw - 1 then
    raise exception 'Bracket does not match the draw size';
  end if;
  -- Every non-null entrant id in the payload — entrant_a, entrant_b, and
  -- winner_entrant (legitimately set on byes buildBracket already resolved)
  -- — must belong to this tournament.
  if exists (
    select 1
    from jsonb_array_elements(p_bracket) e
    cross join lateral (values
      (e->>'entrant_a'), (e->>'entrant_b'), (e->>'winner_entrant')
    ) as ids(entrant_id)
    where ids.entrant_id is not null
      and ids.entrant_id::uuid not in (
        select id from tournament_entrants where tournament_id = p_tournament_id)
  ) then
    raise exception 'Bracket references entrants from another tournament';
  end if;

  insert into bracket_matches (id, tournament_id, round, idx, match_id, entrant_a, entrant_b, winner_entrant, court, scored_by)
  select
    (e->>'id')::uuid, p_tournament_id, (e->>'round')::int, (e->>'idx')::int,
    null, (e->>'entrant_a')::uuid, (e->>'entrant_b')::uuid,
    (e->>'winner_entrant')::uuid, null, null
  from jsonb_array_elements(p_bracket) e;

  update tournaments set size = v_draw, status = 'live' where id = p_tournament_id;
end;
$$;
