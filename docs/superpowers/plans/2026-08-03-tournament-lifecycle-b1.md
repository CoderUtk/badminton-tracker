# Tournament Lifecycle (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split a tournament into `draft` and `live`, building the bracket at start time sized to the entrants who actually joined, and give every user a hidden personal club so tournaments never need a real one.

**Architecture:** Two migrations (personal clubs; `start_tournament` RPC). One new pure module (`src/tournament/draw.ts`). `createTournament` stops building the bracket; a new `startTournament` builds it in TypeScript and hands it to the RPC as `jsonb` for atomic insert. The bracket screen branches on status.

**Tech Stack:** TypeScript, Expo SDK 57, expo-router, Supabase (Postgres + RLS + PL/pgSQL), expo-sqlite, Jest.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code.
- Gate every task on `npx tsc --noEmit && npm test`. Both must pass before commit.
- Supabase writes must `.select()` and throw on zero rows — RLS blocks report success otherwise.
- RPCs are `security definer` with `set search_path = public`.
- Never add a column to both `TOURNAMENT_DDL` and an ALTER list (see `tests/schema.tournaments.test.ts`).
- Local SQLite schema changes ship as a NEW entry appended to `MIGRATIONS` in `src/db/db.ts`, never an edit to an applied one.
- `BracketSize` is `4 | 8 | 16 | 32 | 64`. There is no 2.
- Do not add a `Co-Authored-By` trailer to commits.

---

### Task 1: Draw size and start eligibility

**Files:**
- Create: `src/tournament/draw.ts`
- Test: `tests/draw.test.ts`

**Interfaces:**
- Consumes: `BracketSize` from `src/tournament/types`; `MatchType` from `src/repos/tournamentRepo`.
- Produces: `drawSizeFor(entrants: number): BracketSize`, `startBlocker(players: number, matchType: MatchType): string | null`.

Pure, no dependencies. Both the Start button and the RPC guard derive from these rules, so they live in one place.

- [ ] **Step 1: Write the failing tests**

Create `tests/draw.test.ts`:

```ts
import { drawSizeFor, startBlocker } from "../src/tournament/draw";

test("exact powers of two pass through unchanged", () => {
  expect(drawSizeFor(4)).toBe(4);
  expect(drawSizeFor(8)).toBe(8);
  expect(drawSizeFor(64)).toBe(64);
});

test("rounds up to the next power of two, leaving byes", () => {
  expect(drawSizeFor(5)).toBe(8);
  expect(drawSizeFor(6)).toBe(8);
  expect(drawSizeFor(9)).toBe(16);
  expect(drawSizeFor(33)).toBe(64);
});

test("floors at 4 because BracketSize has no 2", () => {
  expect(drawSizeFor(1)).toBe(4);
  expect(drawSizeFor(2)).toBe(4);
  expect(drawSizeFor(3)).toBe(4);
});

test("singles needs four players", () => {
  expect(startBlocker(3, "singles")).toBe("Add at least 4 players to start");
  expect(startBlocker(4, "singles")).toBeNull();
});

test("doubles needs six players, since four is a single final", () => {
  expect(startBlocker(4, "doubles")).toBe("Add at least 6 players to start");
  expect(startBlocker(5, "doubles")).toBe("Add at least 6 players to start");
  expect(startBlocker(6, "doubles")).toBeNull();
});

test("doubles requires complete pairs", () => {
  expect(startBlocker(7, "doubles")).toBe("Pair every player to start");
});

test("rejects more entrants than the largest draw", () => {
  // 64 is the largest BracketSize; silently capping would drop players who
  // had already joined.
  expect(startBlocker(65, "singles")).toBe("A tournament holds at most 64 entrants");
  expect(startBlocker(130, "doubles")).toBe("A tournament holds at most 64 entrants");
  expect(startBlocker(128, "doubles")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/draw.test.ts`
Expected: FAIL — cannot find module `../src/tournament/draw`.

- [ ] **Step 3: Implement**

Create `src/tournament/draw.ts`:

```ts
import type { BracketSize } from "./types";
import type { MatchType } from "../repos/tournamentRepo";

const SIZES: BracketSize[] = [4, 8, 16, 32, 64];

/**
 * Smallest draw that holds `entrants`. Anything short of the draw becomes a
 * bye, which buildBracket already auto-advances.
 *
 * Floors at 4: BracketSize has no 2, and the startBlocker minimums guarantee
 * at least 3 entrants before this is ever called in anger.
 */
export function drawSizeFor(entrants: number): BracketSize {
  return SIZES.find((s) => s >= entrants) ?? 64;
}

/**
 * Why this tournament cannot start yet, or null when it can. Shared by the
 * Start button and the start_tournament guard so the UI and the database
 * cannot disagree about the rule.
 *
 * `players` counts people, not entrants: a doubles entrant is two players.
 */
export function startBlocker(players: number, matchType: MatchType): string | null {
  const perEntrant = matchType === "doubles" ? 2 : 1;
  const min = matchType === "doubles" ? 6 : 4;
  if (players < min) return `Add at least ${min} players to start`;
  if (players % perEntrant !== 0) return "Pair every player to start";
  if (players / perEntrant > 64) return "A tournament holds at most 64 entrants";
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/draw.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm test
git add src/tournament/draw.ts tests/draw.test.ts
git commit -m "feat(tournaments): derive draw size and start eligibility"
```

---

### Task 2: Hidden personal clubs

**Files:**
- Create: `supabase/migrations/0010_personal_clubs.sql`
- Modify: `src/repos/clubRepo.ts`
- Modify: `src/db/schema.ts`, `src/db/db.ts`
- Modify: `app/(app)/index.tsx`
- Test: `tests/schema.tournaments.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Club` gains `personal: boolean`; `listClubs()` still returns every club including personal ones; new `listRealClubs(): Promise<Club[]>` returns only `personal = false`.

**Why both:** `listAllTournaments` must query personal clubs or standalone tournaments vanish from Cups. Home and every picker must exclude them or a phantom club appears for everyone.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_personal_clubs.sql`:

```sql
-- Every user gets one hidden club that owns their standalone tournaments.
-- This keeps tournaments.club_id NOT NULL and leaves every existing RLS
-- policy, club_players row, and match insert working untouched, while the UI
-- never shows a club.
alter table public.clubs add column if not exists personal boolean not null default false;

-- Extend the signup trigger. handle_new_user is already security definer, so
-- RLS does not block these inserts. The profile row must exist first:
-- clubs.created_by references profiles (id).
-- The profiles insert is copied verbatim from 0001_init.sql:14-19, which is
-- still the live definition (0003 only mentions the trigger in a comment).
-- It must not change: it prefills display_name from the provider's full_name
-- and carries avatar_url across, and a simplified version would silently lose
-- both for every Google sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.clubs (name, created_by, personal)
  values ('Personal', new.id, true)
  returning id into v_club;

  insert into public.club_members (club_id, profile_id, role)
  values (v_club, new.id, 'owner');

  return new;
end $$;

-- Backfill. The trigger only helps accounts created after this migration;
-- without this, every existing user has no personal club and standalone
-- tournament creation fails outright for them.
do $$
declare
  p record;
  v_club uuid;
begin
  for p in
    select pr.id from public.profiles pr
    where not exists (
      select 1 from public.clubs c
      where c.created_by = pr.id and c.personal
    )
  loop
    insert into public.clubs (name, created_by, personal)
    values ('Personal', p.id, true)
    returning id into v_club;
    insert into public.club_members (club_id, profile_id, role)
    values (v_club, p.id, 'owner')
    on conflict do nothing;
  end loop;
end $$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Add the local column**

In `src/db/schema.ts`, append a new constant (never edit an applied one):

```ts
// Personal-club flag. A SEPARATE migration entry appended to the list in
// db.ts — editing an applied migration does not re-run it, so existing
// installs would never get the column.
export const CLUBS_PERSONAL_DDL = `
ALTER TABLE clubs_cache ADD COLUMN personal INTEGER NOT NULL DEFAULT 0;
`;
```

In `src/db/db.ts`, import it and append `CLUBS_PERSONAL_DDL` to `MIGRATIONS`.

- [ ] **Step 4: Update the repo**

In `src/repos/clubRepo.ts`, add `personal: boolean` to the `Club` interface, carry the column through `refreshClubs`'s upsert into `clubs_cache`, and add:

```ts
/**
 * Clubs the user actually joined or created, excluding their hidden personal
 * club. Use this for anything the user sees; listClubs still returns
 * everything, because listAllTournaments must query personal clubs too.
 */
export async function listRealClubs(): Promise<Club[]> {
  return (await listClubs()).filter((c) => !c.personal);
}
```

SQLite has no boolean: read `personal` as `0 | 1` and map to boolean in `listClubs`.

- [ ] **Step 5: Hide it on Home**

In `app/(app)/index.tsx`, swap `listClubs()` for `listRealClubs()` so the personal club never appears in "Your clubs".

- [ ] **Step 6: Guard the schema rule**

Add to `tests/schema.tournaments.test.ts`:

```ts
import { CLUBS_PERSONAL_DDL } from "../src/db/schema";

test("the personal flag ships as its own migration", () => {
  expect(CLUBS_PERSONAL_DDL).toMatch(/ALTER TABLE clubs_cache ADD COLUMN personal/);
});
```

- [ ] **Step 7: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0010_personal_clubs.sql src/db/schema.ts src/db/db.ts src/repos/clubRepo.ts "app/(app)/index.tsx" tests/schema.tournaments.test.ts
git commit -m "feat(clubs): hidden personal club per user"
```

- [ ] **Step 8: Verify the backfill on device**

Sign in with the existing account and confirm Home shows the same clubs as before — no "Personal" entry — and that the account has a personal club (creating a tournament in Task 4 will prove it).

---

### Task 3: Creating leaves a draft

**Files:**
- Modify: `src/repos/tournamentRepo.ts`
- Modify: `app/(app)/tournaments/new.tsx`
- Modify: `app/(app)/tournaments/index.tsx`

**Interfaces:**
- Consumes: `listRealClubs`, `Club.personal` from Task 2.
- Produces: `createTournament(name, matchType, bestOf, finalsBestOf, entrants, courts?)` — **`clubId` and `size` are gone**. It resolves the personal club itself and inserts no bracket rows.

- [ ] **Step 1: Stop building the bracket at creation**

In `src/repos/tournamentRepo.ts`, rewrite `createTournament`:

- drop the `clubId` and `size` parameters;
- resolve the club with `(await listClubs()).find((c) => c.personal)`, throwing `"No personal club — sign out and back in"` when absent (the backfill missed them);
- insert the tournament with `status: 'draft'` and `size: 0`, since the draw is not known yet;
- insert `tournament_entrants` exactly as today;
- **delete** the `buildBracket` call and the `bracket_matches` insert;
- keep returning the new id.

- [ ] **Step 2: Drop draw size from the create screen**

In `app/(app)/tournaments/new.tsx`:

- remove the `SIZES` constant, the `size` state, and the "Draw size" `Segmented`;
- `cap` no longer exists — entrant selection is limited only by `startBlocker`'s 64-entrant ceiling, so replace the `picked.length < cap` guard in `toggle` with `picked.length < 128` (64 doubles pairs);
- replace `canCreate`'s size checks with `nameError === null && picked.length > 0 && picked.length % perEntrant === 0`. Creating a draft has no minimum; **starting** does. A tournament may be created with one player and filled later.
- update the entrants heading to show the implied draw: `` `Pick entrants (${entrantCount} → ${drawSizeFor(entrantCount)} draw)` ``;
- pass no `clubId` or `size` to `createTournament`.

- [ ] **Step 3: Remove the club picker**

In `app/(app)/tournaments/index.tsx`, delete the `pickingClub` state, the picker `Sheet`, and the `onNew` branch. "New tournament" navigates straight to `/tournaments/new`. Gate the button on nothing — every user has a personal club.

The `clubId` query param and `listClubs` import go with it. Keep the club-name subtitle on rows: a tournament in a real club still shows it, and personal-club tournaments show nothing because the name is only rendered when non-empty — **update `listAllTournaments` to map personal clubs to `""`** so "Personal" never leaks into the UI.

The row subtitle currently reads `` `${item.size}-player · ${item.status}` ``, which renders "0-player · draft" now that `size` is not known until start. Show the draw only once it exists:

```tsx
<Text style={s.meta}>
  {item.clubName ? `${item.clubName} · ` : ""}
  {item.status === "draft" ? "Draft" : `${item.size}-player · ${item.status}`}
</Text>
```

- [ ] **Step 4: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add src/repos/tournamentRepo.ts "app/(app)/tournaments/new.tsx" "app/(app)/tournaments/index.tsx"
git commit -m "feat(tournaments): create a draft without a bracket or a club"
```

---

### Task 4: Starting builds the bracket

**Files:**
- Create: `supabase/migrations/0011_start_tournament.sql`
- Modify: `src/repos/tournamentRepo.ts`
- Modify: `app/(app)/tournaments/[id].tsx`

**Interfaces:**
- Consumes: `drawSizeFor`, `startBlocker` from Task 1; `buildBracket` from `src/tournament/bracket`; `bracketMatchToRow` from `src/tournament/rows`.
- Produces: `startTournament(id: string): Promise<void>`.

- [ ] **Step 1: Write the RPC**

Create `supabase/migrations/0011_start_tournament.sql`:

```sql
-- Start a draft: insert its bracket and flip it live, in one transaction.
-- A half-built bracket left in draft would be unrecoverable through the UI.
--
-- The bracket arrives as jsonb from the client rather than being rebuilt here.
-- Seeding lives once, in the tested TypeScript buildBracket, instead of in two
-- languages that must stay byte-identical. Seeding order is a draw, not a
-- permission, so a client that shuffles it harms only itself; every guard that
-- protects other people's data is below and stays in SQL.
create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_bracket jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_status text;
  v_type text;
  v_entrants int;
  v_players int;
  v_draw int;
begin
  select club_id, status, match_type into v_club, v_status, v_type
  from tournaments where id = p_tournament_id;

  if v_club is null then
    raise exception 'Tournament not found';
  end if;
  if not is_club_admin(v_club) then
    raise exception 'Only an admin can start this tournament';
  end if;
  -- Blocks a second start from rebuilding a live bracket over played results.
  if v_status <> 'draft' then
    raise exception 'This tournament has already started';
  end if;

  select count(*) into v_entrants from tournament_entrants
  where tournament_id = p_tournament_id;

  v_players := v_entrants * (case when v_type = 'doubles' then 2 else 1 end);
  if v_type = 'doubles' and v_players < 6 then
    raise exception 'Add at least 6 players to start';
  end if;
  if v_type <> 'doubles' and v_players < 4 then
    raise exception 'Add at least 4 players to start';
  end if;
  if v_entrants > 64 then
    raise exception 'A tournament holds at most 64 entrants';
  end if;

  v_draw := 4;
  while v_draw < v_entrants loop v_draw := v_draw * 2; end loop;

  -- Validate the client payload rather than trusting it.
  if jsonb_array_length(p_bracket) <> v_draw - 1 then
    raise exception 'Bracket does not match the draw size';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_bracket) e
    where (e->>'entrant_a') is not null
      and (e->>'entrant_a')::uuid not in (
        select id from tournament_entrants where tournament_id = p_tournament_id)
  ) or exists (
    select 1 from jsonb_array_elements(p_bracket) e
    where (e->>'entrant_b') is not null
      and (e->>'entrant_b')::uuid not in (
        select id from tournament_entrants where tournament_id = p_tournament_id)
  ) then
    raise exception 'Bracket references entrants from another tournament';
  end if;

  insert into bracket_matches (id, tournament_id, round, idx, match_id, entrant_a, entrant_b, winner_entrant, court, scored_by)
  select
    (e->>'id')::uuid, p_tournament_id, (e->>'round')::int, (e->>'idx')::int,
    null, (e->>'entrant_a')::uuid, (e->>'entrant_b')::uuid,
    (e->>'winner_entrant')::uuid, null, null
  from jsonb_array_elements(p_bracket) e;

  update tournaments set size = v_draw, status = 'live' where id = p_tournament_id;
end;
$$;
```

A single-elimination draw of `n` has `n - 1` matches, which is why the row count is checked against `v_draw - 1`.

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Add the repo call**

In `src/repos/tournamentRepo.ts`:

```ts
/**
 * Build the bracket for a draft and start it. buildBracket is the same tested
 * function used before this split; it already resolves byes, so an entrant
 * count short of the draw auto-advances.
 */
export async function startTournament(id: string): Promise<void> {
  if (!supabase) throw new Error("Sign in to start a tournament");
  const { entrants } = await getTournament(id);
  const size = drawSizeFor(entrants.length);
  const bracket = buildBracket(entrants, size, id, () => Crypto.randomUUID());
  const { error } = await supabase.rpc("start_tournament", {
    p_tournament_id: id,
    p_bracket: bracket.map((m) => bracketMatchToRow(m)),
  });
  if (error) throw new Error(error.message);
}
```

Import `drawSizeFor` from `../tournament/draw`.

- [ ] **Step 4: Branch the bracket screen on status**

In `app/(app)/tournaments/[id].tsx`, hold `status` from the loaded tournament. When `status === "draft"`, render instead of `BracketView`:

- the entrant list;
- `` `${entrants.length} entrants → ${drawSizeFor(entrants.length)} draw` ``;
- for admins, a **Start tournament** button, disabled when `blocker !== null`, with the blocker text shown beneath it:

```tsx
const players = entrants.length * (matchType === "doubles" ? 2 : 1);
const blocker = startBlocker(players, matchType);
```

```tsx
<Pressable
  style={[s.start, !!blocker && s.off]}
  disabled={!!blocker}
  onPress={onStart}
>
  <Text style={s.startText}>Start tournament</Text>
</Pressable>
{blocker ? <Text style={s.err}>{blocker}</Text> : null}
```

```tsx
const onStart = async () => {
  try {
    await startTournament(id!);
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not start the tournament", "error");
  }
};
```

Share link, Pending requests, Live Ops, and the ⋮ menu stay visible in both states.

- [ ] **Step 5: Gate and commit**

```bash
npx tsc --noEmit && npm test
git add supabase/migrations/0011_start_tournament.sql src/repos/tournamentRepo.ts "app/(app)/tournaments/[id].tsx"
git commit -m "feat(tournaments): build the bracket when the tournament starts"
```

---

## Final verification

- [ ] `npx tsc --noEmit && npm test` — green
- [ ] `npx supabase db push` — `0010` and `0011` applied
- [ ] Creating a tournament never asks for a club, and Home shows no "Personal"
- [ ] A pre-existing account can create one — the backfill case
- [ ] A new tournament sits in `draft` with no bracket and shows its entrant list
- [ ] Start is refused below the minimum, with the reason shown
- [ ] Starting 6 singles entrants gives an 8-draw where two advance unopposed
- [ ] Starting twice is refused and does not rebuild the bracket
- [ ] A non-admin sees no Start button and the RPC refuses them
- [ ] Cups lists the new tournament with no club name
