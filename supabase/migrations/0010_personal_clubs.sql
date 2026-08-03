-- Every user gets one hidden club that owns their standalone tournaments.
-- This keeps tournaments.club_id NOT NULL and leaves every existing RLS
-- policy, club_players row, and match insert working untouched, while the UI
-- never shows a club.
alter table public.clubs add column if not exists personal boolean not null default false;

-- Extend the signup trigger. handle_new_user is already security definer, so
-- RLS does not block these inserts. The profile row must exist first:
-- clubs.created_by references profiles (id).
-- The profiles insert is copied verbatim from 0001_init.sql:14-19, which is
-- still the live definition (0003 only mentions the trigger in a comment).
-- It must not change: it prefills display_name from the provider's full_name
-- and carries avatar_url across, and a simplified version would silently lose
-- both for every Google sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.clubs (name, created_by, personal)
  values ('Personal', new.id, true)
  returning id into v_club;

  insert into public.club_members (club_id, profile_id, role)
  values (v_club, new.id, 'owner');

  return new;
end $$;

-- Backfill. The trigger only helps accounts created after this migration;
-- without this, every existing user has no personal club and standalone
-- tournament creation fails outright for them.
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
