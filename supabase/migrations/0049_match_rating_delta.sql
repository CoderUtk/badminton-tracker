-- 0049_match_rating_delta.sql
-- 0047 applied an ELO delta and threw it away: club_players.rating moved and
-- nothing recorded by how much, so the app could show a rating but never a
-- rating *change*. This persists the delta on the match that caused it.
--
-- The value is the delta applied to side A. Side B's is its negation — storing
-- one signed number rather than a per-player map keeps this a single column,
-- and the client already knows which side it played on.
--
-- Deliberately NOT added to the offline sync pipeline (MATCH_COLS /
-- pull.ts / the local matches table). The delta is computed server-side after
-- the match syncs up, so it can never be present at the moment a device
-- finishes a match; the post-match screen reads it with a live query instead.

alter table public.matches add column if not exists rating_delta int;

-- Whole-function replacement of 0047's apply_match_rating. Only two lines
-- differ (the two `new.rating_delta :=` assignments); the rest is 0047 verbatim
-- so the two versions stay diffable.
create or replace function public.apply_match_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k constant numeric := 32;
  ids_a uuid[];
  ids_b uuid[];
  rating_a numeric;
  rating_b numeric;
  expected_a numeric;
  actual_a numeric;
  delta numeric;
begin
  if new.status <> 'completed' or new.winner is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.rated then
    return new;
  end if;

  select array_agg((p->>'club_player_id')::uuid) into ids_a
    from jsonb_array_elements(new.side_a) p;
  select array_agg((p->>'club_player_id')::uuid) into ids_b
    from jsonb_array_elements(new.side_b) p;

  -- Guest/quick matches or any side missing a club_player_id can't be rated.
  if ids_a is null or ids_b is null
     or array_length(ids_a, 1) is null or array_length(ids_b, 1) is null
     or array_position(ids_a, null) is not null
     or array_position(ids_b, null) is not null then
    new.rated := true;
    new.rating_delta := null;
    return new;
  end if;

  -- Every cited club_player_id must actually belong to this match's club.
  -- Without this, a security-definer write could rate a stranger's row in
  -- another club, or NULL out of a missing join and abort the match write.
  if exists (
    select 1
      from unnest(ids_a || ids_b) as cited_id
     where not exists (
       select 1 from public.club_players cp
        where cp.id = cited_id and cp.club_id = new.club_id
     )
  ) then
    new.rated := true;
    new.rating_delta := null;
    return new;
  end if;

  select avg(rating) into rating_a from public.club_players where id = any(ids_a);
  select avg(rating) into rating_b from public.club_players where id = any(ids_b);

  expected_a := 1 / (1 + power(10, (rating_b - rating_a) / 400));
  actual_a := case when new.winner = 'A' then 1 else 0 end;
  delta := round(k * (actual_a - expected_a));

  update public.club_players
     set rating = rating + case when id = any(ids_a) then delta else -delta end
   where id = any(ids_a) or id = any(ids_b);

  new.rated := true;
  new.rating_delta := delta::int;
  return new;
end;
$$;

revoke execute on function public.apply_match_rating() from public, anon, authenticated;
