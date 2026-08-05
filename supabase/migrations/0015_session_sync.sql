-- Sessions have always had created_by + RLS policies, but nothing in the
-- client ever wrote to this table — sessions were local-only. This adds the
-- one missing policy (delete) and a status-change RPC any member can call
-- without loosening the admin-only table UPDATE policy for anything else.

create policy "creator deletes sessions" on public.sessions for delete to authenticated
  using (created_by = auth.uid());

create or replace function public.set_session_status(
  p_session_id uuid,
  p_status text
) returns void language plpgsql security definer set search_path = public as $$
declare v_club uuid;
begin
  if p_status not in ('scheduled', 'live', 'done', 'cancelled') then
    raise exception 'Unknown status';
  end if;
  select club_id into v_club from sessions where id = p_session_id;
  if v_club is null then raise exception 'Session not found'; end if;
  if not is_club_member(v_club) then
    raise exception 'Only a club member can change this session';
  end if;
  update sessions
    set status = p_status, ends_at = case when p_status = 'done' then now() else ends_at end
    where id = p_session_id;
end $$;
