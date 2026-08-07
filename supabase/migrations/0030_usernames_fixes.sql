-- 0030_usernames_fixes.sql
-- Code review fixes for 0029_usernames.sql (already applied to production;
-- 0029 itself is not edited -- both fixes land here instead).

-- ---------------------------------------------------------------------------
-- Fix 1: the column-level revoke in 0029 is a no-op.
--
-- Postgres tracks table-level and column-level ACLs independently. A
-- column-level `revoke update (username) on public.profiles from
-- authenticated` cannot subtract from a table-level UPDATE grant that the
-- role already holds. Supabase's project bootstrap grants `authenticated`
-- table-level UPDATE on public schema tables; the RLS policy
-- "users update own profile" (0001_init.sql) merely restricts which *rows*
-- that already-granted role may touch, it does not itself grant the
-- privilege. So after 0029, `authenticated` could still
-- `PATCH /rest/v1/profiles?id=eq.<self>` with a new `username`, satisfying
-- the unique index and the CHECK constraint while completely bypassing
-- set_username -- no 30-day release hold, no username_history row. That
-- guard is the entire security property this feature exists to deliver.
--
-- The real fix is a table-level revoke, with an explicit column-level
-- re-grant restoring write access to exactly the columns the app writes
-- outside of set_username. Verified against src/repos/profileRepo.ts
-- (displayName / completeOnboarding / setProfileDetails / uploadAvatar /
-- removeAvatar): those touch display_name, display_name_set, age, hand,
-- and avatar_url only. id, created_at, and username become client-write-
-- only through security-definer RPCs (or not at all), which is intended.
revoke update on public.profiles from authenticated;
grant update (display_name, display_name_set, age, hand, avatar_url)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Fix 2: check-then-act race in generate_username.
--
-- generate_username's `while exists(...)` loop picks a candidate with plain
-- SELECTs and no locking. Under read-committed isolation, two concurrent
-- signups deriving the same base (e.g. two blank display names both falling
-- back to 'player') can each observe the same candidate as free and both
-- attempt to claim it. One insert wins; the other hits the
-- profiles_username_key unique violation. Because generate_username is
-- called from handle_new_user, an `after insert on auth.users` trigger,
-- that violation aborts the *entire* signup transaction -- the user sees
-- sign-up fail outright rather than getting a retried handle.
--
-- Fix: make handle_new_user retry the whole insert (which re-derives a
-- fresh candidate via generate_username, since the previous candidate is
-- now taken) on unique_violation, bounded so it cannot spin forever. This
-- keeps the race-detection at the one place that actually enforces
-- uniqueness -- the unique index / insert -- rather than trying to make
-- generate_username's read-then-write race-free on its own, which would
-- require table locking generate_username's callers don't want to pay for.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_attempt int := 0;
  v_max_attempts constant int := 5;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));

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

  return new;
end $$;
