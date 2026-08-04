-- Deleting a user cascades auth.users -> profiles (on delete cascade), but
-- profiles' own deletion then hit these created_by/scored_by FKs with no
-- explicit rule, which Postgres defaults to RESTRICT. Any user who ever
-- created a club, session, or match could not be deleted at all. set null
-- (not cascade) preserves the club/session/match/tournament for everyone
-- else, only orphaning the creator reference — the same choice already made
-- for club_players.profile_id and matches.session_id elsewhere in this schema.

alter table public.clubs alter column created_by drop not null;
alter table public.clubs drop constraint if exists clubs_created_by_fkey;
alter table public.clubs
  add constraint clubs_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.sessions alter column created_by drop not null;
alter table public.sessions drop constraint if exists sessions_created_by_fkey;
alter table public.sessions
  add constraint sessions_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.matches alter column created_by drop not null;
alter table public.matches drop constraint if exists matches_created_by_fkey;
alter table public.matches
  add constraint matches_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.tournaments drop constraint if exists tournaments_created_by_fkey;
alter table public.tournaments
  add constraint tournaments_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.bracket_matches drop constraint if exists bracket_matches_scored_by_fkey;
alter table public.bracket_matches
  add constraint bracket_matches_scored_by_fkey foreign key (scored_by)
  references public.profiles (id) on delete set null;
