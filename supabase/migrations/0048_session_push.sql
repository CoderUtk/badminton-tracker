-- 0048_session_push.sql
-- Server push for the session lifecycle: a new club night is scheduled, and
-- someone checks in for one.
--
-- Same shape as 0035: trigger -> push_to() -> pg_net -> Expo. No outbox, no
-- cron, no edge function. Both functions swallow their own errors so a push
-- failure can never abort the insert that triggered it — scheduling a session
-- must succeed on a database with no pg_net reachability.

-- ---- new session ----

-- Deliberately no time in the body. starts_at is timestamptz and neither clubs
-- nor profiles carry a timezone, so any server-side formatting would render in
-- the database's zone and be wrong for most members. The tap opens the session
-- screen, which formats in the device locale (sessions/[id].tsx).
create or replace function public.notify_session_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club    text;
  v_members uuid[];
begin
  -- A session created in the past is a backfill, not an invitation.
  if new.starts_at <= now() then return new; end if;
  if new.status <> 'scheduled' then return new; end if;

  select name into v_club from clubs where id = new.club_id;

  -- Members only. Open-join players get a club_players row and no
  -- club_members row (0046), so a link holder is never notified about the
  -- club's other nights — the link grants one session, not a subscription.
  select array_agg(profile_id)
    into v_members
    from club_members
   where club_id = new.club_id
     and profile_id <> new.created_by;

  if v_members is null then return new; end if;

  perform push_to(
    v_members,
    coalesce(v_club, 'Club night'),
    'New session'
      || coalesce(' at ' || nullif(btrim(new.location), ''), '')
      || '. Tap to check in.',
    jsonb_build_object('type', 'session', 'sessionId', new.id));

  return new;
exception when others then return new;
end $$;

drop trigger if exists sessions_notify on public.sessions;
create trigger sessions_notify
  after insert on public.sessions
  for each row execute function public.notify_session_created();

-- ---- check-in ----

-- Only the organiser is notified, not the whole roster: a 20-player club night
-- would otherwise generate 380 pushes as it fills. The organiser is the one
-- person whose next action depends on the head count.
create or replace function public.notify_attendance_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_organiser uuid;
  v_starts_at timestamptz;
  v_joiner    uuid;
begin
  if new.status <> 'in' then return new; end if;

  select s.created_by, s.starts_at
    into v_organiser, v_starts_at
    from sessions s
   where s.id = new.session_id;

  -- Nothing to act on once the night has started or passed.
  if v_organiser is null or v_starts_at <= now() then return new; end if;

  select cp.name, cp.profile_id
    into v_name, v_joiner
    from club_players cp
   where cp.id = new.club_player_id;

  -- The organiser checking themselves (or a guest they added) in is not news.
  if v_joiner is not distinct from v_organiser then return new; end if;

  perform push_to(
    array[v_organiser],
    'Check-in',
    coalesce(v_name, 'Someone') || ' is in.',
    jsonb_build_object('type', 'session', 'sessionId', new.session_id));

  return new;
exception when others then return new;
end $$;

-- Insert only. A player flipping maybe -> in later is an update, and firing on
-- that would let anyone spam the organiser by toggling their own row.
drop trigger if exists attendance_notify on public.attendance;
create trigger attendance_notify
  after insert on public.attendance
  for each row execute function public.notify_attendance_in();
