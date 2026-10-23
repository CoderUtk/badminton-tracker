-- Supabase stops auto-granting Data API access to NEW public tables on
-- 2026-10-30. Existing prod tables keep their grants, so prod is unaffected --
-- but a fresh project, a preview branch or `supabase db reset` replays these
-- migrations against a database with no default grants, and every table would
-- come back invisible to supabase-js/PostgREST.
--
-- This replays the grants Supabase used to add implicitly, so a replayed
-- schema matches prod exactly. It is not a privilege widening: every table in
-- public has RLS enabled (verified at 0055), and RLS -- not the table grant --
-- is what decides who sees which row.
--
-- NEW TABLES FROM HERE ON: put their grants in their own migration. This loop
-- only covers tables that exist when it runs.
do $$
declare t regclass;
begin
  for t in
    select c.oid::regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format(
      'grant select, insert, update, delete on %s to anon, authenticated, service_role', t);
  end loop;
end $$;
