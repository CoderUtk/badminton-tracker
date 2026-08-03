-- supabase/migrations/0005_tournament_live_ops.sql

create table if not exists public.tournament_join_requests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (tournament_id, profile_id)
);

create index if not exists tournament_join_requests_tournament_status
  on public.tournament_join_requests (tournament_id, status);

create table if not exists public.tournament_staff (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'scorer')),
  created_at timestamptz not null default now(),
  unique (tournament_id, profile_id)
);

alter table public.tournament_join_requests enable row level security;
alter table public.tournament_staff enable row level security;

-- Admin and Staff RLS policies
create policy "admins read tournament queue" on public.tournament_join_requests
  for select to authenticated using (exists(select 1 from tournament_staff where tournament_id = tournament_join_requests.tournament_id and profile_id = auth.uid() and role = 'admin'));

create policy "requester reads own request" on public.tournament_join_requests
  for select to authenticated using (profile_id = auth.uid());

create policy "staff reads staff" on public.tournament_staff
  for select to authenticated using (true);

-- RPCs
create or replace function public.tournament_preview(p_tournament_id uuid)
returns table (id uuid, name text, max_entrants int, entrant_count int)
language sql security definer stable set search_path = public as $$
  select t.id, t.name, t.size as max_entrants, (select count(*)::int from tournament_entrants e where e.tournament_id = t.id)
  from tournaments t where t.id = p_tournament_id;
$$;

create or replace function public.request_tournament_join(p_tournament_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from tournaments where id = p_tournament_id) then
    raise exception 'Tournament not found';
  end if;
  -- If already an entrant
  if exists (select 1 from tournament_entrants e inner join club_players p on e.club_player_id = p.id where e.tournament_id = p_tournament_id and p.profile_id = auth.uid()) then
    return 'member';
  end if;

  select status into v_status
  from tournament_join_requests where tournament_id = p_tournament_id and profile_id = auth.uid();
  if v_status = 'denied' then return 'denied'; end if;
  if v_status is null then
    insert into tournament_join_requests (tournament_id, profile_id) values (p_tournament_id, auth.uid());
  end if;
  return 'pending';
end $$;

create or replace function public.approve_tournament_join(p_request_id uuid, p_club_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid;
begin
  select tournament_id into v_tourney_id from tournament_join_requests where id = p_request_id and status = 'pending';
  if v_tourney_id is null then raise exception 'Request not found or decided'; end if;
  if not exists (select 1 from tournament_staff where tournament_id = v_tourney_id and profile_id = auth.uid() and role = 'admin') then
    raise exception 'Only admin can approve';
  end if;
  insert into tournament_entrants (tournament_id, club_player_id) values (v_tourney_id, p_club_player_id) on conflict do nothing;
  update tournament_join_requests set status = 'approved', decided_at = now() where id = p_request_id;
end $$;

create or replace function public.deny_tournament_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tourney_id uuid;
begin
  select tournament_id into v_tourney_id from tournament_join_requests where id = p_request_id and status = 'pending';
  if v_tourney_id is null then raise exception 'Request not found or decided'; end if;
  if not exists (select 1 from tournament_staff where tournament_id = v_tourney_id and profile_id = auth.uid() and role = 'admin') then
    raise exception 'Only admin can deny';
  end if;
  update tournament_join_requests set status = 'denied', decided_at = now() where id = p_request_id;
end $$;

-- Extend bracket_matches for live ops
alter table public.bracket_matches 
add column if not exists court text,
add column if not exists scored_by uuid references public.profiles(id);
