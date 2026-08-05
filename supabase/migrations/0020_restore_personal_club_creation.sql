-- 0019 fixed the anon-guest 500 (null email breaking display_name) but in
-- doing so accidentally reverted handle_new_user() to the pre-0010 version,
-- silently dropping personal-club creation for every new real signup. This
-- restores 0010's personal-club insert while keeping 0019's null-email fix.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.clubs (name, created_by, personal)
  values ('Personal', new.id, true)
  returning id into v_club;

  insert into public.club_members (club_id, profile_id, role)
  values (v_club, new.id, 'owner');

  return new;
end $$;

-- Backfill: any account created between 0019 and this migration landing
-- has a profile but no personal club (0019's version skipped it entirely).
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
