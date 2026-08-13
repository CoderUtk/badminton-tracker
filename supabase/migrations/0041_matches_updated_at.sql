-- 0041_matches_updated_at.sql
-- Sync was push-only for matches, so a member who joined an existing club saw
-- an empty leaderboard (the club screen aggregates the LOCAL matches table).
-- The pull added in src/sync/pull.ts pages on a watermark, which needs a column
-- that moves when a row changes -- created_at does not, because a match is
-- inserted while live and updated when it completes.
--
-- Backfill is implicit: existing rows get now() from the default, so the first
-- pull on any device sees every row it is allowed to read. That is intended --
-- a fresh device must receive the whole history once.
alter table public.matches
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function public.touch_updated_at();

-- The pull pages on a keyset over the composite key: rows strictly after
-- (updated_at, id), ordered by (updated_at, id). The index must carry both
-- columns -- `add column ... default now()` above stamps EVERY pre-existing row
-- with the same updated_at, so id is what actually separates them.
create index if not exists matches_updated_at_id on public.matches (updated_at, id);
