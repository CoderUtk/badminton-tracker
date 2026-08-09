-- Postgres does not auto-index foreign key columns (only PKs get that).
-- RLS policies filter on these columns directly (is_club_member(club_id),
-- created_by = auth.uid(), etc), so as row counts grow these become seq
-- scans without an index. matches grows fastest (one row per game).

create index if not exists matches_club_id on public.matches (club_id);
create index if not exists matches_created_by on public.matches (created_by);
create index if not exists sessions_club_id on public.sessions (club_id);
create index if not exists tournaments_club_id on public.tournaments (club_id);
create index if not exists bracket_matches_tournament_id on public.bracket_matches (tournament_id);
create index if not exists tournament_entrants_tournament_id on public.tournament_entrants (tournament_id);
