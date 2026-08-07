-- 0031_handle_new_user_restore.sql
--
-- AUTHORITATIVE handle_new_user(). This function (the security-definer
-- trigger backing on_auth_user_created on auth.users) has been rewritten
-- from scratch three times, each time silently dropping an earlier fix.
-- Before touching it again, read every migration below in full -- do not
-- rewrite this function from a partial memory of what it should do.
--
-- History of every migration that has defined this function:
--   0001 (0001_init.sql)                     -- original: insert into profiles only.
--   0010 (0010_personal_clubs.sql)            -- added the Personal club + owner
--                                                 club_members insert so every
--                                                 account has a club_id for
--                                                 standalone tournaments.
--   0019 (0019_anon_profile_trigger_fix.sql)  -- fixed a 500 on anonymous sign-in:
--                                                 coalesce(new.email, '') before
--                                                 split_part, since anon accounts
--                                                 have a null email. Accidentally
--                                                 reverted to the pre-0010 body,
--                                                 dropping the club inserts.
--   0020 (0020_restore_personal_club_creation.sql) -- restored 0010's club/member
--                                                 inserts on top of 0019's coalesce
--                                                 fix, plus a backfill for accounts
--                                                 created in the 0019 gap.
--   0029 (0029_usernames.sql)                 -- added the username column and
--                                                 seeded it at signup via
--                                                 generate_username(). Rewritten
--                                                 from the 0001 body: dropped both
--                                                 the club inserts (0020) and the
--                                                 coalesce (0019).
--   0030 (0030_usernames_fixes.sql)           -- added a bounded retry around the
--                                                 profile insert to survive a
--                                                 username collision. Still missing
--                                                 the club inserts and the coalesce.
--
-- This migration (0031) restores 0020's club/member inserts and 0019's
-- coalesce, keeps 0029/0030's username seeding, and keeps 0030's retry --
-- but scopes the retry to the profiles insert only (see comment below).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_club uuid;
  v_attempt int := 0;
  v_max_attempts constant int := 5;
begin
  -- 0019: anonymous sign-ins have a null email; coalesce first so split_part
  -- never returns null (which would bypass display_name's column default and
  -- violate its not-null constraint, aborting signInAnonymously() with a 500).
  -- The username seed derives from the same v_name, so the coalesce protects
  -- both.
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1));

  -- Only the profiles insert is retried: generate_username's check-then-act
  -- race (0030) can only collide on the username unique index, which this
  -- insert alone can hit. The club/member inserts below are deliberately
  -- outside this loop -- retrying them on their own unique_violation (e.g. a
  -- club_members primary-key conflict) would re-run the profile insert too,
  -- burning attempts against v_max_attempts for a collision that has nothing
  -- to do with usernames.
  loop
    begin
      insert into public.profiles (id, display_name, avatar_url, username)
      values (
        new.id,
        v_name,
        new.raw_user_meta_data ->> 'avatar_url',
        public.generate_username(nullif(trim(v_name), ''))
      );
      exit;
    exception
      when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= v_max_attempts then
          raise;
        end if;
        -- Loop again: generate_username re-checks profiles/username_history
        -- and will pick a different candidate now that the collision is
        -- visible to it.
    end;
  end loop;

  -- 0010 / 0020: every account needs a Personal club so standalone
  -- tournaments (tournaments.club_id is not null) always have somewhere to
  -- attach to.
  insert into public.clubs (name, created_by, personal)
  values ('Personal', new.id, true)
  returning id into v_club;

  insert into public.club_members (club_id, profile_id, role)
  values (v_club, new.id, 'owner');

  return new;
end $$;

-- Backfill: any account created since 0029 landed has a profile and a
-- username but no personal club, because 0029/0030's handle_new_user did not
-- create one. Modeled on 0020's backfill.
do $$
declare
  p record;
  v_club uuid;
begin
  for p in
    select pr.id from public.profiles pr
    where not exists (
      select 1 from public.clubs c
      where c.created_by = pr.id and c.personal
    )
  loop
    insert into public.clubs (name, created_by, personal)
    values ('Personal', p.id, true)
    returning id into v_club;
    insert into public.club_members (club_id, profile_id, role)
    values (v_club, p.id, 'owner')
    on conflict do nothing;
  end loop;
end $$;

-- 0029 never granted execute on set_username; every other client-callable
-- RPC in this repo does (see 0017, 0021, 0023, 0025, 0028). Postgres's
-- default EXECUTE TO PUBLIC likely made this work anyway, but the missing
-- grant breaks the convention and the failure mode is total, so make it
-- explicit.
grant execute on function public.set_username(text) to authenticated;
