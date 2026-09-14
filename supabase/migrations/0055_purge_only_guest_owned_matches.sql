-- The 30-day purge deleted the matches it was supposed to rescue.
--
-- 0044 scheduled an unconditional delete:
--
--   delete from public.guest_matches
--   where created_at < now() - interval '30 days'
--
-- Nothing in it asks who owns the row. But app/guest/save.tsx promises the
-- opposite — "Guest matches are deleted after 30 days. Add an email and
-- password and everything you have scored stays" — and guestUpgradeRepo
-- deliberately performs no data migration, on the reasoning that keeping the
-- same auth.users.id is enough to keep the history. It keeps the rows VISIBLE;
-- it does not keep them. Thirty days after an upgrade the purge took them
-- anyway, so the one thing guest mode asks people to sign up FOR was never
-- delivered. Nothing catches this in testing: the rows are always young.
--
-- The fix is to purge only rows still owned by a guest. An account that
-- upgraded keeps its history for good, which is what the screen says.
--
-- guest_matches.created_by is `references auth.users (id) on delete cascade`
-- (0043), so a row whose owner is gone is already gone — no orphan case.
-- guest_match_events cascades from guest_matches, as before.

-- The predicate reads auth.users.is_anonymous, a GoTrue column rather than one
-- this project owns. Every other migration here tests the JWT claim instead,
-- which a cron job has no access to, so nothing already proves the column is
-- present. If it ever is not, fail the migration rather than install a purge
-- whose WHERE clause silently matches nothing — a purge that quietly stops
-- purging looks exactly like a purge that works.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'is_anonymous'
  ) then
    raise exception
      'auth.users.is_anonymous is missing; 0055 cannot tell a guest from an upgraded account';
  end if;
end $$;

-- cron.schedule upserts by name on pg_cron >= 1.4, but unscheduling first
-- makes the replacement explicit and works either way. Guarded so a database
-- that never ran 0044 (a fresh scratch apply) does not fail here.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-guest-matches') then
    perform cron.unschedule('purge-guest-matches');
  end if;
end $$;

select cron.schedule(
  'purge-guest-matches',
  '17 3 * * *',
  $$ delete from public.guest_matches g
     where g.created_at < now() - interval '30 days'
       and exists (
         select 1 from auth.users u
         where u.id = g.created_by
           and coalesce(u.is_anonymous, false)
       ) $$
);
