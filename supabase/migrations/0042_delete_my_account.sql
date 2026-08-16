-- Google Play requires any app with account creation to offer in-app account
-- deletion. Deleting the auth.users row is enough to erase the account: 0001
-- cascades auth.users -> profiles, every child table cascades from profiles,
-- and 0016 turned the created_by/scored_by back-references into `set null` so
-- clubs, sessions, matches and tournaments survive for the other players.
--
-- Only auth.uid() is ever selected, so an authenticated caller can delete
-- exactly one account: their own. There is no parameter to forge.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- The avatar is deliberately not deleted here. storage.protect_delete()
  -- rejects direct DELETEs on storage.objects (errcode 42501), which would
  -- abort this whole function for every user who has a profile picture — and
  -- the trigger is right, since deleting the row only orphans the stored
  -- bytes. The client removes the avatar through the storage API before
  -- calling this, and treats a failure there as a failed deletion.
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
