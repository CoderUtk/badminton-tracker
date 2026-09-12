-- 0047_player_rating.sql
-- Wires up club_players.rating (present since 0001_init.sql, never written or
-- read until now) with a standard ELO update, applied once per completed
-- match. See docs/superpowers/specs/2026-09-12-player-rating-design.md.

alter table public.matches add column rated boolean not null default false;

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
    return new;
  end if;

  select avg(rating) into rating_a from public.club_players where id = any(ids_a);
  select avg(rating) into rating_b from public.club_players where id = any(ids_b);

  expected_a := 1 / (1 + power(10, (rating_b - rating_a) / 400));
  actual_a := case when new.winner = 'A' then 1 else 0 end;
  delta := round(k * (actual_a - expected_a));

  update public.club_players set rating = rating + delta where id = any(ids_a);
  update public.club_players set rating = rating - delta where id = any(ids_b);

  new.rated := true;
  return new;
end;
$$;

revoke execute on function public.apply_match_rating() from public, anon, authenticated;

create trigger matches_apply_rating
  before update on public.matches
  for each row
  when (new.status = 'completed' and not old.rated)
  execute function public.apply_match_rating();

create trigger matches_apply_rating_insert
  before insert on public.matches
  for each row
  when (new.status = 'completed')
  execute function public.apply_match_rating();
