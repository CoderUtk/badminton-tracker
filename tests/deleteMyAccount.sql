-- Checks 0042_delete_my_account.sql against a live local database. Rolls back,
-- so it is safe to re-run. The jest suite cannot cover this: the whole point
-- is what Postgres does with the cascades and the storage triggers.
--
--   npx supabase start
--   docker exec -i supabase_db_badminton-tracker psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < tests/deleteMyAccount.sql

\set ON_ERROR_STOP on

begin;

-- Two accounts: the victim who deletes themself, and a bystander who must
-- survive it and keep the club/session the victim created.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'victim@test.local', 'x', now(), now(), '{}', '{}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bystander@test.local', 'x', now(), now(), '{}', '{}');

do $$ begin
  assert (select count(*) from public.profiles where id in
    ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')) = 2,
    'handle_new_user did not create both profiles';
end $$;

-- Content owned by the victim that other players must keep.
insert into public.clubs (id, name, created_by)
values ('33333333-3333-3333-3333-333333333333', 'Test Club', '11111111-1111-1111-1111-111111111111');
insert into public.sessions (id, club_id, created_by, starts_at)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', now());
-- Victim-only rows that must disappear.
insert into public.friendships (requester_id, addressee_id, status)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending');
-- An avatar row the client's storage-API call has NOT removed. The function
-- must still delete the account: storage.protect_delete() would reject a
-- direct DELETE here, so touching this row at all breaks deletion outright.
insert into storage.objects (bucket_id, name, owner)
values ('avatars', '11111111-1111-1111-1111-111111111111/avatar.jpg', '11111111-1111-1111-1111-111111111111');

-- Grants: only `authenticated` may execute it.
do $$ begin
  assert has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'),
    'authenticated cannot execute delete_my_account';
  assert not has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
    'anon can execute delete_my_account';
  assert not has_function_privilege('public', 'public.delete_my_account()', 'execute'),
    'PUBLIC can execute delete_my_account';
end $$;

-- Act as the victim.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.delete_my_account();
reset role;
set local request.jwt.claims = '';

do $$ begin
  assert not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'),
    'auth.users row survived';
  assert not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
    'profile survived';
  assert not exists (select 1 from public.friendships where requester_id = '11111111-1111-1111-1111-111111111111'),
    'friendship survived';
  -- The owner FK is set null by storage's own schema; the row itself stays,
  -- and that is fine — the client deleted the file before we got here.
  assert exists (select 1 from storage.objects where name like '11111111%'),
    'function deleted a storage row it must not touch';

  -- The bystander and the shared content must be untouched.
  assert exists (select 1 from auth.users where id = '22222222-2222-2222-2222-222222222222'),
    'bystander account was deleted';
  assert exists (select 1 from public.clubs where id = '33333333-3333-3333-3333-333333333333' and created_by is null),
    'club deleted instead of having created_by nulled';
  assert exists (select 1 from public.sessions where id = '44444444-4444-4444-4444-444444444444' and created_by is null),
    'session deleted instead of having created_by nulled';
end $$;

select 'ALL DELETE-ACCOUNT CHECKS PASSED' as result;

rollback;
