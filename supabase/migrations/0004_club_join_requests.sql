-- supabase/migrations/0004_club_join_requests.sql
-- Request-to-join by club ID, with owner/admin approval. The existing
-- invite-code path (join_club) is unchanged and still joins instantly.

create table if not exists public.club_join_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (club_id, profile_id)
);

create index if not exists club_join_requests_club_status
  on public.club_join_requests (club_id, status);

alter table public.club_join_requests enable row level security;

-- A requester sees only their own row; admins see their club's whole queue.
drop policy if exists "requester reads own request" on public.club_join_requests;
create policy "requester reads own request" on public.club_join_requests
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists "admins read club queue" on public.club_join_requests;
create policy "admins read club queue" on public.club_join_requests
  for select to authenticated using (is_club_admin(club_id));

-- Writes go exclusively through the security-definer RPCs below, so no
-- insert/update/delete policies are granted to authenticated users.

-- Non-members cannot select from clubs (RLS is is_club_member(id)), so a
-- prospective joiner needs this narrow window to see what they are joining.
create or replace function public.club_preview(p_club_id uuid)
returns table (id uuid, name text, member_count int)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, (select count(*)::int from club_members m where m.club_id = c.id)
  from clubs c where c.id = p_club_id;
$$;

-- Record a pending request. Idempotent: re-requesting reports current state
-- rather than stacking rows (the unique constraint would reject them anyway).
create or replace function public.request_club_join(p_club_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from clubs where id = p_club_id) then
    raise exception 'Club not found';
  end if;
  if is_club_member(p_club_id) then
    return 'member';
  end if;
  select status into v_status
  from club_join_requests where club_id = p_club_id and profile_id = auth.uid();
  if v_status = 'denied' then
    return 'denied';
  end if;
  if v_status is null then
    insert into club_join_requests (club_id, profile_id) values (p_club_id, auth.uid())
    on conflict (club_id, profile_id) do nothing;
  end if;
  return 'pending';
end $$;

-- Approving inserts the real membership + player rows. Mirrors join_club so an
-- approved member is indistinguishable from an invite-code member.
create or replace function public.approve_club_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_club_id uuid; v_profile_id uuid;
begin
  select club_id, profile_id into v_club_id, v_profile_id
  from club_join_requests where id = p_request_id and status = 'pending';
  if v_club_id is null then
    raise exception 'Request not found or already decided';
  end if;
  if not is_club_admin(v_club_id) then
    raise exception 'Only a club admin can approve requests';
  end if;
  insert into club_members (club_id, profile_id, role)
  values (v_club_id, v_profile_id, 'member')
  on conflict do nothing;
  insert into club_players (club_id, profile_id, name)
  select v_club_id, v_profile_id, coalesce(p.display_name, 'Player')
  from profiles p where p.id = v_profile_id
  on conflict (club_id, profile_id) do nothing;
  update club_join_requests
  set status = 'approved', decided_at = now() where id = p_request_id;
end $$;

create or replace function public.deny_club_join(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_club_id uuid;
begin
  select club_id into v_club_id
  from club_join_requests where id = p_request_id and status = 'pending';
  if v_club_id is null then
    raise exception 'Request not found or already decided';
  end if;
  if not is_club_admin(v_club_id) then
    raise exception 'Only a club admin can deny requests';
  end if;
  update club_join_requests
  set status = 'denied', decided_at = now() where id = p_request_id;
end $$;
