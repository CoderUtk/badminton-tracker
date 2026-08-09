-- 0035_push_notifications.sql
-- Push for the two events where another person is waiting on the user:
-- a friend request, and a club join request.
--
-- Delivery is a trigger calling the Expo push API directly through pg_net.
-- There is deliberately no outbox, no cron and no edge function: this is not
-- a critical feature and the design optimises for zero standing infrastructure.
-- The cost is that nothing polls Expo's receipts endpoint, so dead tokens are
-- never reported back. They are aged out instead — see the 60-day filter in
-- push_to() — which is what removes the need for any cleanup job.

create extension if not exists pg_net;

create table if not exists public.push_tokens (
  token       text primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);

-- token is the primary key, not a surrogate id: when a device switches
-- accounts the upsert overwrites profile_id in place. With a surrogate key the
-- old row would survive and the previous user's friend requests would keep
-- arriving on a phone they no longer own.

create index if not exists push_tokens_profile
  on public.push_tokens (profile_id, updated_at desc);

alter table public.push_tokens enable row level security;

create policy "a user reads their own tokens"
  on public.push_tokens for select to authenticated
  using (auth.uid() = profile_id);

create policy "a user registers their own token"
  on public.push_tokens for insert to authenticated
  with check (
    auth.uid() = profile_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

create policy "a user refreshes their own token"
  on public.push_tokens for update to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "a user removes their own token"
  on public.push_tokens for delete to authenticated
  using (auth.uid() = profile_id);

-- ---- send helper ----

create or replace function public.push_to(
  p_profile_ids uuid[],
  p_title       text,
  p_body        text,
  p_data        jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', p_title,
           'body', p_body,
           'data', p_data,
           'sound', 'default',
           'channelId', 'default'))
    into v_messages
    from push_tokens t
   where t.profile_id = any (p_profile_ids)
     and t.updated_at > now() - interval '60 days';

  if v_messages is null then return; end if;

  -- Fire-and-forget: pg_net queues the request and returns immediately, so the
  -- calling transaction never blocks on network latency.
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := v_messages);
end $$;

-- SECURITY DEFINER and it reads every user's tokens. Only triggers may call it.
revoke execute on function public.push_to(uuid[], text, text, jsonb)
  from public, anon, authenticated;

-- ---- friend request ----

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  if new.status <> 'pending' then return new; end if;

  select coalesce(display_name, username, 'Someone')
    into v_name
    from profiles
   where id = new.requester_id;

  perform push_to(
    array[new.addressee_id],
    'Friend request',
    v_name || ' wants to be friends.',
    jsonb_build_object('type', 'friend_request'));

  return new;
exception when others then return new;
end $$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert on public.friendships
  for each row execute function public.notify_friend_request();

-- ---- club join request ----

create or replace function public.notify_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_club   text;
  v_admins uuid[];
begin
  if new.status <> 'pending' then return new; end if;

  select coalesce(display_name, username, 'Someone')
    into v_name
    from profiles
   where id = new.profile_id;

  select name into v_club from clubs where id = new.club_id;

  -- is_club_admin() cannot be reused here: it is auth.uid()-based and answers
  -- "am I an admin", not "who are the admins".
  select array_agg(profile_id)
    into v_admins
    from club_members
   where club_id = new.club_id
     and role in ('owner', 'admin')
     and profile_id <> new.profile_id;

  if v_admins is null then return new; end if;

  perform push_to(
    v_admins,
    'Join request',
    v_name || ' wants to join ' || coalesce(v_club, 'your club') || '.',
    jsonb_build_object('type', 'join_request', 'clubId', new.club_id));

  return new;
exception when others then return new;
end $$;

-- request_club_join() only inserts on the pending path (an existing pending row
-- short-circuits, a denied row raises), so after-insert covers every case and
-- no update trigger is needed.
drop trigger if exists club_join_requests_notify on public.club_join_requests;
create trigger club_join_requests_notify
  after insert on public.club_join_requests
  for each row execute function public.notify_join_request();
