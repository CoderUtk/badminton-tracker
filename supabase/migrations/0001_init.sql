-- Badminton club tool: initial schema.
-- All PKs are client-generated uuids so offline devices can insert without coordination.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (club_id, profile_id)
);

-- Unifies account holders and guests: every participant in a match/session is a club_player.
create table public.club_players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null,
  rating int not null default 1500,
  created_at timestamptz not null default now(),
  unique (club_id, profile_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  courts int not null default 1 check (courts between 1 and 20),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'done', 'cancelled')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.attendance (
  session_id uuid not null references public.sessions (id) on delete cascade,
  club_player_id uuid not null references public.club_players (id) on delete cascade,
  status text not null default 'in' check (status in ('in', 'out', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (session_id, club_player_id)
);

create table public.matches (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  config jsonb not null,
  side_a jsonb not null, -- [{club_player_id, name}]
  side_b jsonb not null,
  status text not null default 'live' check (status in ('live', 'completed', 'forfeited')),
  winner text check (winner in ('A', 'B')),
  score_summary jsonb, -- denormalized from replay() for cheap list rendering
  created_by uuid not null references public.profiles (id),
  device_id text not null default '',
  created_at timestamptz not null default now()
);

-- Append-only mirror of the engine event log; (match_id, seq) makes pushes idempotent.
create table public.match_events (
  match_id uuid not null references public.matches (id) on delete cascade,
  seq int not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

-- ---- RLS ----

create or replace function public.is_club_member(p_club_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from club_members
    where club_id = p_club_id and profile_id = auth.uid()
  );
$$;

create or replace function public.is_club_admin(p_club_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from club_members
    where club_id = p_club_id and profile_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_players enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "users update own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

create policy "members read their clubs"
  on public.clubs for select to authenticated using (is_club_member(id));
create policy "anyone can create a club"
  on public.clubs for insert to authenticated with check (created_by = auth.uid());
create policy "admins update club"
  on public.clubs for update to authenticated using (is_club_admin(id));

create policy "members read membership"
  on public.club_members for select to authenticated using (is_club_member(club_id));
create policy "creator becomes owner"
  on public.club_members for insert to authenticated
  with check (profile_id = auth.uid() and role = 'owner'
              and (select created_by from clubs where id = club_id) = auth.uid());

create policy "members read players" on public.club_players for select to authenticated using (is_club_member(club_id));
create policy "members add players" on public.club_players for insert to authenticated with check (is_club_member(club_id));
create policy "admins update players" on public.club_players for update to authenticated using (is_club_admin(club_id));

create policy "members read sessions" on public.sessions for select to authenticated using (is_club_member(club_id));
create policy "admins write sessions" on public.sessions for insert to authenticated with check (is_club_admin(club_id));
create policy "admins update sessions" on public.sessions for update to authenticated using (is_club_admin(club_id));

create policy "members read attendance" on public.attendance for select to authenticated
  using (is_club_member((select club_id from sessions where id = session_id)));
create policy "members write attendance" on public.attendance for insert to authenticated
  with check (is_club_member((select club_id from sessions where id = session_id)));
create policy "members update attendance" on public.attendance for update to authenticated
  using (is_club_member((select club_id from sessions where id = session_id)));

create policy "members read matches" on public.matches for select to authenticated using (is_club_member(club_id));
create policy "members create matches" on public.matches for insert to authenticated
  with check (is_club_member(club_id) and created_by = auth.uid());
create policy "creator updates own match" on public.matches for update to authenticated
  using (created_by = auth.uid());

-- match_events: insert + select only. No update/delete policies = log is immutable.
create policy "members read events" on public.match_events for select to authenticated
  using (is_club_member((select club_id from matches where id = match_id)));
create policy "members append events" on public.match_events for insert to authenticated
  with check (is_club_member((select club_id from matches where id = match_id)));

-- Join a club by invite code without exposing codes via SELECT.
create or replace function public.join_club(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_club_id uuid;
begin
  select id into v_club_id from clubs where invite_code = upper(trim(p_invite_code));
  if v_club_id is null then
    raise exception 'Invalid invite code';
  end if;
  insert into club_members (club_id, profile_id, role)
  values (v_club_id, auth.uid(), 'member')
  on conflict do nothing;
  insert into club_players (club_id, profile_id, name)
  select v_club_id, auth.uid(), coalesce(p.display_name, 'Player')
  from profiles p where p.id = auth.uid()
  on conflict (club_id, profile_id) do nothing;
  return v_club_id;
end $$;

-- Create a club and become its owner + first player in one call.
create or replace function public.create_club(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_club_id uuid;
begin
  insert into clubs (name, created_by) values (trim(p_name), auth.uid())
  returning id into v_club_id;
  insert into club_members (club_id, profile_id, role) values (v_club_id, auth.uid(), 'owner');
  insert into club_players (club_id, profile_id, name)
  select v_club_id, auth.uid(), coalesce(p.display_name, 'Player') from profiles p where p.id = auth.uid();
  return v_club_id;
end $$;
