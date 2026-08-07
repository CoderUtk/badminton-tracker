-- 0029_usernames.sql
-- A globally unique, human-typeable handle per account. Identity only:
-- no lookup or search surface ships with this.

alter table public.profiles add column if not exists username text;

create table if not exists public.username_history (
  username text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  released_at timestamptz not null default now()
);

create index if not exists username_history_released
  on public.username_history (released_at);

-- No policies: writes go only through set_username, and no client reads this
-- table. RLS with zero policies denies everything to authenticated, while the
-- security-definer RPC bypasses it.
alter table public.username_history enable row level security;

-- Shared validator so the trigger, the backfill, and set_username cannot drift.
create or replace function public.is_valid_username(p text)
returns boolean language sql immutable as $$
  select p is not null
     and p ~ '^[a-z0-9](?:[a-z0-9_]{1,18})[a-z0-9]$'
     and p not in (
       'admin','administrator','support','help','root',
       'system','moderator','official','badminton','null','undefined'
     );
$$;

-- Derive a legal, unused handle from an arbitrary seed. Used by the backfill
-- and by the new-user trigger, neither of which can ask the user to pick.
create or replace function public.generate_username(p_seed text)
returns text language plpgsql security definer set search_path = public as $$
declare v_base text; v_candidate text; v_n int := 0;
begin
  v_base := lower(coalesce(p_seed, ''));
  v_base := regexp_replace(v_base, '[^a-z0-9_]', '', 'g');
  v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
  v_base := left(v_base, 15);
  if length(v_base) < 3 then
    v_base := 'player';
  end if;

  v_candidate := v_base;
  while exists (select 1 from profiles where username = v_candidate)
     or exists (select 1 from username_history where username = v_candidate)
     or not is_valid_username(v_candidate) loop
    v_n := v_n + 1;
    v_candidate := left(v_base, 20 - length(v_n::text)) || v_n::text;
  end loop;
  return v_candidate;
end $$;

-- Backfill every existing account. Ordered by created_at so the earliest
-- account wins the unsuffixed handle -- arbitrary but stable and defensible.
-- Seed is display_name only: deriving a public handle from an email local part
-- would leak the address to anyone who can read profiles.
do $$
declare r record;
begin
  for r in select id, display_name from profiles where username is null order by created_at loop
    update profiles set username = generate_username(nullif(trim(r.display_name), ''))
    where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column username set not null;

create unique index if not exists profiles_username_key on public.profiles (username);

alter table public.profiles
  add constraint profiles_username_valid check (is_valid_username(username));

-- New accounts get a handle at signup, so no account can ever exist without
-- one and onboarding needs no extra screen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  insert into public.profiles (id, display_name, avatar_url, username)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    public.generate_username(nullif(trim(v_name), ''))
  );
  return new;
end $$;

-- The profile screen's update grant is broad (using id = auth.uid()), which
-- would let a client set username directly, skipping the release hold and
-- writing no history row. Close the column at the privilege level so the
-- security-definer RPC below is the only writer. Every other column keeps its
-- table-wide grant, so setDisplayName / completeOnboarding / setProfileDetails
-- / uploadAvatar / removeAvatar are unaffected.
revoke update (username) on public.profiles from authenticated;

create or replace function public.set_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_current text; v_next text; v_holder uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to change your username';
  end if;

  v_next := lower(trim(coalesce(p_username, '')));
  if not is_valid_username(v_next) then
    raise exception 'Usernames are 3-20 characters, using letters, numbers, and underscores';
  end if;

  select username into v_current from profiles where id = v_uid;
  if v_current = v_next then
    return v_next;
  end if;

  if exists (select 1 from profiles where username = v_next) then
    raise exception 'That username is taken';
  end if;

  -- A released handle is held for 30 days; only its previous owner may
  -- re-claim it during the hold. The error text is identical to the
  -- already-taken case so the hold cannot be used to probe past ownership.
  select profile_id into v_holder from username_history
  where username = v_next and released_at > now() - interval '30 days';
  if v_holder is not null and v_holder <> v_uid then
    raise exception 'That username is taken';
  end if;

  insert into username_history (username, profile_id, released_at)
  values (v_current, v_uid, now())
  on conflict (username) do update
    set profile_id = excluded.profile_id, released_at = excluded.released_at;

  -- Claiming a handle clears its history row, so the owner's own re-claim on a
  -- later change is not blocked by their earlier release.
  delete from username_history where username = v_next;

  update profiles set username = v_next where id = v_uid;
  return v_next;
end $$;
