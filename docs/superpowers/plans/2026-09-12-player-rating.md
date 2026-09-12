# Player Skill Rating (ELO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the dormant `club_players.rating` column with a server-side ELO trigger, and surface each player's per-club rating on the profile screen.

**Architecture:** A Postgres `BEFORE UPDATE` trigger on `public.matches` fires once per match when it transitions to `status = 'completed'`, computing a standard ELO delta from the two sides' average `club_players.rating` and applying it symmetrically. A new `matches.rated` boolean guards against re-applying on sync retries. The profile screen gets a new live (non-cached) query for the signed-in player's rating in every club they belong to, rendered as a row of stat boxes below the existing win-rate grid.

**Tech Stack:** Supabase Postgres (SQL migration, plpgsql trigger function), React Native / Expo Router, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-09-12-player-rating-design.md`

## Global Constraints

- ELO math lives only in the SQL trigger — no parallel JS implementation (spec "Architecture").
- K-factor is 32, fixed (spec "Architecture").
- Guest matches and forfeited matches never update rating — guests have no `club_player_id` (structural), forfeits never reach `status = 'completed'` (spec "Non-goals").
- No provisional-rating gating on display — always show the number (spec "Non-goals").
- No re-rating on edit/undo — `matches.status` has no path back out of `'completed'` (spec "Non-goals").
- Trigger function must be `security definer` with `set search_path = public`, and `execute` revoked from `public`, `anon`, `authenticated` — matches the convention in `supabase/migrations/0046_open_sessions.sql`.

---

### Task 1: ELO rating trigger migration

**Files:**
- Create: `supabase/migrations/0047_player_rating.sql`
- Test: `tests/schema.playerRating.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `public.matches.rated` column; `public.apply_match_rating()` trigger function; `matches_apply_rating` trigger. Task 2 does not consume these directly (it reads `club_players.rating`, which already existed) but relies on this task being the only writer of that column going forward.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0047_player_rating.sql`:

```sql
-- 0047_player_rating.sql
-- Wires up club_players.rating (present since 0001_init.sql, never written or
-- read until now) with a standard ELO update, applied once per completed
-- match. See docs/superpowers/specs/2026-09-12-player-rating-design.md.

alter table public.matches add column rated boolean not null default false;

create or replace function public.apply_match_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k constant numeric := 32;
  ids_a uuid[];
  ids_b uuid[];
  rating_a numeric;
  rating_b numeric;
  expected_a numeric;
  actual_a numeric;
  delta numeric;
begin
  if new.status <> 'completed' or old.rated or new.winner is null then
    return new;
  end if;

  select array_agg((p->>'club_player_id')::uuid) into ids_a
    from jsonb_array_elements(new.side_a) p;
  select array_agg((p->>'club_player_id')::uuid) into ids_b
    from jsonb_array_elements(new.side_b) p;

  -- Guest/quick matches or any side missing a club_player_id can't be rated.
  if ids_a is null or ids_b is null
     or array_position(ids_a, null) is not null
     or array_position(ids_b, null) is not null then
    new.rated := true;
    return new;
  end if;

  select avg(rating) into rating_a from public.club_players where id = any(ids_a);
  select avg(rating) into rating_b from public.club_players where id = any(ids_b);

  expected_a := 1 / (1 + power(10, (rating_b - rating_a) / 400));
  actual_a := case when new.winner = 'A' then 1 else 0 end;
  delta := round(k * (actual_a - expected_a));

  update public.club_players set rating = rating + delta where id = any(ids_a);
  update public.club_players set rating = rating - delta where id = any(ids_b);

  new.rated := true;
  return new;
end;
$$;

revoke execute on function public.apply_match_rating() from public, anon, authenticated;

create trigger matches_apply_rating
  before update on public.matches
  for each row
  when (new.status = 'completed' and not old.rated)
  execute function public.apply_match_rating();
```

- [ ] **Step 2: Write the failing test**

Create `tests/schema.playerRating.test.ts`:

```typescript
import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "0047_player_rating.sql"),
  "utf8",
);

test("adds the rated column, defaulting false", () => {
  expect(sql).toMatch(/add column rated\s+boolean not null default false/);
});

test("apply_match_rating is security definer with a pinned search_path", () => {
  const fn = sql.slice(sql.indexOf("function public.apply_match_rating"));
  expect(fn).toMatch(/security definer/);
  expect(fn).toMatch(/set search_path = public/);
});

test("execute is revoked from public, anon, and authenticated", () => {
  expect(sql).toMatch(/revoke execute on function public\.apply_match_rating\(\)\s+from public, anon, authenticated/);
});

test("trigger fires before update, guarded on completed status and not-yet-rated", () => {
  const trigger = sql.slice(sql.indexOf("create trigger matches_apply_rating"));
  expect(trigger).toMatch(/before update on public\.matches/);
  expect(trigger).toMatch(/when \(new\.status = 'completed' and not old\.rated\)/);
});

test("uses the standard ELO expected-score formula", () => {
  expect(sql).toMatch(/1 \/ \(1 \+ power\(10, \(rating_b - rating_a\) \/ 400\)\)/);
});

test("applies the delta symmetrically to both sides", () => {
  expect(sql).toMatch(/set rating = rating \+ delta where id = any\(ids_a\)/);
  expect(sql).toMatch(/set rating = rating - delta where id = any\(ids_b\)/);
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx jest tests/schema.playerRating.test.ts`
Expected: all 5 tests PASS (the SQL file already contains everything they check, since Step 1 wrote it first — this test suite is a structural guard against future regressions, not TDD-red-then-green for the SQL itself, matching the existing `tests/schema.openSessions.test.ts` pattern).

- [ ] **Step 4: Apply the migration to the linked Supabase project**

Run: `npx supabase db push`
Expected: `0047_player_rating.sql` listed as applied, no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0047_player_rating.sql tests/schema.playerRating.test.ts
git commit -m "feat(db): apply ELO rating on completed matches

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Show per-club rating on the profile screen

**Files:**
- Modify: `src/repos/clubRepo.ts` — add `ClubRating` type and `listMyClubRatings()`
- Modify: `app/(app)/profile/index.tsx:11-12` (imports), `:239-243` (load), `:421-428` (render), `:606-619` (styles)
- Test: `tests/clubRatings.test.ts`

**Interfaces:**
- Consumes: `getMyProfile()` from `src/repos/profileRepo.ts` (returns `Profile | null`, used for `.id`); `supabase` client from `src/lib/supabase.ts`.
- Produces: `export type ClubRating = { clubId: string; clubName: string; rating: number }` and `export async function listMyClubRatings(): Promise<ClubRating[]>` from `src/repos/clubRepo.ts`, consumed by the profile screen.

- [ ] **Step 1: Write the failing test**

Create `tests/clubRatings.test.ts`:

```typescript
import { listMyClubRatings } from "../src/repos/clubRepo";

jest.mock("../src/lib/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("../src/repos/profileRepo", () => ({ getMyProfile: jest.fn() }));

import { supabase } from "../src/lib/supabase";
import { getMyProfile } from "../src/repos/profileRepo";

const mockedGetMyProfile = getMyProfile as jest.Mock;
const mockedFrom = supabase!.from as jest.Mock;

beforeEach(() => {
  mockedGetMyProfile.mockReset();
  mockedFrom.mockReset();
});

test("returns one rating row per club, mapping the embedded club object", async () => {
  mockedGetMyProfile.mockResolvedValue({ id: "profile-1" });
  mockedFrom.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({
        data: [
          { rating: 1512, clubs: { id: "club-a", name: "Alpha" } },
          { rating: 1488, clubs: { id: "club-b", name: "Beta" } },
        ],
        error: null,
      }),
    }),
  });

  const result = await listMyClubRatings();
  expect(result).toEqual([
    { clubId: "club-a", clubName: "Alpha", rating: 1512 },
    { clubId: "club-b", clubName: "Beta", rating: 1488 },
  ]);
});

test("unwraps an array-form embedded club (PostgREST cardinality quirk)", async () => {
  mockedGetMyProfile.mockResolvedValue({ id: "profile-1" });
  mockedFrom.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({
        data: [{ rating: 1500, clubs: [{ id: "club-a", name: "Alpha" }] }],
        error: null,
      }),
    }),
  });

  const result = await listMyClubRatings();
  expect(result).toEqual([{ clubId: "club-a", clubName: "Alpha", rating: 1500 }]);
});

test("returns an empty array when signed out", async () => {
  mockedGetMyProfile.mockResolvedValue(null);
  const result = await listMyClubRatings();
  expect(result).toEqual([]);
  expect(mockedFrom).not.toHaveBeenCalled();
});

test("returns an empty array on a query error", async () => {
  mockedGetMyProfile.mockResolvedValue({ id: "profile-1" });
  mockedFrom.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({ data: null, error: new Error("network") }),
    }),
  });
  const result = await listMyClubRatings();
  expect(result).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/clubRatings.test.ts`
Expected: FAIL — `listMyClubRatings` is not exported from `../src/repos/clubRepo`.

- [ ] **Step 3: Implement `listMyClubRatings` in `src/repos/clubRepo.ts`**

Add near `listMyClubPlayers` (after line 190):

```typescript
export type ClubRating = { clubId: string; clubName: string; rating: number };

/** This player's rating in every club they belong to. Live query, not cached
 *  like club_players_cache — rating changes server-side (the matches_apply_rating
 *  trigger) and the profile screen has no offline requirement to preserve. */
export async function listMyClubRatings(): Promise<ClubRating[]> {
  if (!supabase) return [];
  const { getMyProfile } = await import("./profileRepo");
  const me = await getMyProfile();
  if (!me) return [];

  const { data, error } = await supabase
    .from("club_players")
    .select("rating, clubs(id, name)")
    .eq("profile_id", me.id);
  if (error || !data) return [];

  const out: ClubRating[] = [];
  for (const row of data as { rating: number; clubs: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const club = Array.isArray(row.clubs) ? row.clubs[0] : row.clubs;
    if (!club) continue;
    out.push({ clubId: club.id, clubName: club.name, rating: row.rating });
  }
  return out;
}
```

Use a dynamic `import("./profileRepo")` for `getMyProfile` (rather than a top-level import) only if a circular-import check in Step 4 finds `profileRepo.ts` imports anything from `clubRepo.ts`; otherwise use a normal top-level `import { getMyProfile } from "./profileRepo";` alongside the existing imports at the top of the file — prefer the plain top-level import unless the check says otherwise.

- [ ] **Step 4: Check for a circular import before finalizing the import style**

Run: `grep -n "clubRepo" src/repos/profileRepo.ts`
Expected: no output. If there is output, keep the dynamic `import()` from Step 3; if there is none, replace it with a top-level `import { getMyProfile } from "./profileRepo";` added to the existing import block at the top of `src/repos/clubRepo.ts`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/clubRatings.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 6: Render the rating row on the profile screen**

In `app/(app)/profile/index.tsx`, add the import (near line 12):

```typescript
import { listMyClubRatings, type ClubRating } from "../../../src/repos/clubRepo";
```

Add state (near line 31):

```typescript
const [ratings, setRatings] = useState<ClubRating[]>([]);
```

Extend the existing `load` callback (replace lines 241-243):

```typescript
const load = useCallback(() => {
  void getPlayerAnalytics(me).then(setA);
  void listMyClubRatings().then(setRatings);
}, [me]);
useFocusEffect(load);
useEffect(load, [load]);
```

Add the rendered row after the existing stat grid (replace lines 421-428, keeping the existing four `Stat` cells unchanged and adding the new block after the closing `</View>`):

```tsx
      {/* Headline stats */}
      <View style={s.statGrid}>
        <Stat label="Played" value={a?.played ?? 0} />
        <Stat label="Won" value={a?.wins ?? 0} accent />
        <Stat label="Lost" value={a?.losses ?? 0} />
        <Stat label="Win %" value={formatWinRate(a?.played ?? 0, a?.winPct ?? 0)} accent />
      </View>

      {ratings.length > 0 && (
        <View style={s.ratingGrid}>
          {ratings.map((r) => (
            <Stat key={r.clubId} label={r.clubName} value={r.rating} />
          ))}
        </View>
      )}
```

Add the style (near line 616, alongside `statGrid`):

```typescript
  ratingGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
```

- [ ] **Step 7: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/repos/clubRepo.ts app/\(app\)/profile/index.tsx tests/clubRatings.test.ts
git commit -m "feat(profile): show per-club ELO rating

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `rated` column + trigger, ELO formula, doubles equal-split, forfeit/guest exclusion, security-definer/revoke convention → Task 1.
- Profile display, per-club (not aggregate), no provisional gating → Task 2.
- "No JS ELO implementation" → satisfied; Task 2 only reads `rating`, never computes a delta.
- `tests/schema.playerRating.test.ts` pattern matches the spec's named precedent (`tests/schema.openSessions.test.ts`).

**Placeholder scan:** none — every step has literal code, exact file paths and line numbers, and a runnable command with an expected result.

**Type consistency:** `ClubRating` (`clubId`, `clubName`, `rating: number`) is defined once in Task 2 Step 3 and used identically in the test (Step 1) and the render code (Step 6). `listMyClubRatings` signature (`(): Promise<ClubRating[]>`) matches its only two call sites (the test file and the profile screen).
