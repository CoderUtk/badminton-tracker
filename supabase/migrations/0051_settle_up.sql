-- 0051_settle_up.sql
-- Settle-up: give a player a one-tap way to pay their share, and nudge the
-- ones who have not.
--
-- Deep links only. Nothing here processes a payment, holds funds, or sees a
-- transaction — the app hands the OS a upi:// intent and the banking app does
-- the rest. That is the whole reason this is a small feature and not a
-- compliance project.

-- ---- payee handle ----

-- A UPI VPA is a payment identifier: publishing one invites unsolicited
-- collect requests. It therefore does NOT go on profiles, whose SELECT policy
-- is `using (true)` — every authenticated user can read every profile row.
-- Separate table, no SELECT policy at all, read only through the RPC below.
create table if not exists public.payee_handles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  upi_id     text not null check (upi_id ~ '^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.]{1,63}$'),
  updated_at timestamptz not null default now()
);

alter table public.payee_handles enable row level security;

-- Owner-only, and deliberately no policy for anyone else: with RLS on and no
-- matching policy, every other read and write is denied.
drop policy if exists "a user reads their own payee handle" on public.payee_handles;
create policy "a user reads their own payee handle"
  on public.payee_handles for select to authenticated
  using (auth.uid() = profile_id);

drop policy if exists "a user writes their own payee handle" on public.payee_handles;
create policy "a user writes their own payee handle"
  on public.payee_handles for insert to authenticated
  with check (
    auth.uid() = profile_id
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );

drop policy if exists "a user updates their own payee handle" on public.payee_handles;
create policy "a user updates their own payee handle"
  on public.payee_handles for update to authenticated
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "a user removes their own payee handle" on public.payee_handles;
create policy "a user removes their own payee handle"
  on public.payee_handles for delete to authenticated
  using (auth.uid() = profile_id);

-- The one way anyone else learns a handle: they are checked in to a session
-- that this person fronted the money for, and therefore owe them.
--
-- Scoped to that session, not to the club: being in a club with someone does
-- not entitle you to their payment details. Returns null rather than raising
-- when there is nothing to pay, so a caller cannot use the error to probe
-- whether a handle exists.
create or replace function public.session_payee_upi(p_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select h.upi_id
    from sessions s
    join club_players payer on payer.id = s.paid_by
    join payee_handles h on h.profile_id = payer.profile_id
   where s.id = p_session_id
     and s.cost_total_cents > 0
     -- The caller must be checked in to this very session, and must still owe.
     and exists (
       select 1
         from attendance a
         join club_players me on me.id = a.club_player_id
        where a.session_id = s.id
          and me.profile_id = auth.uid()
          and a.status = 'in'
          and not a.settled
          and me.id <> s.paid_by
     );
$$;

revoke all on function public.session_payee_upi(uuid) from public, anon;
grant execute on function public.session_payee_upi(uuid) to authenticated;

-- ---- unsettled nudge ----

-- One nudge per session, ever. Stamped here rather than inferred from the
-- clock so a re-run, a schedule change, or a job that overruns its window
-- cannot send a second one.
alter table public.sessions
  add column if not exists settle_nudged_at timestamptz;

create or replace function public.nudge_unsettled_shares()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_owing uuid[];
begin
  for r in
    select s.id, s.club_id, s.location, c.name as club_name
      from sessions s
      join clubs c on c.id = s.club_id
     where s.settle_nudged_at is null
       and s.cost_total_cents > 0
       and s.paid_by is not null
       and s.status <> 'cancelled'
       -- A day after the night, not the same evening: people settle in person.
       and s.starts_at < now() - interval '24 hours'
       -- Bounded lookback so enabling this feature does not nudge every
       -- unsettled session in the history of the database at once.
       and s.starts_at > now() - interval '7 days'
  loop
    select array_agg(cp.profile_id)
      into v_owing
      from attendance a
      join club_players cp on cp.id = a.club_player_id
     where a.session_id = r.id
       and a.status = 'in'
       and not a.settled
       and cp.id <> (select paid_by from sessions where id = r.id)
       and cp.profile_id is not null;

    -- Stamped whether or not anyone was owing, so a fully settled session is
    -- passed over once and never reconsidered.
    update sessions set settle_nudged_at = now() where id = r.id;

    if v_owing is not null then
      perform push_to(
        v_owing,
        coalesce(r.club_name, 'CourtSide'),
        'Your share of '
          || coalesce(nullif(btrim(r.location), ''), 'the last session')
          || ' is still unsettled.',
        jsonb_build_object('type', 'session', 'sessionId', r.id));
    end if;
  end loop;
end $$;

-- Writes sessions and reads every club's attendance. Trigger/cron only.
revoke execute on function public.nudge_unsettled_shares()
  from public, anon, authenticated;

-- Once a day, mid-morning UTC. Nothing here is time-critical and the stamp
-- makes the cadence irrelevant to correctness.
select cron.schedule(
  'nudge-unsettled-shares',
  '41 9 * * *',
  $$ select public.nudge_unsettled_shares() $$
);
