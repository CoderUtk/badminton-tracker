-- 0050_recurring_sessions.sql
-- Weekly club nights. An organiser retyping the same Thursday 7pm, same
-- venue, same court count every week is the highest-leverage friction in the
-- app: if the organiser stops creating sessions, the whole club churns at
-- once.
--
-- Modelled as a self-perpetuating flag rather than a templates table. Each
-- occurrence carries repeat_weekly, and the materialiser clones the one that
-- just finished into next week. No second entity to keep in sync with the
-- session it generates, and an organiser edits the next occurrence the same
-- way they edit any session.

alter table public.sessions
  add column if not exists repeat_weekly boolean not null default false;

-- Only the creator or a club admin may set it, same rule and same reason as
-- set_session_open_join (0046): the sessions UPDATE policy is admin-only, so a
-- non-admin creator cannot write the column directly.
create or replace function public.set_session_repeat(
  p_session_id uuid,
  p_repeat boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_session(p_session_id) then
    raise exception 'Only the session creator or a club admin can repeat this session';
  end if;
  update sessions set repeat_weekly = coalesce(p_repeat, false) where id = p_session_id;
end $$;

-- ---- materialiser ----

-- Clones every repeating session that finished in the last day into the same
-- weekday and time next week.
--
-- Stops the series when the occurrence that just passed had zero check-ins.
-- Without that, a club that quietly dies keeps generating sessions forever,
-- and each one fires the 0048 push at members who stopped playing months ago.
-- Turning the toggle back on restarts it.
create or replace function public.materialise_weekly_sessions()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into sessions (club_id, starts_at, ends_at, location, courts,
                        created_by, repeat_weekly)
  select s.club_id,
         s.starts_at + interval '7 days',
         s.ends_at + interval '7 days',
         s.location,
         s.courts,
         s.created_by,
         true
    from sessions s
   where s.repeat_weekly
     and s.status <> 'cancelled'
     and s.starts_at <= now()
     and s.starts_at > now() - interval '1 day'
     and exists (select 1 from attendance a
                  where a.session_id = s.id and a.status = 'in')
     -- Idempotent: a second run in the same day, or a manually created
     -- session already sitting at that slot, inserts nothing.
     and not exists (select 1 from sessions n
                      where n.club_id = s.club_id
                        and n.starts_at = s.starts_at + interval '7 days');
end $$;

-- Never called by a client: it writes sessions for every club in the
-- database. Same posture as push_to() in 0035.
revoke execute on function public.materialise_weekly_sessions()
  from public, anon, authenticated;

-- Hourly, not daily. The window above is 24 hours wide and the guard is an
-- exact-slot check, so re-running is free — and an hourly cadence means the
-- next occurrence appears the morning after the last one rather than up to a
-- day later. Requires pg_cron (already enabled for purge-guest-matches, 0044).
select cron.schedule(
  'materialise-weekly-sessions',
  '23 * * * *',
  $$ select public.materialise_weekly_sessions() $$
);
