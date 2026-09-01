-- 0043_guest_matches.sql
-- The web build runs guest-only (app/_layout.tsx signs every web visitor in
-- anonymously) and has no local SQLite (src/db/db.web.ts). matchRepo.ts writes
-- only to SQLite, so quick match is dead on web. These two tables give the web
-- repo (src/repos/matchRepo.web.ts) a home for guest quick matches, scoped by
-- RLS to the anonymous user that created them.
--
-- Additive only: public.matches, its policies, and native sync are untouched.
-- Migration 0018 recorded that guest matches were "local-only ... never synced";
-- that stays true for native. This is a web-only path over separate tables.

create table public.guest_matches (
  id            uuid primary key,
  config        jsonb not null,
  side_a        jsonb not null,   -- [{club_player_id: null, name}]
  side_b        jsonb not null,
  status        text not null default 'live'
                  check (status in ('live', 'completed', 'forfeited')),
  winner        text check (winner in ('A', 'B')),
  score_summary jsonb,            -- denormalised from replay() for list rendering
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- Bound anon-owned writes: RLS holds but any visitor can insert rows.
  check (pg_column_size(config) < 8192),
  check (pg_column_size(side_a) < 4096),
  check (pg_column_size(side_b) < 4096)
);

create table public.guest_match_events (
  match_id   uuid not null references public.guest_matches (id) on delete cascade,
  seq        int not null,
  event      jsonb not null,
  created_at timestamptz not null default now(),
  check (seq >= 0 and seq < 5000),
  check (pg_column_size(event) < 4096),
  primary key (match_id, seq)
);

create index guest_matches_owner
  on public.guest_matches (created_by, created_at desc);

alter table public.guest_matches      enable row level security;
alter table public.guest_match_events enable row level security;

-- Owner-only, every verb. DELETE on events is required: undo physically
-- removes rows (matchRepo.web.ts removeEventsAfter).
create policy "own guest matches"
  on public.guest_matches for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "own guest match events"
  on public.guest_match_events for all to authenticated
  using (exists (
    select 1 from public.guest_matches m
    where m.id = guest_match_events.match_id and m.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.guest_matches m
    where m.id = guest_match_events.match_id and m.created_by = auth.uid()
  ));
