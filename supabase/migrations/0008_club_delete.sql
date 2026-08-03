-- Club deletion. Owners only: deleting a club cascades away every member's
-- match history, which is stronger than "admin" implies. is_club_admin is
-- deliberately NOT used here — it resolves to role in ('owner','admin').
--
-- Without this policy RLS silently matches zero rows and Supabase reports
-- success, so the client believes it deleted a club it did not. That is the
-- bug deleteTournament shipped with before 0006 added its policy.
--
-- Child rows (club_members, club_players, sessions, matches, tournaments)
-- already cascade via "on delete cascade" in 0001_init.sql / 0002_tournaments.sql.
create policy "owners delete clubs" on public.clubs for delete to authenticated
  using (exists (
    select 1 from club_members
    where club_id = clubs.id and profile_id = auth.uid() and role = 'owner'
  ));
