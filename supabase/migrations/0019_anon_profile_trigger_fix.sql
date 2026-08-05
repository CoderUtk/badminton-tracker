-- Anonymous sign-ins insert an auth.users row with a null email. The
-- on_auth_user_created trigger's coalesce(full_name, split_part(email, '@', 1))
-- then evaluates to null for a guest (split_part(null, '@', 1) is null), which
-- violates profiles.display_name's not-null constraint and rolls back the
-- entire signInAnonymously() call with a 500. Coalesce email to '' first so
-- split_part always returns a string; real signups are unaffected.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;
