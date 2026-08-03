-- Start a draft: insert its bracket and flip it live, in one transaction.
-- A half-built bracket left in draft would be unrecoverable through the UI.
--
-- The bracket arrives as jsonb from the client rather than being rebuilt here.
-- Seeding lives once, in the tested TypeScript buildBracket, instead of in two
-- languages that must stay byte-identical. Seeding order is a draw, not a
-- permission, so a client that shuffles it harms only itself; every guard that
-- protects other people's data is below and stays in SQL.
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
  if not is_club_admin(v_club) then
    raise exception 'Only an admin can start this tournament';
  end if;
  -- Blocks a second start from rebuilding a live bracket over played results.
  if v_status <> 'draft' then
    raise exception 'This tournament has already started';
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
  -- — must belong to this tournament. One pass over the unnested id column
  -- covers all three instead of repeating the same exists() per column.
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
