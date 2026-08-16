# Player Identity and Avatar Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every aggregated player a stable identity so same-named players stop merging into one standings row, and carry each roster player's avatar URL into the local cache so cards can render photos without a network round trip.

**Architecture:** Two independent changes to the data layer, no UI redesign. `PlayerStat` gains an `id` derived from `club_player_id`, and `aggregate()` groups on it instead of on display name. Separately, the existing club-roster sync gains an embedded PostgREST select for the linked profile's `avatar_url`, flattened into a new `club_players_cache` column. Nothing in this plan changes how any card looks.

**Tech Stack:** TypeScript, Expo SDK 57, `expo-sqlite` local cache, Supabase JS client (PostgREST), Jest with `ts-jest` in a `node` environment.

**Spec:** `docs/superpowers/specs/2026-08-16-share-card-convergence-design.md` (this plan covers sub-project A only)

## Global Constraints

- Expo has changed — read https://docs.expo.dev/versions/v57.0.0/ before writing any Expo API code.
- **No new dependencies.**
- **No Supabase migration.** `public.profiles` is already selectable by authenticated non-anonymous users via `supabase/migrations/0018_anon_rls_restrictions.sql:24-26`. Do not add, edit, or widen any RLS policy. Do not create any file under `supabase/migrations/`.
- Jest is `testEnvironment: "node"` with `roots: ["<rootDir>/tests"]`. Tests cover pure logic only; React Native components and screens are never unit-tested in this repo. Do not add a component test renderer.
- Commit with an explicit pathspec every time. Never `git add -A`, `git add .`, or `git commit -a`. Quote paths containing parentheses: `git add "app/(app)/clubs/[id].tsx"`.
- Do not add a `Co-Authored-By` trailer.
- Run tests with `npm test`, a single file with `npx jest <path>`. Typecheck with `npx tsc --noEmit`, which must end clean.
- `ClubPlayer` fields are snake_case (`club_id`, `profile_id`) because rows are read with `select *` straight from SQLite. New fields follow that convention.

---

## File Structure

**Modify:**
- `src/repos/sessionRepo.ts` — `PlayerStat` gains `id`; `aggregate()` keys by it; new exported `playerStatId` helper.
- `src/db/db.ts` — `club_players_cache` gains an `avatar_url` column.
- `src/repos/clubRepo.ts` — `ClubPlayer` gains `avatar_url`; roster sync selects and stores the embedded profile avatar.
- `app/(app)/clubs/[id].tsx:96` — `keyExtractor` moves from `p.name` to `p.id`.
- `tests/share/cardData.test.ts` — `PlayerStat` fixtures gain `id`.

**Create:**
- `tests/playerIdentity.test.ts` — aggregation identity tests.
- `tests/clubRoster.test.ts` — roster avatar mapping tests.

**Read but do not modify:**
- `src/repos/matchRepo.ts` — `SidePlayer` is `{ club_player_id: string | null; name: string }`.
- `src/lib/share/cardData.ts` — `topStandings` is a pure `slice`, unaffected by the shape change.

---

## Task 1: Stable player identity in aggregation

**Files:**
- Modify: `src/repos/sessionRepo.ts:190-225`
- Modify: `app/(app)/clubs/[id].tsx:96`
- Modify: `tests/share/cardData.test.ts:22-33`
- Test: `tests/playerIdentity.test.ts`

**Interfaces:**
- Consumes: `SidePlayer` and `MatchRecord` from `src/repos/matchRepo.ts`. `SidePlayer` is `{ club_player_id: string | null; name: string }`.
- Produces:
  - `playerStatId(p: SidePlayer): string`
  - `PlayerStat` with a new leading `id: string` field.

**Why:** `aggregate()` currently builds `new Map<string, PlayerStat>()` keyed on display name (`src/repos/sessionRepo.ts:206`). Two rostered players called "Rahul" merge into one row with combined wins and losses. This is live in shipped standings on both the club screen and the session screen. `app/(app)/clubs/[id].tsx:96` compounds it by using the same name as a React list key.

- [ ] **Step 1: Write the failing tests**

Create `tests/playerIdentity.test.ts`:

```ts
import { playerStatId } from "../src/repos/sessionRepo";
import type { SidePlayer } from "../src/repos/matchRepo";

test("playerStatId uses the club player id when the player is on a roster", () => {
  const p: SidePlayer = { club_player_id: "cp-1", name: "Rahul" };
  expect(playerStatId(p)).toBe("cp-1");
});

test("playerStatId falls back to a namespaced guest key when there is no roster id", () => {
  const p: SidePlayer = { club_player_id: null, name: "Rahul" };
  expect(playerStatId(p)).toBe("guest:Rahul");
});

test("a rostered player and a guest sharing a name get different ids", () => {
  expect(playerStatId({ club_player_id: "cp-1", name: "Rahul" }))
    .not.toBe(playerStatId({ club_player_id: null, name: "Rahul" }));
});

test("two guests sharing a name get the same id, which is the accepted limitation", () => {
  expect(playerStatId({ club_player_id: null, name: "Rahul" }))
    .toBe(playerStatId({ club_player_id: null, name: "Rahul" }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/playerIdentity.test.ts`

Expected: FAIL — `playerStatId is not a function`.

- [ ] **Step 3: Add the id to `PlayerStat` and the helper**

In `src/repos/sessionRepo.ts`, replace the `PlayerStat` interface:

```ts
export interface PlayerStat {
  /**
   * Stable identity for grouping. The club_player_id when the player is on a
   * roster, otherwise `guest:<name>`.
   *
   * Grouping used to key on display name, which silently merged two players
   * called "Rahul" into a single row with their records added together.
   * Guests genuinely have no identity beyond their name, so two same-named
   * guests still merge -- they are transient, un-rostered entries and giving
   * them synthetic ids would change what a guest is.
   */
  id: string;
  name: string;
  wins: number;
  losses: number;
  played: number;
}
```

Add the helper directly above `aggregate`:

```ts
/** Grouping key for a player appearing on a match side. */
export function playerStatId(p: SidePlayer): string {
  return p.club_player_id ?? `guest:${p.name}`;
}
```

`SidePlayer` is already exported from `src/repos/matchRepo.ts`. Add it to the existing import from that module rather than creating a second import statement.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/playerIdentity.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing aggregation tests**

Append to `tests/playerIdentity.test.ts`:

```ts
import { getSessionStats } from "../src/repos/sessionRepo";
```

Rather than mocking the database, test `aggregate` through its exported surface. Export it for testing by adding this line next to `playerStatId` in `src/repos/sessionRepo.ts` (do this in Step 7, not now):

```ts
export { aggregate as aggregateForTest };
```

Append these tests:

```ts
import { aggregateForTest } from "../src/repos/sessionRepo";
import type { MatchRecord } from "../src/repos/matchRepo";

function match(a: SidePlayer[], b: SidePlayer[], winner: "A" | "B"): MatchRecord {
  return {
    id: `m-${Math.random()}`,
    club_id: "c-1",
    session_id: "s-1",
    config: {} as MatchRecord["config"],
    side_a: a,
    side_b: b,
    status: "completed",
    winner,
    score_summary: { games: [{ A: 21, B: 15 }] },
    created_at: 1,
  };
}

const rahulOne: SidePlayer = { club_player_id: "cp-1", name: "Rahul" };
const rahulTwo: SidePlayer = { club_player_id: "cp-2", name: "Rahul" };
const sameer: SidePlayer = { club_player_id: "cp-3", name: "Sameer" };

test("two rostered players sharing a name stay separate rows", () => {
  const stats = aggregateForTest([
    match([rahulOne], [sameer], "A"),
    match([rahulTwo], [sameer], "B"),
  ]);
  const rahuls = stats.players.filter((p) => p.name === "Rahul");
  expect(rahuls).toHaveLength(2);
  expect(rahuls.map((p) => p.id).sort()).toEqual(["cp-1", "cp-2"]);
  expect(rahuls.find((p) => p.id === "cp-1")!.wins).toBe(1);
  expect(rahuls.find((p) => p.id === "cp-2")!.wins).toBe(0);
});

test("a rostered player and a same-named guest stay separate", () => {
  const guest: SidePlayer = { club_player_id: null, name: "Rahul" };
  const stats = aggregateForTest([match([rahulOne], [guest], "A")]);
  expect(stats.players.filter((p) => p.name === "Rahul")).toHaveLength(2);
});

test("two same-named guests still merge, the accepted limitation", () => {
  const guest: SidePlayer = { club_player_id: null, name: "Rahul" };
  const stats = aggregateForTest([
    match([guest], [sameer], "A"),
    match([guest], [sameer], "A"),
  ]);
  expect(stats.players.filter((p) => p.name === "Rahul")).toHaveLength(1);
  expect(stats.players.find((p) => p.name === "Rahul")!.wins).toBe(2);
});

test("every returned stat carries its id", () => {
  const stats = aggregateForTest([match([rahulOne], [sameer], "A")]);
  expect(stats.players.every((p) => typeof p.id === "string" && p.id.length > 0)).toBe(true);
});

test("sort order is deterministic for identical records and names", () => {
  const first = aggregateForTest([match([rahulOne], [rahulTwo], "A")]).players.map((p) => p.id);
  const second = aggregateForTest([match([rahulOne], [rahulTwo], "A")]).players.map((p) => p.id);
  expect(first).toEqual(second);
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx jest tests/playerIdentity.test.ts`

Expected: FAIL — `aggregateForTest is not a function`.

- [ ] **Step 7: Re-key `aggregate`**

In `src/repos/sessionRepo.ts`, replace the body of `aggregate`:

```ts
/** Aggregate per-player win/loss stats across a set of completed matches. */
function aggregate(matches: MatchRecord[]): SessionStats {
  const done = matches.filter((m) => m.status === "completed");
  const byId = new Map<string, PlayerStat>();
  const bump = (p: SidePlayer, field: "wins" | "losses") => {
    const id = playerStatId(p);
    const stat = byId.get(id) ?? { id, name: p.name, wins: 0, losses: 0, played: 0 };
    stat[field] += 1;
    stat.played += 1;
    byId.set(id, stat);
  };
  let gameCount = 0;
  for (const m of done) {
    gameCount += m.score_summary?.games.length ?? 0;
    if (!m.winner) continue;
    const winners = m.winner === "A" ? m.side_a : m.side_b;
    const losers = m.winner === "A" ? m.side_b : m.side_a;
    winners.forEach((p) => bump(p, "wins"));
    losers.forEach((p) => bump(p, "losses"));
  }
  // id is the final tiebreak so two players with the same name AND the same
  // record sort deterministically rather than by Map insertion order.
  const players = [...byId.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.played - a.played ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );
  return { matchCount: done.length, gameCount, players };
}

// Exported for the node-env unit tests; not part of the module's public API.
export { aggregate as aggregateForTest };
```

- [ ] **Step 8: Run to verify they pass**

Run: `npx jest tests/playerIdentity.test.ts`

Expected: PASS, 9 tests total.

- [ ] **Step 9: Fix the React list key**

In `app/(app)/clubs/[id].tsx`, line 96, change:

```tsx
      keyExtractor={(p) => p.name}
```

to:

```tsx
      keyExtractor={(p) => p.id}
```

Two rostered players with the same name previously produced duplicate React keys in this list.

- [ ] **Step 10: Update the existing `PlayerStat` fixtures**

In `tests/share/cardData.test.ts`, the two `PlayerStat[]` literals (around lines 22 and 32) now need `id`. Replace the fixture at line 22:

```ts
  const players: PlayerStat[] = [
    { id: "cp-a", name: "A", wins: 5, losses: 1, played: 6 },
    { id: "cp-b", name: "B", wins: 4, losses: 2, played: 6 },
    { id: "cp-c", name: "C", wins: 3, losses: 3, played: 6 },
    { id: "cp-d", name: "D", wins: 2, losses: 4, played: 6 },
  ];
```

and the one at line 32:

```ts
  const players: PlayerStat[] = [{ id: "cp-a", name: "A", wins: 1, losses: 0, played: 1 }];
```

- [ ] **Step 11: Typecheck and run the full suite**

Run: `npx tsc --noEmit`

Expected: zero errors. If any other construction site of `PlayerStat` surfaces, fix it the same way — add an `id`. Do not make `id` optional to silence an error.

Run: `npm test`

Expected: PASS across the whole suite.

- [ ] **Step 12: Commit**

```bash
git add src/repos/sessionRepo.ts tests/playerIdentity.test.ts tests/share/cardData.test.ts "app/(app)/clubs/[id].tsx"
git commit -m "fix(stats): key player aggregation by identity, not display name"
```

---

## Task 2: Carry roster avatars into the local cache

**Files:**
- Modify: `src/db/db.ts:34-36`
- Modify: `src/repos/clubRepo.ts:15-20` (`ClubPlayer`), `:66` (select), `:99` (cache write)
- Test: `tests/clubRoster.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1. These two tasks are independent and may be reviewed separately.
- Produces: `ClubPlayer` with `avatar_url: string | null`, populated on every roster read via `listPlayers` / `listAllPlayers`, which both use `select *`.

**Why:** `avatar_url` currently exists locally only in `profile_cache` (`src/db/schema.ts:101`), which holds the signed-in user's own profile. `ClubPlayer` has no avatar field, so cards can only ever show the current user's photo. `club_players.profile_id` already points at `public.profiles`, and that table is readable by authenticated non-anonymous users under `supabase/migrations/0018_anon_rls_restrictions.sql:24-26`, so an embedded select reaches it with no schema or policy change.

**Naming note:** the field is `avatar_url`, not `avatarUrl`. `ClubPlayer` rows come back from `db.getAllAsync<ClubPlayer>("select * from club_players_cache ...")`, so the TypeScript field name must match the SQLite column name exactly. The rest of the interface (`club_id`, `profile_id`) is snake_case for the same reason.

- [ ] **Step 1: Write the failing test**

Create `tests/clubRoster.test.ts`. This tests the pure mapping from a PostgREST response row to cache columns, which is the part with real branching. Extract that mapping as a named export so it is testable without a database or network:

```ts
import { rosterCacheRow } from "../src/repos/clubRepo";

test("flattens an embedded profile avatar into the cache row", () => {
  expect(rosterCacheRow({
    id: "cp-1", club_id: "c-1", profile_id: "p-1", name: "Rahul",
    profiles: { avatar_url: "https://example.test/a.jpg" },
  })).toEqual(["cp-1", "c-1", "p-1", "Rahul", "https://example.test/a.jpg"]);
});

test("accepts the embedded profile arriving as a single-element array", () => {
  expect(rosterCacheRow({
    id: "cp-1", club_id: "c-1", profile_id: "p-1", name: "Rahul",
    profiles: [{ avatar_url: "https://example.test/a.jpg" }],
  })[4]).toBe("https://example.test/a.jpg");
});

test("a roster-only player with no linked profile caches a null avatar", () => {
  expect(rosterCacheRow({
    id: "cp-2", club_id: "c-1", profile_id: null, name: "Guest Bob", profiles: null,
  })[4]).toBeNull();
});

test("a linked profile that has not set an avatar caches null", () => {
  expect(rosterCacheRow({
    id: "cp-3", club_id: "c-1", profile_id: "p-3", name: "Sameer",
    profiles: { avatar_url: null },
  })[4]).toBeNull();
});

test("a missing profiles key caches null rather than undefined", () => {
  const row = rosterCacheRow({ id: "cp-4", club_id: "c-1", profile_id: "p-4", name: "Anil" });
  expect(row[4]).toBeNull();
});
```

The array-shaped case is real: PostgREST returns an embedded resource as an object or an array depending on how it infers the relationship's cardinality, and getting this wrong silently yields no avatars.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/clubRoster.test.ts`

Expected: FAIL — `rosterCacheRow is not a function`.

- [ ] **Step 3: Add the cache column**

In `src/db/db.ts`, the DDL is an ordered array of statement strings. The `club_players_cache` table is created at line 34.

First read the existing `TOURNAMENT_ALTER_DDL` and `TOURNAMENT_COURTS_DDL` entries in that same file. They are the established pattern for adding a column to a table that already exists on installed devices. Follow whatever idempotency mechanism they use — plain `alter table ... add column` throws on re-run in SQLite, so that pattern will show you how this codebase guards it.

Add an equivalent entry adding `avatar_url text` to `club_players_cache`. Do not edit the original `create table` statement at line 34 in a way that would leave existing installs without the column, and do not drop and recreate the table.

- [ ] **Step 4: Add the field and the mapping**

In `src/repos/clubRepo.ts`, extend the interface:

```ts
export interface ClubPlayer {
  id: string;
  club_id: string;
  profile_id: string | null;
  name: string;
  /**
   * The linked profile's avatar, or null for roster-only players who are not
   * app users. Cached locally so share cards can render a photo without a
   * network round trip during capture.
   */
  avatar_url: string | null;
}
```

Add the exported mapping helper near the interface:

```ts
type RosterRow = {
  id: string;
  club_id: string;
  profile_id: string | null;
  name: string;
  /** PostgREST returns an embedded resource as an object or a 1-element array
   *  depending on the cardinality it infers, so accept both. */
  profiles?: { avatar_url: string | null } | { avatar_url: string | null }[] | null;
};

/** Flatten one club_players row (with its embedded profile) to cache columns. */
export function rosterCacheRow(
  r: RosterRow
): [string, string, string | null, string, string | null] {
  const embedded = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
  return [r.id, r.club_id, r.profile_id, r.name, embedded?.avatar_url ?? null];
}
```

- [ ] **Step 5: Select and store the avatar**

In `src/repos/clubRepo.ts` at line 66, change the roster select:

```ts
      supabase.from("club_players").select("id, club_id, profile_id, name, profiles(avatar_url)"),
```

and at line 99, change the cache write to use the new column list and mapper:

```ts
      await insertMany(
        db, "club_players_cache", ["id", "club_id", "profile_id", "name", "avatar_url"],
        (players.data ?? []).map(rosterCacheRow),
      );
```

Note the surrounding transaction already does `delete from club_players_cache` before this insert, so the cache is fully replaced on every refresh. No backfill of existing rows is needed.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest tests/clubRoster.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`

Expected: zero errors. `ClubPlayer` is constructed in several places; if any fail to typecheck, add `avatar_url: null` rather than making the field optional.

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/db.ts src/repos/clubRepo.ts tests/clubRoster.test.ts
git commit -m "feat(roster): cache each club player's profile avatar url"
```

---

## Manual verification

Neither task changes any pixel, so there is nothing to look at. Two checks are still worth running on a device before the follow-on sub-projects build on this:

- [ ] **Roster refresh populates avatars.** Sign in as a user whose club contains at least one other member who has set a profile photo. Pull the club screen to refresh. Inspect `club_players_cache` and confirm `avatar_url` is populated for that member and null for roster-only entries. If every row is null, the embedded select is being rejected — check the PostgREST response for an error rather than assuming RLS.
- [ ] **Same-named players separate.** In a club with two rostered players sharing a display name, confirm the club leaderboard now lists two rows rather than one merged row.

---

## Self-Review

**Spec coverage (sub-project A only):**

| Spec requirement | Task |
|---|---|
| `PlayerStat` gains a stable `id` | 1 |
| `aggregate()` keys on id, not name | 1 |
| Guests keyed `guest:<name>`, still merge when same-named | 1 (helper + test) |
| Avatar rides existing roster sync, no Supabase migration | 2 |
| `club_players_cache` gains `avatar_url` | 2 |
| `ClubPlayer` exposes the avatar | 2 |
| RLS untouched | Global Constraints |

Deferred to later sub-projects by design: `CARD_TYPE` and the accent rule, `ShareCard` onto `CardShell`, `formatMatchDate` in the two cards, `tabular-nums`, threading avatars into the four cards, removing `captureRef` width/height, and the avatar-load-during-capture race. None are referenced by this plan's tasks.

**Deviation from the spec:** the spec wrote the new field as `avatarUrl`. It is `avatar_url` here, because `ClubPlayer` rows are hydrated by `select *` from SQLite and the rest of the interface is already snake_case for that reason. A camelCase field would silently read as `undefined`.

**Risk the plan reduces:** the spec listed "existing cache rows lack the column" as a risk. The roster sync deletes and re-inserts the whole table on every refresh (`clubRepo.ts:91`), so only the DDL needs to land; there is no data backfill.

**Type consistency:** `playerStatId(p: SidePlayer)` is called in `aggregate` with elements of `m.side_a` / `m.side_b`, which are `SidePlayer[]`. `rosterCacheRow` returns a 5-tuple matching the 5-column `insertMany` list in the same order.

**Placeholder scan:** none. Step 3 of Task 2 deliberately directs the implementer to read two named existing DDL entries rather than inventing an idempotency mechanism, because this codebase's guard pattern is authoritative and reproducing it wrongly would break upgrades.
