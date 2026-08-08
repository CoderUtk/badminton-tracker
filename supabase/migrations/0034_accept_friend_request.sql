-- 0034_accept_friend_request.sql
-- Fixes a gap in 0032: the friendships UPDATE policy had no WITH CHECK, so
-- Postgres reused USING for both read and write authorization, letting a
-- requester silently accept their own outgoing request. This drops that
-- policy and moves accept behind a security-definer RPC that verifies the
-- caller is actually the addressee before flipping status.

drop policy if exists "either party can update status" on public.friendships;

create or replace function public.accept_friend_request(p_requester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update friendships
     set status = 'accepted', responded_at = now()
   where requester_id = p_requester_id
     and addressee_id = auth.uid()
     and status = 'pending';
  if not found then
    raise exception 'No pending request from that player';
  end if;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;
