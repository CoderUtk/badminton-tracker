-- Courts available to a tournament. The live-ops screen hardcoded ["1","2","3","4"];
-- default 4 so tournaments created before this migration keep exactly that
-- behaviour rather than silently losing court buttons.
alter table public.tournaments add column if not exists courts integer not null default 4;

-- Tighten the update policy. 0002 granted UPDATE to any club member, so any
-- member could rename or reconfigure any tournament. Nothing reached it while
-- there was no edit UI; the edit screen makes it reachable, so restrict it to
-- admins now.
drop policy if exists "members update tournaments" on public.tournaments;
create policy "admins update tournaments" on public.tournaments for update to authenticated
  using (is_club_admin(club_id));
