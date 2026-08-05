-- Anonymous (guest) sessions use the `authenticated` role, so every RLS
-- policy scoped to `authenticated` implicitly applied to them too. Guest
-- mode only needs the tournament_spectator_view RPC (security definer,
-- bypasses RLS) and the local-only matches table (never synced). These four
-- policies were written before anonymous auth existed and unintentionally
-- gave a zero-friction anon session real-account capabilities: creating a
-- club (and becoming its owner/admin), and reading every user's profile and
-- every tournament's staff roster. Restrict them to real (non-anonymous)
-- accounts; nothing changes for signed-up users.

drop policy if exists "anyone can create a club" on public.clubs;
create policy "anyone can create a club"
  on public.clubs for insert to authenticated
  with check (created_by = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

drop policy if exists "creator becomes owner" on public.club_members;
create policy "creator becomes owner"
  on public.club_members for insert to authenticated
  with check (profile_id = auth.uid() and role = 'owner'
              and (select created_by from clubs where id = club_id) = auth.uid()
              and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated
  using (coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

drop policy if exists "staff reads staff" on public.tournament_staff;
create policy "staff reads staff" on public.tournament_staff
  for select to authenticated using (coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);
