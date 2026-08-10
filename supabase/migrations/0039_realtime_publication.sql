-- Records the supabase_realtime publication membership in source control.
--
-- Until now this existed only as dashboard state: no migration in this repo ever
-- touched the publication, yet three features depend on it —
--   src/stores/matchStore.ts          subscribes to match_events INSERTs
--   app/(app)/clubs/[id]/live.tsx     subscribes to matches, filtered by club_id
--   app/(app)/watch/[matchId].tsx     live match spectating
-- A project rebuilt from these migrations alone would have had silently
-- non-functional realtime: subscriptions connect successfully and simply never
-- fire.
--
-- Current production membership (confirmed 2026-08-09): public.matches and
-- public.match_events. This migration reproduces exactly that and adds nothing
-- else — a publication is a live replication stream, so adding a table here has
-- an ongoing WAL cost and must be a deliberate choice, never a convenience.
--
-- Guarded per table rather than using a bare `alter publication ... add table`,
-- which errors when the table is already a member. Against the current
-- production database every branch below is skipped and this migration is a
-- no-op; on a fresh project it does the real work.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end
$$;

-- Deliberately NOT set here: replica identity.
--
-- `onLiveMatchesChange` (src/realtime/supabaseBackend.ts) subscribes to matches
-- with event '*' and filter club_id=eq.<id>. For INSERT and UPDATE the new row
-- carries every column, so the filter works. For DELETE, only the replica
-- identity columns are present — and matches' replica identity is its primary
-- key (id), which does not include club_id, so a DELETE may not match the
-- filter and the subscriber can miss it.
--
-- In practice that callback only refetches the live list, so a missed DELETE
-- leaves a finished match on the club's live screen until the next event
-- arrives. `replica identity full` would fix it by writing every column of
-- every row to the WAL, which is a permanent write-amplification cost on the
-- app's fastest-growing table to correct a transient display artefact.
--
-- Not worth it on current evidence, and changing it would be a behaviour change
-- rather than the faithful record of existing state this migration is for. If
-- stale live-match rows are ever reported, revisit here.
