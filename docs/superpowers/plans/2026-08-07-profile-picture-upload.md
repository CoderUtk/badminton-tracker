# Profile Picture Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user set, replace, and remove a profile picture on `app/(app)/profile.tsx`.

**Architecture:** A new public Supabase Storage bucket (`avatars`) holds one fixed-name JPEG per user, RLS-scoped so each user can only write inside their own folder. `profiles.avatar_url` stores the public URL. `expo-image-picker` supplies capture/pick with built-in square crop; two new `profileRepo` functions handle upload and removal.

**Tech Stack:** Expo Router, React Native, Supabase (Postgres + Storage), `expo-image-picker`, `expo-file-system` (already a dependency via `expo`), `base64-arraybuffer` (already resolvable transitively via `react-native-view-shot`), Jest (`ts-jest`, node env, factory-mocked `supabase`).

## Global Constraints

- Avatar shows on the profile screen only (`app/(app)/profile.tsx`) — no other screen changes, per spec's explicit scope.
- Storage path is `{profile_id}/avatar.jpg` — fixed filename, `upsert: true`, so re-upload overwrites in place (no orphan cleanup).
- `avatar_url` is cache-busted with a `?t=<timestamp>` query param on every write so `<Image>` doesn't serve a stale copy of the same URL.
- Migration file numbering continues from the last migration on `master` at plan-execution time — check `ls supabase/migrations | tail -1` before naming the new file (do not assume `0026`; another commit may have taken it, as happened twice already in this project's migration history).

---

### Task 1: Migration + `expo-image-picker` dependency

**Files:**
- Create: `supabase/migrations/<next-number>_avatar_storage.sql`
- Modify: `package.json` (via `npx expo install`, not hand-edited)

**Interfaces:**
- Produces: `public.profiles.avatar_url text` column.
- Produces: Supabase Storage bucket `avatars` (public, RLS-scoped writes) with 4 policies.
- Produces: `expo-image-picker` importable as `import * as ImagePicker from "expo-image-picker"`.

- [ ] **Step 1: Determine the next migration number**

Run: `ls supabase/migrations | tail -3`
Note the highest number present and use `<that + 1>` for this task's filename (zero-padded to 4 digits, e.g. if the tail is `0025_...sql`, this file is `0026_avatar_storage.sql`).

- [ ] **Step 2: Write the migration file**

```sql
-- <N>_avatar_storage.sql

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

- [ ] **Step 3: Apply the migration to the live Supabase database**

Run from a checkout with `supabase link` already configured (per this project's history, a worktree checkout typically isn't linked — apply from the linked main checkout instead, copying the file over first if `supabase db push` reports "Cannot find project ref"):

```bash
supabase db push
```

Expected: the migration applies with no errors. If it fails with "duplicate key value violates unique constraint... version=<N> already exists" (this has happened twice already in this project — another commit landed the same number first), re-run Step 1, rename the file to the next free number, and push again.

- [ ] **Step 4: Install the image picker dependency**

Run: `npx expo install expo-image-picker`
Expected: `package.json` gains `expo-image-picker` at the version matching the installed Expo SDK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_avatar_storage.sql package.json package-lock.json
git commit -m "feat(db): add avatars storage bucket and profiles.avatar_url"
```

---

### Task 2: `profileRepo.uploadAvatar` / `removeAvatar`

**Files:**
- Modify: `src/repos/profileRepo.ts`
- Test: `tests/avatarUpload.test.ts` (new)

**Interfaces:**
- Consumes: `supabase` (existing, `src/lib/supabase.ts`).
- Produces: `uploadAvatar(localUri: string): Promise<string>`, exported from `src/repos/profileRepo.ts`. Resolves to the new public URL.
- Produces: `removeAvatar(): Promise<void>`, exported from `src/repos/profileRepo.ts`.
- Modifies: `Profile` type (`src/repos/profileRepo.ts:3`) gains `avatarUrl: string | null`. `getMyProfile()` (`src/repos/profileRepo.ts:17-37`) selects and returns it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/avatarUpload.test.ts
const getUser = jest.fn();
const upload = jest.fn();
const remove = jest.fn();
const getPublicUrl = jest.fn();
const update = jest.fn();
const eq = jest.fn();
const from = jest.fn();
const readAsStringAsync = jest.fn();

jest.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    storage: { from: (...a: unknown[]) => ({ upload: (...b: unknown[]) => upload(...b), remove: (...b: unknown[]) => remove(...b), getPublicUrl: (...b: unknown[]) => getPublicUrl(...b) }) },
    from: (...a: unknown[]) => from(...a),
  },
}));
jest.mock("expo-file-system", () => ({
  readAsStringAsync: (...a: unknown[]) => readAsStringAsync(...a),
  EncodingType: { Base64: "base64" },
}));

import { uploadAvatar, removeAvatar } from "../src/repos/profileRepo";

beforeEach(() => {
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-1" } } });
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: "https://x/avatars/u-1/avatar.jpg" } });
  readAsStringAsync.mockReset().mockResolvedValue("base64data");
  eq.mockReset().mockResolvedValue({ error: null });
  update.mockReset().mockReturnValue({ eq });
  from.mockReset().mockReturnValue({ update });
});

test("uploadAvatar uploads to the user's path and writes avatar_url", async () => {
  const url = await uploadAvatar("file:///tmp/pic.jpg");
  expect(upload).toHaveBeenCalledWith("u-1/avatar.jpg", expect.anything(), { contentType: "image/jpeg", upsert: true });
  expect(from).toHaveBeenCalledWith("profiles");
  expect(update).toHaveBeenCalledWith({ avatar_url: expect.stringContaining("https://x/avatars/u-1/avatar.jpg") });
  expect(eq).toHaveBeenCalledWith("id", "u-1");
  expect(url).toContain("https://x/avatars/u-1/avatar.jpg");
});

test("uploadAvatar throws on storage error without touching the profile row", async () => {
  upload.mockResolvedValue({ error: { message: "storage full" } });
  await expect(uploadAvatar("file:///tmp/pic.jpg")).rejects.toThrow("storage full");
  expect(from).not.toHaveBeenCalled();
});

test("removeAvatar deletes the storage object and clears avatar_url", async () => {
  await removeAvatar();
  expect(remove).toHaveBeenCalledWith(["u-1/avatar.jpg"]);
  expect(update).toHaveBeenCalledWith({ avatar_url: null });
  expect(eq).toHaveBeenCalledWith("id", "u-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/avatarUpload.test.ts`
Expected: FAIL — `uploadAvatar is not a function` (not yet exported).

- [ ] **Step 3: Implement `uploadAvatar` and `removeAvatar`**

Add near the top of `src/repos/profileRepo.ts`, after the existing `import { supabase } from "../lib/supabase";` (line 1):

```ts
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
```

Update the `Profile` type (`src/repos/profileRepo.ts:3`):

```ts
export type Profile = { id: string; displayName: string; displayNameSet: boolean; age: number | null; hand: Hand | null; avatarUrl: string | null };
```

Update `getMyProfile` (`src/repos/profileRepo.ts:17-37`) — add `avatar_url` to the `select` list and `avatarUrl` to the returned object:

```ts
export async function getMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, display_name_set, age, hand, avatar_url")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? "",
    displayNameSet: Boolean(data.display_name_set),
    age: (data.age as number | null) ?? null,
    hand: (data.hand as Hand | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
  };
}
```

Add at the end of `src/repos/profileRepo.ts`:

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
  listeners.forEach((l) => l());
  return url;
}

export async function removeAvatar(): Promise<void> {
  if (!supabase) throw new Error("Sign in to manage your profile picture");
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sign in to manage your profile picture");

  await supabase.storage.from("avatars").remove([`${uid}/avatar.jpg`]);
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", uid);
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
}
```

`listeners` is the existing module-level `Set<() => void>` at `src/repos/profileRepo.ts:8` — reuse it, don't redeclare.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/avatarUpload.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite to confirm `getMyProfile` callers still pass**

Run: `npx jest`
Expected: all suites pass — no existing test destructures `Profile` in a way the new `avatarUrl` field would break (it's additive).

- [ ] **Step 6: Commit**

```bash
git add src/repos/profileRepo.ts tests/avatarUpload.test.ts
git commit -m "feat(profile): add uploadAvatar/removeAvatar repo functions"
```

---

### Task 3: Avatar UI on the profile screen

**Files:**
- Modify: `app/(app)/profile.tsx`

**Interfaces:**
- Consumes: `getMyProfile(): Promise<Profile | null>` (existing, updated in Task 2 to include `avatarUrl`), `uploadAvatar(localUri: string): Promise<string>` and `removeAvatar(): Promise<void>` (Task 2, `src/repos/profileRepo.ts`), `Sheet` and `SheetAction` (existing, `src/components/Sheet.tsx`), `toast` (existing, `src/lib/toast.ts`).

- [ ] **Step 1: Add imports and state**

In `app/(app)/profile.tsx`, add to the `react-native` import (line 2) — `Image` alongside the existing imports:

```tsx
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
```

Add new imports after line 6 (`getMyProfile, ...` import):

```tsx
import * as ImagePicker from "expo-image-picker";
import { uploadAvatar, removeAvatar } from "../../src/repos/profileRepo";
```

(`getMyProfile` is already imported on line 6 — just add `uploadAvatar, removeAvatar` to that same import statement instead of a new one:)

```tsx
import { getMyProfile, setDisplayName as saveProfileName, setProfileDetails, uploadAvatar, removeAvatar, type Hand } from "../../src/repos/profileRepo";
```

Add `Sheet` import after the `BadgeGrid` import (line 13):

```tsx
import Sheet from "../../src/components/Sheet";
```

Add state after `const [editingDetails, setEditingDetails] = useState(false);` (line 34):

```tsx
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
```

- [ ] **Step 2: Load `avatarUrl` alongside the rest of the profile**

Update the existing profile-load `useEffect` (`app/(app)/profile.tsx:36-46`):

```tsx
  useEffect(() => {
    void getMyProfile().then((p) => {
      const name = p?.displayName ?? "";
      setDisplayName(name);
      setSavedName(name);
      setAge(p?.age ?? null);
      setSavedAge(p?.age ?? null);
      setHand(p?.hand ?? "right");
      setSavedHand(p?.hand ?? "right");
      setAvatarUrl(p?.avatarUrl ?? null);
    });
  }, []);
```

- [ ] **Step 3: Add the picker/upload/remove handlers**

Add after `cancelDetailsEdit`/`saveDetails` (after `app/(app)/profile.tsx:111`, before the `me` comment):

```tsx
  const pickAndUpload = async (source: "camera" | "library") => {
    setAvatarSheetOpen(false);
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast(`Enable ${source === "camera" ? "camera" : "photo"} access in Settings to add a picture`, "error");
      return;
    }
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;

    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(result.assets[0].uri);
      setAvatarUrl(url);
      toast("Profile picture updated", "success");
    } catch (e) {
      toast((e as Error).message || "Could not upload that picture", "error");
    } finally {
      setAvatarBusy(false);
    }
  };

  const doRemoveAvatar = async () => {
    setConfirmingRemove(false);
    setAvatarBusy(true);
    try {
      await removeAvatar();
      setAvatarUrl(null);
      toast("Profile picture removed", "success");
    } catch (e) {
      toast((e as Error).message || "Could not remove your picture", "error");
    } finally {
      setAvatarBusy(false);
    }
  };
```

- [ ] **Step 4: Wire the avatar into the hero and add the two sheets**

Replace the avatar `View` (`app/(app)/profile.tsx:130`):

```tsx
        <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
```

with:

```tsx
        <Pressable
          style={s.avatar}
          disabled={avatarBusy}
          onPress={() => setAvatarSheetOpen(true)}
          accessibilityLabel="Change profile picture"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
          ) : (
            <Text style={s.avatarText}>{initial}</Text>
          )}
        </Pressable>
```

Add the two `Sheet`s right after the existing `editingDetails` `Modal` closes (after `app/(app)/profile.tsx:215`, before the `{/* Headline stats */}` comment):

```tsx
      <Sheet
        visible={avatarSheetOpen}
        title="Profile picture"
        actions={[
          { label: "Take photo", onPress: () => void pickAndUpload("camera") },
          { label: "Choose from library", onPress: () => void pickAndUpload("library") },
          ...(avatarUrl ? [{ label: "Remove photo", destructive: true, onPress: () => { setAvatarSheetOpen(false); setConfirmingRemove(true); } }] : []),
          { label: "Cancel", onPress: () => setAvatarSheetOpen(false) },
        ]}
        onClose={() => setAvatarSheetOpen(false)}
      />
      <Sheet
        visible={confirmingRemove}
        title="Remove profile picture?"
        message="You'll go back to the default initial-letter avatar."
        actions={[
          { label: "Remove", onPress: doRemoveAvatar, destructive: true },
          { label: "Cancel", onPress: () => setConfirmingRemove(false) },
        ]}
        onClose={() => setConfirmingRemove(false)}
      />
```

- [ ] **Step 5: Add the `avatarImage` style**

In the `StyleSheet.create` block, after `avatarText` (`app/(app)/profile.tsx:350`):

```tsx
  avatarImage: { width: 56, height: 56, borderRadius: 28 },
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification (device, no automated UI test)**

Run: `npx expo run:android` (or `run:ios`)
On device, signed in: tap the avatar → sheet shows Take photo / Choose from library / Cancel (no Remove yet, no photo set). Choose from library → pick an image → crop UI appears → confirm → photo appears in the circle, persists after closing/reopening the app. Tap avatar again → sheet now also shows Remove photo. Take a new photo → old one is replaced (same circle, new image). Tap Remove photo → confirm sheet → falls back to the initial-letter circle. Deny photo-library permission when prompted → toast shows, no crash.

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/profile.tsx
git commit -m "feat(profile): add profile picture upload/remove UI"
```

---

## Self-Review Notes

- Spec coverage: migration + bucket + RLS (Task 1) ✓, `expo-image-picker` dependency (Task 1) ✓, `uploadAvatar`/`removeAvatar` repo functions (Task 2) ✓, `Profile.avatarUrl` plumbed through `getMyProfile` (Task 2) ✓, profile-screen-only UI with camera/library/remove (Task 3) ✓. Out-of-scope items (other screens, guest mode) are untouched — no task references them.
- Placeholder scan: none — every step has literal code or an exact command.
- Type consistency: `uploadAvatar(localUri: string): Promise<string>` (Task 2) matches Task 3's `await uploadAvatar(result.assets[0].uri)` (string in, string out assigned to `avatarUrl` state which is `string | null`). `removeAvatar(): Promise<void>` (Task 2) matches Task 3's `await removeAvatar()` with no captured return value. `Profile.avatarUrl: string | null` (Task 2) matches Task 3's `p?.avatarUrl ?? null` and the `avatarUrl` state type.
