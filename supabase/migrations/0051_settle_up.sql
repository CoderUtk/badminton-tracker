-- 0051_settle_up.sql
-- Nudge the people who have not settled their share of a club night.
--
-- splitCost already knows who owes what; what was missing is any prompt at
-- all, so collection stays the organiser chasing six people in a group chat.
-- This is one push, a day later, to the people who still owe.
--
-- An earlier draft of this migration also carried a UPI payment-handle table
-- and a deep-link flow. That was dropped: UPI is India-only and INR-only, and
-- baking one country's rails into the schema is not the right shape for this
-- app. A globally valid version would be a generic payee link the player
-- supplies themselves (PayPal.me, Revolut, Wise, a UPI intent) and the app
-- never parses — that is a separate design, not a widening of this one.

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
