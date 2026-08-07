# Usernames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every signed-in account a globally unique, human-typeable username, stored on `profiles` and editable from the profile screen.

**Architecture:** One migration adds `profiles.username` (unique, not null), a `username_history` table for the 30-day release hold, a shared SQL validator, a generator used by both the backfill and the new-user trigger, and a `set_username` security-definer RPC that is the only writer (the column's direct `update` grant is revoked). The app adds a mirror validator in `src/lib/validate.ts`, a `setUsername` repo function, and a tappable row on the profile screen. No search, lookup, or public-profile surface ships.

**Tech Stack:** Supabase Postgres (migrations under `supabase/migrations/`, applied with `npx supabase db push`), TypeScript, React Native / Expo Router, Jest.

**Spec:** `docs/superpowers/specs/2026-08-07-usernames-design.md`

## Global Constraints

- Migration number is `0029_usernames.sql`. **Re-check `ls supabase/migrations | tail -3` immediately before writing the file.** Concurrent sessions have collided on numbering repeatedly in this repo, and a collision on `0026` caused `supabase db push` to silently skip a migration entirely (its version was already in the ledger). If `0029` is taken, use the next free number and update every reference in this plan.
- This repo's main checkout is shared with other concurrent sessions. **Always commit with an explicit pathspec** (`git commit -m "..." -- path/one path/two`) and **verify with `git show --stat HEAD`** that only intended files landed. Never use bare `git add -A` or `git commit -a`.
- Username format, fixed and identical in SQL and TypeScript: stored lowercase, characters `a-z0-9_`, length 3–20, may not start or end with `_`.
- Reserved words, rejected in both layers: `admin`, `administrator`, `support`, `help`, `root`, `system`, `moderator`, `official`, `badminton`, `null`, `undefined`.
- Release hold is 30 days.
- Taken-handle error text is exactly `That username is taken`, used for both live and held handles so the hold cannot be used to probe past ownership.
- Malformed-input error text is exactly `Usernames are 3-20 characters, using letters, numbers, and underscores`.
- Test convention: factory-mock `src/lib/supabase` with `jest.mock("../src/lib/supabase", () => ({ supabase: { ... } }))`, as in `tests/leaveClub.test.ts` and `tests/avatarUpload.test.ts`.
- Do not touch `app/(app)/_layout.tsx` — it has uncommitted changes from another session.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `supabase/migrations/0029_usernames.sql` | Create | Column, history table, validator, generator, backfill, constraints, trigger update, `set_username` RPC, privilege revoke |
| `src/lib/validate.ts` | Modify | Add `validateUsername` — client mirror of the SQL rules, for inline feedback only |
| `src/repos/profileRepo.ts` | Modify | `Profile.username`, select it in `getMyProfile`, add `setUsername` |
| `app/(app)/profile.tsx` | Modify | Display `@username`, edit modal, public label |
| `tests/username.test.ts` | Create | `setUsername` repo behaviour + `getMyProfile` mapping |
| `tests/validate.test.ts` | Modify | `validateUsername` cases |

---

## Task 1: Database

**Files:**
- Create: `supabase/migrations/0029_usernames.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `profiles.username text not null unique`; RPC `set_username(p_username text) returns text`; SQL functions `is_valid_username(text) returns boolean` and `generate_username(text) returns text`; table `username_history(username text pk, profile_id uuid, released_at timestamptz)`.

- [ ] **Step 1: Confirm the migration number is free**

Run: `ls supabase/migrations | tail -3`
Expected: `0026_avatar_storage.sql`, `0027_approve_join_adds_club_member.sql`, `0028_leave_club.sql`. If anything numbered `0029` or higher exists, use the next free number throughout.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0029_usernames.sql`:

```sql
-- 0029_usernames.sql
-- A globally unique, human-typeable handle per account. Identity only:
-- no lookup or search surface ships with this.

alter table public.profiles add column if not exists username text;

create table if not exists public.username_history (
  username text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  released_at timestamptz not null default now()
);

create index if not exists username_history_released
  on public.username_history (released_at);

-- No policies: writes go only through set_username, and no client reads this
-- table. RLS with zero policies denies everything to authenticated, while the
-- security-definer RPC bypasses it.
alter table public.username_history enable row level security;

-- Shared validator so the trigger, the backfill, and set_username cannot drift.
create or replace function public.is_valid_username(p text)
returns boolean language sql immutable as $$
  select p is not null
     and p ~ '^[a-z0-9](?:[a-z0-9_]{1,18})[a-z0-9]$'
     and p not in (
       'admin','administrator','support','help','root',
       'system','moderator','official','badminton','null','undefined'
     );
$$;

-- Derive a legal, unused handle from an arbitrary seed. Used by the backfill
-- and by the new-user trigger, neither of which can ask the user to pick.
create or replace function public.generate_username(p_seed text)
returns text language plpgsql security definer set search_path = public as $$
declare v_base text; v_candidate text; v_n int := 0;
begin
  v_base := lower(coalesce(p_seed, ''));
  v_base := regexp_replace(v_base, '[^a-z0-9_]', '', 'g');
  v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
  v_base := left(v_base, 15);
  if length(v_base) < 3 then
    v_base := 'player';
  end if;

  v_candidate := v_base;
  while exists (select 1 from profiles where username = v_candidate)
     or exists (select 1 from username_history where username = v_candidate)
     or not is_valid_username(v_candidate) loop
    v_n := v_n + 1;
    v_candidate := left(v_base, 20 - length(v_n::text)) || v_n::text;
  end loop;
  return v_candidate;
end $$;

-- Backfill every existing account. Ordered by created_at so the earliest
-- account wins the unsuffixed handle -- arbitrary but stable and defensible.
-- Seed is display_name only: deriving a public handle from an email local part
-- would leak the address to anyone who can read profiles.
do $$
declare r record;
begin
  for r in select id, display_name from profiles where username is null order by created_at loop
    update profiles set username = generate_username(nullif(trim(r.display_name), ''))
    where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column username set not null;

create unique index if not exists profiles_username_key on public.profiles (username);

alter table public.profiles
  add constraint profiles_username_valid check (is_valid_username(username));

-- New accounts get a handle at signup, so no account can ever exist without
-- one and onboarding needs no extra screen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  insert into public.profiles (id, display_name, avatar_url, username)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    public.generate_username(nullif(trim(v_name), ''))
  );
  return new;
end $$;

-- The profile screen's update grant is broad (using id = auth.uid()), which
-- would let a client set username directly, skipping the release hold and
-- writing no history row. Close the column at the privilege level so the
-- security-definer RPC below is the only writer. Every other column keeps its
-- table-wide grant, so setDisplayName / completeOnboarding / setProfileDetails
-- / uploadAvatar / removeAvatar are unaffected.
revoke update (username) on public.profiles from authenticated;

create or replace function public.set_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_current text; v_next text; v_holder uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to change your username';
  end if;

  v_next := lower(trim(coalesce(p_username, '')));
  if not is_valid_username(v_next) then
    raise exception 'Usernames are 3-20 characters, using letters, numbers, and underscores';
  end if;

  select username into v_current from profiles where id = v_uid;
  if v_current = v_next then
    return v_next;
  end if;

  if exists (select 1 from profiles where username = v_next) then
    raise exception 'That username is taken';
  end if;

  -- A released handle is held for 30 days; only its previous owner may
  -- re-claim it during the hold. The error text is identical to the
  -- already-taken case so the hold cannot be used to probe past ownership.
  select profile_id into v_holder from username_history
  where username = v_next and released_at > now() - interval '30 days';
  if v_holder is not null and v_holder <> v_uid then
    raise exception 'That username is taken';
  end if;

  insert into username_history (username, profile_id, released_at)
  values (v_current, v_uid, now())
  on conflict (username) do update
    set profile_id = excluded.profile_id, released_at = excluded.released_at;

  -- Claiming a handle clears its history row, so the owner's own re-claim on a
  -- later change is not blocked by their earlier release.
  delete from username_history where username = v_next;

  update profiles set username = v_next where id = v_uid;
  return v_next;
end $$;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: `0029_usernames.sql` listed as applied, no error. If the CLI reports nothing pending, the version collided — stop and renumber.

- [ ] **Step 4: Verify the backfill left no nulls and no duplicates**

Run: `npx supabase migration list`
Expected: `0029` present in both the local and remote columns.

Then in the Supabase SQL editor (or any authenticated psql session), run:

```sql
select count(*) as nulls from profiles where username is null;
select username, count(*) from profiles group by 1 having count(*) > 1;
select id, display_name, username from profiles order by created_at limit 10;
```

Expected: `nulls` is 0; the duplicate query returns no rows; the sample shows plausible handles derived from display names, with `player`, `player1`, … for accounts whose display name had no usable characters.

- [ ] **Step 5: Verify the RPC and the privilege revoke**

In the SQL editor, confirm the function exists and the grant is gone:

```sql
select proname from pg_proc where proname in ('set_username','is_valid_username','generate_username');
select privilege_type from information_schema.column_privileges
  where table_name = 'profiles' and column_name = 'username' and grantee = 'authenticated';
```

Expected: three function rows; the second query returns no `UPDATE` row.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0029_usernames.sql
git commit -m "feat(db): add unique usernames with release hold and set_username RPC" -- supabase/migrations/0029_usernames.sql
git show --stat HEAD
```

Confirm `git show --stat HEAD` lists exactly one file.

---

## Task 2: Client-side validator

**Files:**
- Modify: `src/lib/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `validateUsername(value: string): string | null` and `MAX_USERNAME: number` exported from `src/lib/validate.ts`. Returns an error string, or `null` when valid. Lowercases and trims before checking, mirroring `is_valid_username`. The RPC remains the authority; this exists only to avoid a round-trip for obvious mistakes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/validate.test.ts`:

```ts
import { validateUsername } from "../src/lib/validate";

test("validateUsername accepts legal handles", () => {
  expect(validateUsername("abc")).toBeNull();
  expect(validateUsername("rahul_07")).toBeNull();
  expect(validateUsername("a".repeat(20))).toBeNull();
  // Case and surrounding space are normalised, not rejected.
  expect(validateUsername("  Rahul_07  ")).toBeNull();
});

test("validateUsername rejects bad length", () => {
  expect(validateUsername("ab")).toBe("Usernames are 3-20 characters, using letters, numbers, and underscores");
  expect(validateUsername("a".repeat(21))).toBe("Usernames are 3-20 characters, using letters, numbers, and underscores");
  expect(validateUsername("")).toBe("Username is required");
});

test("validateUsername rejects illegal characters and edge underscores", () => {
  expect(validateUsername("_rahul")).not.toBeNull();
  expect(validateUsername("rahul_")).not.toBeNull();
  expect(validateUsername("rah ul")).not.toBeNull();
  expect(validateUsername("rahul!")).not.toBeNull();
});

test("validateUsername rejects reserved words", () => {
  expect(validateUsername("admin")).toBe("That username is reserved");
  expect(validateUsername("Support")).toBe("That username is reserved");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/validate.test.ts`
Expected: FAIL — `validateUsername is not a function` (or a TypeScript resolution error on the import).

- [ ] **Step 3: Implement the validator**

Append to `src/lib/validate.ts`:

```ts
export const MAX_USERNAME = 20;
export const MIN_USERNAME = 3;

// Mirrors public.is_valid_username in 0029_usernames.sql. Both must move
// together — the SQL side is the authority, this one only spares a round-trip.
const USERNAME_RE = /^[a-z0-9][a-z0-9_]{1,18}[a-z0-9]$/;

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "support", "help", "root",
  "system", "moderator", "official", "badminton", "null", "undefined",
]);

/**
 * Validate a user-supplied username. Returns an error message, or null when
 * valid. Input is lowercased and trimmed first, so "Rahul_07" is normalised
 * rather than rejected — the canonical stored form is always lowercase.
 */
export function validateUsername(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return "Username is required";
  if (RESERVED_USERNAMES.has(v)) return "That username is reserved";
  if (!USERNAME_RE.test(v)) {
    return `Usernames are ${MIN_USERNAME}-${MAX_USERNAME} characters, using letters, numbers, and underscores`;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/validate.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.ts tests/validate.test.ts
git commit -m "feat(validate): add validateUsername mirroring the SQL rules" -- src/lib/validate.ts tests/validate.test.ts
git show --stat HEAD
```

Confirm exactly two files.

---

## Task 3: Repo layer

**Files:**
- Modify: `src/repos/profileRepo.ts`
- Test: `tests/username.test.ts` (create)

**Interfaces:**
- Consumes: RPC `set_username(p_username text) returns text` from Task 1.
- Produces: `Profile` type gains `username: string`; `setUsername(username: string): Promise<string>` exported from `src/repos/profileRepo.ts`, returning the canonical lowercase handle.

- [ ] **Step 1: Write the failing tests**

Create `tests/username.test.ts`:

```ts
const rpc = jest.fn();
const getUser = jest.fn();
const maybeSingle = jest.fn();
const eq = jest.fn();
const select = jest.fn();
const from = jest.fn();

jest.mock("../src/lib/supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: (...a: unknown[]) => from(...a),
  },
}));
// profileRepo imports expo-file-system/legacy for the avatar functions; this
// test never exercises them, but the module must still resolve.
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

import { setUsername, getMyProfile, subscribeProfile } from "../src/repos/profileRepo";

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-1" } } });
  maybeSingle.mockReset().mockResolvedValue({
    data: {
      id: "u-1",
      display_name: "Rahul",
      display_name_set: true,
      age: null,
      hand: null,
      avatar_url: null,
      username: "rahul_07",
    },
    error: null,
  });
  eq.mockReset().mockReturnValue({ maybeSingle });
  select.mockReset().mockReturnValue({ eq });
  from.mockReset().mockReturnValue({ select });
});

test("setUsername calls the RPC with a trimmed, lowercased handle", async () => {
  rpc.mockResolvedValue({ data: "rahul_07", error: null });
  await expect(setUsername("  Rahul_07 ")).resolves.toBe("rahul_07");
  expect(rpc).toHaveBeenCalledWith("set_username", { p_username: "rahul_07" });
});

test("setUsername surfaces the RPC's error message verbatim", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "That username is taken" } });
  await expect(setUsername("rahul")).rejects.toThrow("That username is taken");
});

test("setUsername notifies profile subscribers on success", async () => {
  rpc.mockResolvedValue({ data: "rahul_07", error: null });
  const cb = jest.fn();
  const unsub = subscribeProfile(cb);
  await setUsername("rahul_07");
  expect(cb).toHaveBeenCalled();
  unsub();
});

test("setUsername does not notify subscribers when the RPC fails", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "That username is taken" } });
  const cb = jest.fn();
  const unsub = subscribeProfile(cb);
  await expect(setUsername("rahul")).rejects.toThrow();
  expect(cb).not.toHaveBeenCalled();
  unsub();
});

test("getMyProfile maps username off the selected row", async () => {
  const p = await getMyProfile();
  expect(p?.username).toBe("rahul_07");
  expect(select).toHaveBeenCalledWith(expect.stringContaining("username"));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/username.test.ts`
Expected: FAIL — `setUsername is not a function`, and the `getMyProfile` case failing on `username` being `undefined`.

- [ ] **Step 3: Implement the repo changes**

In `src/repos/profileRepo.ts`, extend the `Profile` type (line 5):

```ts
export type Profile = { id: string; displayName: string; displayNameSet: boolean; age: number | null; hand: Hand | null; avatarUrl: string | null; username: string };
```

In `getMyProfile`, add `username` to the select list and to the returned object:

```ts
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, display_name_set, age, hand, avatar_url, username")
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
    username: (data.username as string | null) ?? "",
  };
```

Add at the end of the file:

```ts
/**
 * Change the signed-in user's handle. Returns the canonical (lowercased)
 * value the server stored.
 *
 * Goes through the set_username RPC rather than a column update: the direct
 * update grant on profiles.username is revoked, and only the RPC enforces the
 * 30-day release hold and writes the username_history row (see
 * 0029_usernames.sql).
 */
export async function setUsername(username: string): Promise<string> {
  if (!supabase) throw new Error("Sign in to change your username");
  const { data, error } = await supabase.rpc("set_username", {
    p_username: username.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message);
  listeners.forEach((l) => l());
  return data as string;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/username.test.ts`
Expected: PASS, all five cases.

- [ ] **Step 5: Check types across the repo**

Run: `npx tsc --noEmit`
Expected: no errors. `Profile` gained a required field, so any other construction site of that type would surface here. If one does, add `username` there rather than making the field optional — the whole point is that it always exists.

- [ ] **Step 6: Commit**

```bash
git add src/repos/profileRepo.ts tests/username.test.ts
git commit -m "feat(profile): add setUsername repo function and username on Profile" -- src/repos/profileRepo.ts tests/username.test.ts
git show --stat HEAD
```

Confirm exactly two files.

---

## Task 4: Profile screen

**Files:**
- Modify: `app/(app)/profile.tsx`

**Interfaces:**
- Consumes: `setUsername` and `Profile.username` from Task 3; `validateUsername` from Task 2.
- Produces: nothing consumed by later tasks.

**Note on the pattern:** the spec said "the existing `Sheet` pattern". The display-name editor on this screen actually uses a `Modal` (`app/(app)/profile.tsx:203-229`); `Sheet` is used for the avatar action list. A single text input with validation matches the display-name editor, so this task mirrors the `Modal` and reuses its `modalBack` / `modalCard` / `nameInput` / `modalBtn` styles. The username row itself mirrors the existing `detailsCard` row rather than crowding the hero, which already carries the name and the email.

- [ ] **Step 1: Add state and the save handler**

Alongside the existing `useState` declarations (around `app/(app)/profile.tsx:26-40`), add:

```tsx
  const [username, setUsername] = useState<string>("");
  const [usernameDraft, setUsernameDraft] = useState<string>("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameBusy, setUsernameBusy] = useState(false);
```

In the effect that loads the profile (around line 44, where `const name = p?.displayName ?? "";` is set), also seed the handle:

```tsx
      setUsername(p?.username ?? "");
```

**Extend the two existing import lines — do not add new ones.** The repo import at `app/(app)/profile.tsx:7` already aliases a colliding name (`setDisplayName as saveProfileName`, because the local state setter owns `setDisplayName`). Follow that same convention here:

```tsx
import { getMyProfile, setDisplayName as saveProfileName, setProfileDetails, setUsername as saveProfileUsername, uploadAvatar, removeAvatar, type Hand } from "../../src/repos/profileRepo";
```

And line 9:

```tsx
import { validateName, validateUsername } from "../../src/lib/validate";
```

Then, near the existing `nameError` line (around line 81), add the error and the handlers:

```tsx
  const usernameError = validateUsername(usernameDraft);

  const openUsernameEdit = useCallback(() => {
    setUsernameDraft(username);
    setEditingUsername(true);
  }, [username]);

  const cancelUsernameEdit = useCallback(() => {
    setEditingUsername(false);
    setUsernameDraft(username);
  }, [username]);

  const saveUsername = useCallback(() => {
    const v = usernameDraft.trim().toLowerCase();
    if (usernameError) { toast(usernameError, "error"); return; }
    if (v === username) { setEditingUsername(false); return; }
    setUsernameBusy(true);
    saveProfileUsername(v)
      .then((saved) => {
        setUsername(saved);
        setEditingUsername(false);
        toast("Username updated", "success");
      })
      .catch((e: Error) => toast(e.message || "Could not save your username", "error"))
      .finally(() => setUsernameBusy(false));
  }, [usernameDraft, usernameError, username]);
```

- [ ] **Step 2: Add the row and the modal**

Immediately after the display-name `Modal`'s closing `</Modal>` (around line 229) and before the player-details `Pressable`, insert:

```tsx
      {/* Username: the account's global handle. Public by design — the helper
          text in the editor is the whole expectation-setting mechanism, since
          nothing can search for it yet. */}
      <Pressable style={s.detailsCard} onPress={openUsernameEdit} accessibilityLabel="Edit username">
        <Icon name="at-outline" color={C.text2} size={16} />
        <Text style={s.detailsText}>{username ? `@${username}` : "Username not set"}</Text>
        <Icon name="create-outline" color={C.text2} size={15} />
      </Pressable>

      <Modal visible={editingUsername} transparent animationType="fade" onRequestClose={cancelUsernameEdit}>
        <Pressable style={s.modalBack} onPress={cancelUsernameEdit}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.cardTitle}>Username</Text>
            <TextInput
              style={s.nameInput}
              placeholder="yourname"
              placeholderTextColor={C.text2}
              value={usernameDraft}
              onChangeText={(t) => setUsernameDraft(t.toLowerCase())}
              onSubmitEditing={saveUsername}
              returnKeyType="done"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            <Text style={s.usernameHint}>Your username is public. Other players can find you by it.</Text>
            {usernameError ? <Text style={s.err}>{usernameError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable style={[s.modalBtn, s.modalCancel]} onPress={cancelUsernameEdit}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalBtn, s.modalSave, (!!usernameError || usernameBusy) && { opacity: 0.5 }]}
                disabled={!!usernameError || usernameBusy}
                onPress={saveUsername}
              >
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
```

- [ ] **Step 3: Add the hint style**

In the `StyleSheet.create` block at the bottom (around line 425), next to the existing `avatarImage` entry:

```tsx
  usernameHint: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 2 },
```

- [ ] **Step 4: Verify it compiles and nothing regressed**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: the whole suite passes. If `at-outline` is not a valid name for the project's `Icon` component, check `src/components/Icon.tsx` for the available set and substitute the closest (`person-outline` is a safe fallback) — do not leave an icon that renders blank.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile.tsx"
git commit -m "feat(profile): show and edit username on the profile screen" -- "app/(app)/profile.tsx"
git show --stat HEAD
```

Confirm exactly one file. `app/(app)/_layout.tsx` has another session's uncommitted changes and must not appear.

---

## Task 5: End-to-end verification on device

**Files:** none — verification only.

**Interfaces:** none.

- [ ] **Step 1: Run the full suite and the type check**

Run: `npx jest`
Expected: all suites pass.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Build and launch on the connected device**

Run: `npx expo run:android`
Expected: the app installs and opens.

- [ ] **Step 3: Verify display**

Open the profile screen. Expected: a row under the hero reading `@<handle>`, with a handle derived from the display name.

- [ ] **Step 4: Verify a successful change**

Tap the row, enter a new handle in mixed case (e.g. `Rahul_2026`), save. Expected: toast "Username updated"; the row shows `@rahul_2026` (lowercased).

Then in the SQL editor:

```sql
select username from profiles where id = '<your uid>';
select * from username_history where profile_id = '<your uid>';
```

Expected: the new handle on `profiles`; a `username_history` row holding the previous handle.

- [ ] **Step 5: Verify the owner can re-claim within the hold**

Change back to the original handle. Expected: succeeds, and the `username_history` row for the re-claimed handle is gone.

- [ ] **Step 6: Verify the hold blocks a different account**

From a second account, attempt to claim a handle the first account released less than 30 days ago. Expected: error toast "That username is taken".

- [ ] **Step 7: Verify validation and collision messages**

Attempt `ab`, `_rahul`, `rahul_`, and `admin`. Expected: inline errors, Save disabled, no network call.
Attempt a handle another account currently holds. Expected: error toast "That username is taken".

- [ ] **Step 8: Verify a fresh signup**

Sign up a new account. Expected: onboarding is unchanged (name, age, hand — no username step), and the profile screen already shows a handle.

- [ ] **Step 9: Verify the direct write path is closed**

From the app's authenticated session (or a REST call with a user JWT), attempt `update profiles set username = 'anything' where id = auth.uid()`.
Expected: rejected on privileges. It must not silently succeed — a silent success means the `revoke` did not apply and the release hold is bypassable.

- [ ] **Step 10: Report results**

Report each step's outcome plainly, including any that failed. Do not mark the plan complete with a failing step.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| `profiles.username`, unique, not null | Task 1 |
| Format rules (lowercase, charset, length, edge underscores, reserved) | Task 1 (SQL), Task 2 (client mirror) |
| Backfill of existing accounts, seeded from `display_name` only | Task 1 Step 2, verified Step 4 |
| New-user trigger assigns a handle | Task 1 Step 2, verified Task 5 Step 8 |
| 30-day release hold + `username_history` | Task 1 Step 2, verified Task 5 Steps 4–6 |
| `set_username` RPC as sole writer + privilege revoke | Task 1 Step 2, verified Step 5 and Task 5 Step 9 |
| `Profile.username`, `getMyProfile` mapping, `setUsername` | Task 3 |
| Profile screen display, edit, public label | Task 4 |
| Onboarding untouched | Task 4 (no change made), verified Task 5 Step 8 |
| Error-handling table | Task 2 (client messages), Task 1 (RPC messages), verified Task 5 Step 7 |
| Test list from the spec | Tasks 2 and 3 |
| Manual verification list from the spec | Task 5 |

No gaps. The spec's out-of-scope items (search, public profiles, guests, anonymous sessions, change rate-limiting) have no tasks, correctly.

**Deviations from the spec, both deliberate**

1. The spec said the editor uses `Sheet`; the plan uses `Modal`, because that is what the sibling display-name editor on the same screen actually uses. `Sheet` on this screen is an action list, not a form.
2. The spec placed `@username` under the display name in the hero. The plan gives it its own row styled like the existing `detailsCard`, because the hero already carries the name and the email and a fourth line crowds it.

**Type consistency**

`setUsername(username: string): Promise<string>` is named and typed identically in Task 3's Interfaces block, its test, its implementation, and its Task 4 call site. `validateUsername(value: string): string | null` likewise across Tasks 2 and 4.

The one real trap in Task 4 is a name collision: the screen's local state setter wants to be `setUsername`, which is also the repo export. The file already solves this exact problem for display names by aliasing the import (`setDisplayName as saveProfileName`, `app/(app)/profile.tsx:7`), so Task 4 imports `setUsername as saveProfileUsername` and lets the local state setter keep the plain name. Both import lines are extended in place rather than duplicated.
