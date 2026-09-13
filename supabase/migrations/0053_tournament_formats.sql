-- Tournament formats: progression becomes data.
--
-- Each bracket row now records where its winner and loser go, so the server
-- follows the graph the client's format generator laid down instead of
-- re-deriving single-elimination tree math. That removes the duplicated draw
-- logic 0012 warns must stay "byte-identical" — there is nothing left to keep
-- in step — and it is what lets round-robin, double elimination and
-- groups-into-a-knockout share one advance path.
--
-- NO FOREIGN KEY on the routing columns, deliberately: start_tournament inserts
-- the whole bracket in ONE statement from jsonb_array_elements, and a round-1
-- row references a round-2 row in the same batch. A per-row FK check would fail
-- the first insert and kill every tournament start. Rows already cascade from
-- tournaments, so the constraint bought nothing.

alter table public.bracket_matches
  add column if not exists win_to_match_id  uuid,
  add column if not exists win_to_slot      text check (win_to_slot in ('a','b')),
  add column if not exists loss_to_match_id uuid,
  add column if not exists loss_to_slot     text check (loss_to_slot in ('a','b')),
  add column if not exists group_idx        int,
  add column if not exists src_a            text,
  add column if not exists src_b            text;

alter table public.tournaments
  add column if not exists group_count int,
  add column if not exists advance_per_group int;

-- Backfill: describe the routing existing tournaments were already doing, so
-- live brackets keep advancing mid-flight. Finals get null edges, which is
-- exactly right — a null win edge is now what "this ends the tournament" means.
update public.bracket_matches m set
  win_to_match_id = p.id,
  win_to_slot     = case when m.idx % 2 = 0 then 'a' else 'b' end
from public.bracket_matches p
where p.tournament_id = m.tournament_id
  and p.round = m.round + 1
  and p.idx   = m.idx / 2
  and m.win_to_match_id is null;

-- Replaces 0006's version. Every authorisation and validation guard there is
-- carried over unchanged; only the advance changed.
create or replace function public.finish_bracket_match(
  p_bracket_match_id uuid,
  p_winner_entrant uuid,
  p_slot_fills jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_tournament_id uuid;
  v_entrant_a uuid;
  v_entrant_b uuid;
  v_club_id uuid;
  v_win_to uuid;
  v_win_slot text;
  v_loss_to uuid;
  v_loss_slot text;
  v_loser uuid;
  v_fill jsonb;
  v_current uuid;
begin
  select tournament_id, entrant_a, entrant_b,
         win_to_match_id, win_to_slot, loss_to_match_id, loss_to_slot
    into v_tournament_id, v_entrant_a, v_entrant_b,
         v_win_to, v_win_slot, v_loss_to, v_loss_slot
    from bracket_matches where id = p_bracket_match_id;
  if v_tournament_id is null then
    raise exception 'Bracket match not found';
  end if;

  select club_id into v_club_id from tournaments where id = v_tournament_id;
  if not is_club_member(v_club_id) then
    raise exception 'Not a member of this tournament''s club';
  end if;
  if p_winner_entrant is null then
    raise exception 'Winner entrant is required';
  end if;
  if p_winner_entrant is distinct from v_entrant_a and p_winner_entrant is distinct from v_entrant_b then
    raise exception 'Winner is not one of this match''s entrants';
  end if;

  update bracket_matches set winner_entrant = p_winner_entrant where id = p_bracket_match_id;

  v_loser := case when p_winner_entrant = v_entrant_a then v_entrant_b else v_entrant_a end;

  if v_win_to is not null then
    if v_win_slot = 'a' then
      update bracket_matches set entrant_a = p_winner_entrant where id = v_win_to;
    else
      update bracket_matches set entrant_b = p_winner_entrant where id = v_win_to;
    end if;
  end if;

  if v_loss_to is not null and v_loser is not null then
    if v_loss_slot = 'a' then
      update bracket_matches set entrant_a = v_loser where id = v_loss_to;
    else
      update bracket_matches set entrant_b = v_loser where id = v_loss_to;
    end if;
  end if;

  -- Seeding-gate results. The server does NOT recompute standings: duplicating
  -- that math in plpgsql is exactly the drift this design removes. It validates
  -- structurally instead. Two devices offline will submit identical fills
  -- because recordStandings is a total order, so a slot that already holds the
  -- same entrant is success, not a conflict.
  for v_fill in select * from jsonb_array_elements(p_slot_fills) loop
    if (v_fill->>'entrantId')::uuid not in (
      select id from tournament_entrants where tournament_id = v_tournament_id) then
      raise exception 'Slot fill references an entrant from another tournament';
    end if;
    if not exists (select 1 from bracket_matches
                   where id = (v_fill->>'matchId')::uuid and tournament_id = v_tournament_id) then
      raise exception 'Slot fill references a match outside this tournament';
    end if;

    if v_fill->>'slot' = 'a' then
      select entrant_a into v_current from bracket_matches where id = (v_fill->>'matchId')::uuid;
    else
      select entrant_b into v_current from bracket_matches where id = (v_fill->>'matchId')::uuid;
    end if;

    if v_current is not null and v_current is distinct from (v_fill->>'entrantId')::uuid then
      raise exception 'Slot already filled by a different entrant';
    end if;

    if v_current is null then
      if v_fill->>'slot' = 'a' then
        update bracket_matches set entrant_a = (v_fill->>'entrantId')::uuid
          where id = (v_fill->>'matchId')::uuid;
      else
        update bracket_matches set entrant_b = (v_fill->>'entrantId')::uuid
          where id = (v_fill->>'matchId')::uuid;
      end if;
    end if;
  end loop;

  -- Done is now "this match had nowhere to send its winner", which the backfill
  -- already made true of every existing final. Replaces round = max(round).
  if v_win_to is null and not exists (
    select 1 from bracket_matches
    where tournament_id = v_tournament_id and winner_entrant is null
      and win_to_match_id is null and id <> p_bracket_match_id
  ) then
    update tournaments set status = 'done' where id = v_tournament_id;
    return;
  end if;

  update tournaments set status = 'live' where id = v_tournament_id;
end $$;

-- Replaces 0012's version. Its authorisation check and every guard are carried
-- over verbatim; the size check becomes format-aware and routing is validated.
create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_bracket jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_status text;
  v_type text;
  v_format text;
  v_entrants int;
  v_players int;
  v_draw int;
  v_size int;
begin
  select club_id, status, match_type, coalesce(format, 'single_elim')
    into v_club, v_status, v_type, v_format
  from tournaments where id = p_tournament_id;

  if v_club is null then
    raise exception 'Tournament not found';
  end if;
  if not (is_club_admin(v_club) or is_tournament_admin(p_tournament_id)) then
    raise exception 'Only an admin can start this tournament';
  end if;
  if v_status <> 'draft' then
    raise exception 'This tournament has already started';
  end if;
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

  -- Format-aware payload size. single_elim keeps 0012's exact expression so its
  -- behaviour is unchanged; the others are checked by range rather than by
  -- re-deriving each generator's math, which is the duplication this design
  -- removes.
  if v_format = 'single_elim' then
    if jsonb_array_length(p_bracket) <> v_draw - 1 then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_draw;
  elsif v_format = 'round_robin' then
    if jsonb_array_length(p_bracket) <> (v_entrants * (v_entrants - 1)) / 2 then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_entrants;
  elsif v_format = 'double_elim' then
    if jsonb_array_length(p_bracket) <> 2 * v_draw - 2 then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_draw;
  elsif v_format = 'groups_knockout' then
    if jsonb_array_length(p_bracket) < v_entrants
       or jsonb_array_length(p_bracket) > v_entrants * v_entrants then
      raise exception 'Bracket does not match the draw size';
    end if;
    v_size := v_draw;
  else
    raise exception 'Unknown tournament format';
  end if;

  -- Every non-null entrant id in the payload must belong to this tournament.
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

  -- Structural validation of the routing graph. The server no longer re-derives
  -- format math; it checks that every edge lands inside this payload and that
  -- nothing points at itself.
  if exists (
    select 1
    from jsonb_array_elements(p_bracket) e
    cross join lateral (values (e->>'win_to_match_id'), (e->>'loss_to_match_id')) as t(target)
    where t.target is not null
      and (t.target = e->>'id'
           or t.target not in (select x->>'id' from jsonb_array_elements(p_bracket) x))
  ) then
    raise exception 'Bracket routing references a match outside this tournament';
  end if;

  insert into bracket_matches (
    id, tournament_id, round, idx, match_id, entrant_a, entrant_b, winner_entrant,
    court, scored_by, win_to_match_id, win_to_slot, loss_to_match_id, loss_to_slot,
    group_idx, src_a, src_b)
  select
    (e->>'id')::uuid, p_tournament_id, (e->>'round')::int, (e->>'idx')::int,
    null, (e->>'entrant_a')::uuid, (e->>'entrant_b')::uuid,
    (e->>'winner_entrant')::uuid, null, null,
    (e->>'win_to_match_id')::uuid, e->>'win_to_slot',
    (e->>'loss_to_match_id')::uuid, e->>'loss_to_slot',
    (e->>'group_idx')::int, e->>'src_a', e->>'src_b'
  from jsonb_array_elements(p_bracket) e;

  update tournaments set size = v_size, status = 'live' where id = p_tournament_id;
end;
$$;
