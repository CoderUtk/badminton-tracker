-- 0026_avatar_storage.sql

alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Path convention: avatars/{profile_id}/avatar.jpg — folder name must equal
-- the caller's own uid, so a user can only write inside their own folder.
create policy "avatar owner can insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner can update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'avatars');
