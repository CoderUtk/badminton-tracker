-- Session cost split: what the night cost, how many shuttles it burned, who
-- fronted the money, and who has since settled their share.
--
-- The per-head share is NOT stored. It is cost_total_cents / (players checked
-- in), derived on read — attendance keeps changing after the cost is entered,
-- and a stored share would go stale the moment someone checks in late.
--
-- This is a money-adjacent path, so both writes go through security-definer
-- RPCs gated on "club admin OR session creator" rather than loosening the
-- table policies. `attendance` in particular is member-writable (0001_init
-- line 155), so the settled flag needs a column-level lockdown as well as an
-- RPC — see the revoke/grant pair at the bottom.

alter table public.sessions
  add column if not exists cost_total_cents int not null default 0
    check (cost_total_cents >= 0 and cost_total_cents <= 100000000),
  add column if not exists shuttles int not null default 0
    check (shuttles >= 0 and shuttles <= 500),
  add column if not exists paid_by uuid references public.club_players (id) on delete set null;

alter table public.attendance
  add column if not exists settled boolean not null default false;

-- Who may touch the money on a session: a club admin, or whoever created it.
-- created_by goes null when the creator deletes their account
-- (0016_profile_delete_cascade), so a null creator matches nobody — correct
-- and safe, same as the isCreator checks on the client.
create or replace function public.can_manage_session_cost(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session_id
       and (public.is_club_admin(s.club_id) or s.created_by = auth.uid())
  );
$$;

create or replace function public.set_session_cost(
  p_session_id uuid,
  p_cost_total_cents int,
  p_shuttles int,
  p_paid_by uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_club uuid;
begin
  select club_id into v_club from sessions where id = p_session_id;
  if v_club is null then raise exception 'Session not found'; end if;
  if not can_manage_session_cost(p_session_id) then
    raise exception 'Only the session creator or a club admin can set the cost';
  end if;
  -- Re-checked here as well as by the column CHECKs: a clear error beats a
  -- constraint violation surfacing as raw Postgres text in a toast.
  if p_cost_total_cents is null or p_cost_total_cents < 0 or p_cost_total_cents > 100000000 then
    raise exception 'Cost is out of range';
  end if;
  if p_shuttles is null or p_shuttles < 0 or p_shuttles > 500 then
    raise exception 'Shuttle count is out of range';
  end if;
  -- The payer must be on THIS session's roster. Without this an admin could
  -- point the debt at a player on a club they merely happen to know the id of.
  if p_paid_by is not null and not exists (
    select 1 from club_players where id = p_paid_by and club_id = v_club
  ) then
    raise exception 'That player is not on this club roster';
  end if;
  update sessions
     set cost_total_cents = p_cost_total_cents,
         shuttles = p_shuttles,
         paid_by = p_paid_by
   where id = p_session_id;
end $$;

create or replace function public.set_attendance_settled(
  p_session_id uuid,
  p_club_player_id uuid,
  p_settled boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_session_cost(p_session_id) then
    raise exception 'Only the session creator or a club admin can settle a share';
  end if;
  update attendance
     set settled = coalesce(p_settled, false)
   where session_id = p_session_id and club_player_id = p_club_player_id;
  if not found then
    raise exception 'That player has no attendance row for this session';
  end if;
end $$;

revoke all on function public.can_manage_session_cost(uuid) from public, anon;
revoke all on function public.set_session_cost(uuid, int, int, uuid) from public, anon;
revoke all on function public.set_attendance_settled(uuid, uuid, boolean) from public, anon;
grant execute on function public.can_manage_session_cost(uuid) to authenticated;
grant execute on function public.set_session_cost(uuid, int, int, uuid) to authenticated;
grant execute on function public.set_attendance_settled(uuid, uuid, boolean) to authenticated;

-- Lock `settled` away from the member-writable UPDATE policy on attendance.
--
-- A bare `revoke update (settled) ...` would be a no-op: a column-level revoke
-- cannot subtract from the table-level UPDATE grant Supabase's bootstrap hands
-- `authenticated`. The working shape is a table-level revoke plus an explicit
-- column-level re-grant — exactly the correction 0030_usernames_fixes.sql made
-- for profiles.username after 0029 got it wrong.
--
-- The re-granted list is every column setAttendance's upsert writes. PostgREST
-- compiles an upsert to INSERT .. ON CONFLICT DO UPDATE SET over ALL columns in
-- the payload, so session_id and club_player_id need UPDATE too, not just
-- status. Dropping either would break check-in outright.
revoke update on public.attendance from authenticated;
grant update (session_id, club_player_id, status) on public.attendance to authenticated;
