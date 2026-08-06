# Profile Picture Upload — Design

## Goal

Let a signed-in user set, replace, and remove a profile picture on `app/(app)/profile.tsx`.

## Scope

In scope:
- Avatar shown on the profile screen only (replaces the initial-letter circle when set).
- Upload via camera or photo library, square-cropped, stored in a new Supabase Storage bucket.
- Remove photo, falling back to the initial-letter circle.

Out of scope:
- Showing the photo anywhere else (club rosters, tournament staff/entrant lists, bracket cells) — those keep initials.
- Guest-mode users (no `profiles` row, no Supabase session) — the profile screen's avatar action is only reachable when signed in, same as the rest of that screen already assumes.

## Data layer

### Migration `0026_avatar_storage.sql`

```sql
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
```

Fixed filename (`avatar.jpg`) per user folder — a re-upload overwrites in place, no orphan-file cleanup needed. `avatar_url` stores the bucket's public URL; the client appends a `?t=<timestamp>` query param on every update so `<Image>` doesn't serve a stale cached copy of the same URL.

### `src/repos/profileRepo.ts` — new functions

```ts
export async function uploadAvatar(localUri: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to set a profile picture");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to set a profile picture");

  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `${uid}/avatar.jpg`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, decode(base64), { contentType: "image/jpeg", upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;

  const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
  if (dbErr) throw new Error(dbErr.message);
  return url;
}

export async function removeAvatar(): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage your profile picture");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to manage your profile picture");

  await supabase.storage.from("avatars").remove([`${uid}/avatar.jpg`]);
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", uid);
  if (error) throw new Error(error.message);
}
```

`decode` is `base64-arraybuffer`'s `decode` (already a transitive dependency via Supabase's own examples; add directly if not already resolvable — `npm ls base64-arraybuffer` during Task 1 confirms). `getMyProfile()` (existing, `src/repos/profileRepo.ts:24-25`) gains `avatar_url` in its `select` list and return shape (`avatarUrl: string | null`).

## UI — `app/(app)/profile.tsx`

The `avatar` `View` (`app/(app)/profile.tsx:130`, `s.avatar`/`s.avatarText` styles at lines 349-350) becomes a `Pressable`:

- Renders `<Image source={{ uri: avatarUrl }} style={s.avatar} />` when `avatarUrl` is set.
- Renders the existing initial-letter circle otherwise (unchanged).
- `onPress` opens a `Sheet` (existing component, same pattern as the menu sheets in `app/(app)/clubs/[id].tsx`) with actions: "Take photo", "Choose from library", "Remove photo" (omitted when `avatarUrl` is null), "Cancel".
- "Take photo" → `ImagePicker.requestCameraPermissionsAsync()` then `ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })`.
- "Choose from library" → `ImagePicker.requestMediaLibraryPermissionsAsync()` then `ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })`.
- On a non-cancelled result, call `uploadAvatar(result.assets[0].uri)`, update local `avatarUrl` state on success, toast on failure (old avatar stays displayed — no partial state).
- Permission denial: toast "Enable camera/photo access in Settings to add a picture" (mirrors the existing reminders-permission toast pattern at `app/(app)/profile.tsx:64`).
- "Remove photo" → confirm via the same `Sheet`'s destructive-action convention used elsewhere (e.g. `app/(app)/clubs/[id].tsx`'s delete-club confirm) → `removeAvatar()` → clear local state, toast success/failure.

New dependency: `expo-image-picker` (handles both camera and library permission prompts internally).

## Testing

- Unit: `tests/avatarUpload.test.ts` — mock `supabase.storage.from().upload/remove/getPublicUrl` and `supabase.from("profiles").update`, same factory-mock pattern as `tests/removeClubPlayer.test.ts`. Cover: `uploadAvatar` calls `upload` with the right path/upsert flag and writes `avatar_url`; `uploadAvatar` throws on storage error without touching the DB row; `removeAvatar` clears `avatar_url` and calls `storage.remove`.
- Manual (device, no automated UI test — this app's established pattern for RN screens): tap avatar while signed out of a photo → picker opens, pick one → cropped photo appears, persists after app restart. Tap again → replace with a new photo → old one is overwritten (bucket doesn't accumulate files). Remove photo → falls back to initials. Deny camera permission → toast, no crash.
