# Usernames — Design

## Goal

Give every signed-in account a globally unique, human-typeable handle, so a person has one stable identity across clubs, sessions, tournaments, and any future social surface.

This ships the identity primitive only. No search box, no add-by-username, no public profile screen.

## Why now, and why only this much

Every account already has a globally unique identity: `profiles.id`, a uuid. What it lacks is a form a human can type, say, or share. That is the entire gap this closes.

The parts that are expensive to change later are the ones being decided here: the uniqueness constraint, the charset and case rules, the backfill, and whether a released handle can be re-registered. Every discovery surface built on top — add-by-username, public profiles, cross-club stats, social — is purely additive once those are fixed. Building a lookup UI now would not make that later work cheaper; it would only force us to design an anti-enumeration and anti-harassment surface blind, for an app where today every join is a link someone deliberately shared.

## Scope

In scope:
- `profiles.username`, unique, backfilled for every existing account, auto-assigned for every new one.
- Editing the username from `app/(app)/profile.tsx`, with validation and a clear "this is public" label.
- A release hold so a freed handle cannot be immediately claimed by someone else.

Out of scope:
- Any lookup, search, or add-by-username surface.
- A public profile screen.
- Guests (`club_players` rows with `profile_id = null`). They remain club-local and have no global identity. Promoting a guest to a real account is a separate, larger design that touches ratings, entrants, and match history.
- Anonymous / guest-mode sessions. They have no `profiles` row to hold a username.
- Rate-limiting how often a user may change their handle.

## Privacy note — this is already public

`profiles` today carries this policy (from `0018_anon_rls_restrictions.sql`):

```sql
create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated
  using (coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);
```

Any signed-in, non-anonymous user can already read every row of `profiles`, including `display_name` and `avatar_url`. Adding `username` to that table makes it readable by every signed-in user the moment it exists. That is intended and is the reason the UI must label it as public.

Two consequences worth stating plainly:

1. Not shipping a search box is a **UI** decision, not a data-access one. A determined client can already enumerate profiles. This spec does not make that worse, but it does not fix it either.
2. Because the handle is public from day one and labelled as such, adding a lookup surface later is not an expectation break. That was the only genuine argument for building search now, and it is satisfied by the label alone.

## Format rules

Fixed here because changing them later invalidates existing handles.

- Stored lowercase. The column holds the canonical form; there is no separate display casing.
- Allowed characters: `a-z`, `0-9`, `_`.
- Length 3–20.
- May not start or end with `_`.
- Uniqueness is on the stored (already-lowercase) value, so `Rahul` and `rahul` cannot coexist. This blocks the cheapest impersonation trick before there is any moderation tooling.
- A small reserved list is rejected: `admin`, `administrator`, `support`, `help`, `root`, `system`, `moderator`, `official`, `badminton`, `null`, `undefined`.

Input is lowercased before validation, so a user typing `Rahul_07` gets `rahul_07` rather than an error.

## Release hold

When a user changes their handle, the old one is recorded and held for 30 days. During the hold, only the original owner may re-claim it.

Without this, a user frees `rahul`, a stranger claims it, and once public profiles exist that stranger inherits an identity other people already associate with someone else. The hold is the cheapest guard against that and costs one small table.

## Data layer

### Migration `0029_usernames.sql`

Re-check `ls supabase/migrations | tail -3` immediately before applying. Concurrent sessions have collided on numbering repeatedly in this project, and one such collision (`0026` claimed by both `avatar_storage` and `leave_club`) caused `supabase db push` to silently skip a migration entirely — the version string was already in the ledger, so the second file was treated as applied. `0028` is now `0028_leave_club.sql`, so usernames takes `0029`.

```sql
-- 0029_usernames.sql
-- A globally unique, human-typeable handle per account. Identity only:
-- no lookup surface ships with this.

alter table public.profiles add column if not exists username text;

create table if not exists public.username_history (
  username text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  released_at timestamptz not null default now()
);

create index if not exists username_history_released
  on public.username_history (released_at);

alter table public.username_history enable row level security;
-- Writes go only through set_username. Reads are not needed by any client;
-- the availability check happens inside the security-definer RPC.

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
-- account wins an unsuffixed handle — arbitrary but stable and defensible.
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
```

The seed is `display_name` only. Email is deliberately not used as a fallback: deriving a public handle from the local part of an email address leaks the address to anyone who can read `profiles`. Accounts with an empty or unusable `display_name` get `player`, `player1`, `player2`, and so on, and can change it.

### New-user trigger

`handle_new_user` already runs on `auth.users` insert. It gains a username so no account can ever exist without one.

> **Correction — this section shipped a defect.** As originally written, this spec printed a `handle_new_user` body copied from `0001_init.sql` and described the function as one that "seeds `display_name` and `avatar_url`". That description was stale as of `0010_personal_clubs.sql`. The live function at the time also created a Personal club and an owner `club_members` row (`0010`, restored by `0020`) and coalesced a null email before `split_part` (`0019`).
>
> `0029` and `0030` were written from this spec and dropped both fixes in production: new accounts got no Personal club (and so could not create a standalone tournament, since `tournaments.club_id` is NOT NULL), and anonymous sign-in 500'd on the `display_name` NOT NULL constraint. `0031_handle_new_user_restore.sql` repairs both and backfills the gap.
>
> Note `0020`'s own header records `0019` making this identical mistake. That makes this the *third* from-scratch rewrite of this function to silently drop an earlier fix. **Never write this function from a spec, a memory, or `0001_init.sql`.** Read every migration that has defined it — currently `0001`, `0010`, `0019`, `0020`, `0029`, `0030`, `0031` — and treat the newest as the base. `0031`'s header comment carries that history.

The username seeding this spec actually calls for is one added argument to the profile insert:

```sql
    public.generate_username(nullif(trim(v_name), ''))
```

where `v_name` is the function's existing display-name expression. See `0031_handle_new_user_restore.sql` for the authoritative body.

The email local part *can* reach the seed, because `display_name` itself already defaults to it — that exposure predates this change and is not made worse.

### `set_username` RPC

The profile screen's `update` grant on `profiles` is broad (`for update using (id = auth.uid())`), which would let a client set any value that satisfies the check constraint — bypassing the release hold and writing no history row. Leaving that path merely "unused by the app" is not enough, so the column is closed at the privilege level and the RPC, running as the table owner, remains the only writer:

```sql
revoke update (username) on public.profiles from authenticated;
```

The rest of the row (`display_name`, `age`, `hand`, `avatar_url`) keeps its existing table-wide update grant, so `setDisplayName`, `completeOnboarding`, `setProfileDetails`, and the avatar functions are unaffected.

```sql
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

  -- A released handle is held for 30 days, and only its previous owner may
  -- re-claim it during the hold.
  select profile_id into v_holder from username_history
  where username = v_next and released_at > now() - interval '30 days';
  if v_holder is not null and v_holder <> v_uid then
    raise exception 'That username is taken';
  end if;

  insert into username_history (username, profile_id, released_at)
  values (v_current, v_uid, now())
  on conflict (username) do update
    set profile_id = excluded.profile_id, released_at = excluded.released_at;

  delete from username_history where username = v_next;

  update profiles set username = v_next where id = v_uid;
  return v_next;
end $$;
```

Two notes on the error text: "That username is taken" is returned for both a live handle and a held one, so the hold does not become a way to probe who used to own what. And the `delete` on claim keeps the history table from blocking the owner's own re-claim on a later change.

## App layer

### `src/repos/profileRepo.ts`

- `Profile` gains `username: string`.
- `getMyProfile()` selects `username` and maps it.
- New:

```ts
/** Change the signed-in user's handle. Returns the canonical (lowercased) value. */
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

It follows the existing convention in this file: guard on `supabase`, throw `error.message` verbatim so the RPC's wording reaches the toast, then notify `listeners` so the root Gate re-reads.

### `src/lib/validate.ts`

Add `validateUsername(raw: string): string | null`, returning an error string or `null`. It mirrors `is_valid_username` so the user sees the problem before a round-trip. The RPC stays the authority — the client check is a convenience, not a gate.

### `app/(app)/profile.tsx`

- Show `@{username}` under the display name.
- Tapping it opens the existing `Sheet` pattern with a text input, prefilled with the current handle, lowercasing as the user types.
- Helper text under the input: *"Your username is public. Other players can find you by it."* This is the whole expectation-setting mechanism, and it must ship even though nothing can search yet.
- Inline error from `validateUsername` on change; server errors surface via the existing toast.
- Save is disabled while the value is unchanged or invalid.

### Onboarding

Untouched. `app/welcome.tsx` and `completeOnboarding` keep collecting name, age, and hand. The username already exists by then, assigned by the trigger. Nobody is blocked by a new screen.

## Error handling

| Case | Where caught | User sees |
| --- | --- | --- |
| Malformed input | client `validateUsername`, then RPC | inline: "3-20 characters, using letters, numbers, and underscores" |
| Reserved word | RPC | same message as malformed (reserved words are not enumerated back to the client) |
| Already taken, live | RPC | "That username is taken" |
| Held by someone else's release | RPC | "That username is taken" — deliberately indistinguishable from live |
| Not signed in | repo guard, then RPC | "Sign in to change your username" |
| Offline / `supabase` null | repo guard | "Sign in to change your username" |

The unique index is the real arbiter under a race; the pre-check exists to produce a friendly message in the common case. If two clients claim the same handle simultaneously, the loser gets the Postgres unique-violation message. That is acceptable for the volume this app sees, and the message is still an error toast rather than a silent failure.

## Testing

New `tests/username.test.ts`, following the established factory-mock pattern (`jest.mock("../src/lib/supabase", ...)`):

- `setUsername` calls `rpc("set_username", { p_username })` with the value lowercased and trimmed.
- `setUsername` throws the RPC's message verbatim when the RPC errors.
- `setUsername` notifies profile subscribers on success.
- `getMyProfile` maps `username` off the selected row.

Extend `tests/validate.test.ts` (or add alongside it) for `validateUsername`:

- accepts `abc`, `rahul_07`, a 20-character handle
- rejects 2 characters, 21 characters, `_rahul`, `rahul_`, `rah ul`, `rahul!`, `admin`

The SQL is verified by applying the migration to the live project and confirming: every pre-existing profile has a non-null unique username; a new signup receives one automatically; a change records the old handle in `username_history`; and a second account cannot claim a handle released less than 30 days ago.

## Manual verification

1. Apply the migration. Confirm `select count(*) from profiles where username is null` returns 0.
2. Confirm no duplicates: `select username, count(*) from profiles group by 1 having count(*) > 1` returns no rows.
3. On device, open the profile screen — the handle is visible under the name.
4. Change it. Confirm the new handle shows and a `username_history` row exists for the old one.
5. Change it back. Confirm the owner can re-claim within the hold.
6. From a second account, attempt to claim the released handle. Confirm it is rejected.
7. Sign up a fresh account. Confirm it lands with a username, with no extra onboarding step.
8. Confirm the direct path is closed: a signed-in client running `update profiles set username = '...' where id = auth.uid()` is rejected on privileges, not silently accepted.

## Follow-on work this unblocks

None of these are designed here; they are listed so the shape above can be judged against where it leads.

- Add-by-username on the club and tournament roster screens, replacing "share a link and wait".
- A public profile screen with cross-club stats.
- Guest promotion: linking a `club_players` row to a real account, preserving match history.
- Any social surface where a person needs to be nameable outside a club.
