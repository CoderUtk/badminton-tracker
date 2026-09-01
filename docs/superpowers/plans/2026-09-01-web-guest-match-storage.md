# Web Guest-Match Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make quick-match create, score, resume, and history work on the web build by persisting guest matches to Supabase anon-owned rows instead of the web-absent local SQLite database.

**Architecture:** Add `src/repos/matchRepo.web.ts` — a platform sibling Metro resolves on web (same mechanism as `src/db/db.web.ts`). It implements every `matchRepo` export against two new Supabase tables (`guest_matches`, `guest_match_events`) scoped by RLS to `auth.uid()`. Guest web sessions are already anonymous Supabase sessions, so `auth.uid()` is a stable per-device owner. Native persistence, native sync, and `public.matches` are untouched.

**Tech Stack:** TypeScript, Expo SDK 54 / React Native 0.81 (web via `react-native-web`), `@supabase/supabase-js` v2, Postgres RLS + `pg_cron`, Jest (ts-jest, node env).

**Spec:** `docs/superpowers/specs/2026-09-01-web-guest-match-storage-design.md`

## Global Constraints

- Migration is **additive only** — new tables, policies, index, cron job. No `alter`/`drop` on any existing object. Do not touch `public.matches`, its policies, or its triggers.
- Do not change native persistence (`src/repos/matchRepo.ts`), native sync (`src/sync/`), or local schema (`src/db/schema.ts`), except the type-only extraction in Task 2 Step 1.
- Web quick match is **online-only**. No offline queue on web.
- Anon-row retention: `pg_cron` hard-deletes `guest_matches` older than **30 days**.
- `pg_cron` extension must be enabled on the Supabase project before the migration's `cron.schedule` call runs.
- Guest = anonymous Supabase session (`app/_layout.tsx:111`). RLS owner key is `auth.uid()`.
- `MatchRecord.created_at` is **epoch milliseconds (number)**, not an ISO string — the web mapper must convert.
- RLS policies target role `authenticated` (anonymous sessions use that role).
- Applying the migration to **production** (`supabase db push`) is an explicit human step, performed only after review — see Task 5. Creating the migration file (Task 1) does not authorize a prod push.
- Commit after every task. Use explicit pathspecs in `git add` — never `git add -A` / `git add .` / `git commit -a`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/0043_guest_matches.sql` | Create `guest_matches` + `guest_match_events`, RLS, owner index, 30-day purge cron | 1 |
| `src/repos/matchRecord.ts` | Shared `MatchRecord` / `SidePlayer` type declarations (extracted so both platform repos can re-export them without a circular import) | 2 |
| `src/repos/matchRepo.ts` | Native repo — **only** its two `interface` blocks change to re-exports | 2 |
| `src/repos/matchRepo.web.ts` | Web repo: all `matchRepo` exports implemented against Supabase; plus `mapRow` for tests | 2, 3 |
| `tests/matchRepoWeb.test.ts` | Unit tests for `mapRow`, the no-session guards, and `endMatchEarly` winner fallback | 2, 3 |
| `app/guest/matches.tsx` | "My matches" list — branch to `listMatches()` on web | 4 |
| `app/new-match.tsx` | Guard the `recordGuestMatch` call to native only | 4 |

---

## Task 1: Migration — guest match tables, RLS, retention

**Files:**
- Create: `supabase/migrations/0043_guest_matches.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.guest_matches(id uuid, config jsonb, side_a jsonb, side_b jsonb, status text, winner text, score_summary jsonb, created_by uuid, created_at timestamptz)` and `public.guest_match_events(match_id uuid, seq int, event jsonb, created_at timestamptz)`; RLS allowing an `authenticated` user full access to rows where `created_by = auth.uid()`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0043_guest_matches.sql`:

```sql
-- 0043_guest_matches.sql
-- The web build runs guest-only (app/_layout.tsx signs every web visitor in
-- anonymously) and has no local SQLite (src/db/db.web.ts). matchRepo.ts writes
-- only to SQLite, so quick match is dead on web. These two tables give the web
-- repo (src/repos/matchRepo.web.ts) a home for guest quick matches, scoped by
-- RLS to the anonymous user that created them.
--
-- Additive only: public.matches, its policies, and native sync are untouched.
-- Migration 0018 recorded that guest matches were "local-only ... never synced";
-- that stays true for native. This is a web-only path over separate tables.

create table public.guest_matches (
  id            uuid primary key,
  config        jsonb not null,
  side_a        jsonb not null,   -- [{club_player_id: null, name}]
  side_b        jsonb not null,
  status        text not null default 'live'
                  check (status in ('live', 'completed', 'forfeited')),
  winner        text check (winner in ('A', 'B')),
  score_summary jsonb,            -- denormalised from replay() for list rendering
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create table public.guest_match_events (
  match_id   uuid not null references public.guest_matches (id) on delete cascade,
  seq        int not null,
  event      jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, seq)
);

create index guest_matches_owner
  on public.guest_matches (created_by, created_at desc);

alter table public.guest_matches      enable row level security;
alter table public.guest_match_events enable row level security;

-- Owner-only, every verb. DELETE on events is required: undo physically
-- removes rows (matchRepo.web.ts removeEventsAfter).
create policy "own guest matches"
  on public.guest_matches for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "own guest match events"
  on public.guest_match_events for all to authenticated
  using (exists (
    select 1 from public.guest_matches m
    where m.id = guest_match_events.match_id and m.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.guest_matches m
    where m.id = guest_match_events.match_id and m.created_by = auth.uid()
  ));

-- Retention: anon rows accumulate one owner per guest device. Hard-delete
-- matches older than 30 days; guest_match_events cascades. Requires the
-- pg_cron extension enabled on the project (Database -> Extensions).
select cron.schedule(
  'purge-guest-matches',
  '17 3 * * *',
  $$ delete from public.guest_matches
     where created_at < now() - interval '30 days' $$
);
```

- [ ] **Step 2: Verify the SQL parses locally**

Prerequisite: enable `pg_cron` in the local stack. If using the Supabase CLI local stack, add to `supabase/config.toml` under `[db]` (create the key if absent):

```toml
[db]
[db.extensions]
enabled = ["pg_cron"]
```

If your local stack cannot enable `pg_cron`, comment out the `cron.schedule(...)` block for the local run and note it — it must be present in the committed file and applied in Task 5 with `pg_cron` enabled.

Run:

```bash
supabase db reset
```

Expected: reset completes without error and reports `0043_guest_matches.sql` applied.

- [ ] **Step 3: Verify tables, policies, and cron job exist**

Run:

```bash
supabase db reset >/dev/null 2>&1; psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d public.guest_matches" -c "\d public.guest_match_events" -c "select policyname, cmd from pg_policies where tablename in ('guest_matches','guest_match_events');" -c "select jobname, schedule from cron.job where jobname = 'purge-guest-matches';"
```

Expected: both tables listed with the columns from the migration; two policies (`own guest matches`, `own guest match events`) each with `cmd = ALL`; one cron job `purge-guest-matches` with schedule `17 3 * * *`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0043_guest_matches.sql supabase/config.toml
git commit -m "feat(db): guest_matches tables + RLS + 30-day purge for web quick match"
```

(Omit `supabase/config.toml` from the `git add` if you did not need to change it.)

---

## Task 2: Web repo — types, create, events, read

**Files:**
- Create: `src/repos/matchRecord.ts`
- Modify: `src/repos/matchRepo.ts` (replace the two `interface` blocks, lines 6-22, with re-exports)
- Create: `src/repos/matchRepo.web.ts`
- Create: `tests/matchRepoWeb.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (`SupabaseClient | null`); `Crypto.randomUUID` from `expo-crypto`; `replay`, types `MatchConfig`, `MatchEvent`, `MatchState`, `TeamId` from `src/engine`.
- Produces (all consumed by later tasks and by `src/stores/matchStore.ts` unchanged):
  - `interface MatchRecord` / `interface SidePlayer` (re-exported from both repo modules)
  - `createMatch(config: MatchConfig, sideA: SidePlayer[], sideB: SidePlayer[], clubId: string | null, sessionId: string | null): Promise<string>`
  - `appendEvent(matchId: string, seq: number, event: MatchEvent): Promise<void>`
  - `removeEventsAfter(matchId: string, lastKeptSeq: number): Promise<void>`
  - `loadEvents(matchId: string): Promise<MatchEvent[]>`
  - `getMatch(matchId: string): Promise<MatchRecord | null>`
  - `mapRow(row: Record<string, any>): MatchRecord` (extra export, for tests)

- [ ] **Step 1: Extract the shared types**

Create `src/repos/matchRecord.ts`:

```ts
import type { MatchConfig, TeamId } from "../engine";

export interface SidePlayer {
  club_player_id: string | null;
  name: string;
}

export interface MatchRecord {
  id: string;
  club_id: string | null;
  session_id: string | null;
  config: MatchConfig;
  side_a: SidePlayer[];
  side_b: SidePlayer[];
  status: "live" | "completed" | "forfeited";
  winner: TeamId | null;
  score_summary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
  created_at: number;
}
```

In `src/repos/matchRepo.ts`, delete the `export interface SidePlayer { ... }` and `export interface MatchRecord { ... }` blocks (currently lines 6-22) and replace them with a single line, immediately after the existing imports:

```ts
export type { MatchRecord, SidePlayer } from "./matchRecord";
```

Leave the rest of `matchRepo.ts` unchanged. `rowToRecord` and every function keep working — the types are structurally identical.

- [ ] **Step 2: Run the existing suite to confirm the extraction is inert**

Run: `npm test`
Expected: PASS — same test count as before, no new failures. (Confirms native `matchRepo.ts` still compiles and no test resolved a `.web.ts` file.)

- [ ] **Step 3: Write the failing test**

Create `tests/matchRepoWeb.test.ts`:

```ts
// This suite imports src/repos/matchRepo.web.ts explicitly (jest has no metro
// platform resolution). The existing suite keeps importing "matchRepo" -> .ts.
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

let mockSupabase: ReturnType<typeof makeFake> | null;
jest.mock("../src/lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

/**
 * Minimal stand-in for the supabase-js query builder. Every chain method
 * returns the same thenable object; the terminal value is `result`. Mutating
 * calls are pushed to `calls` for assertions.
 */
function makeFake(opts: { user?: { id: string } | null; row?: any; events?: any[] }) {
  const calls: any[][] = [];
  const build = (result: any) => {
    const p: any = {
      insert: (v: any) => (calls.push(["insert", v]), p),
      upsert: (v: any, o: any) => (calls.push(["upsert", v, o]), p),
      update: (v: any) => (calls.push(["update", v]), p),
      delete: () => (calls.push(["delete"]), p),
      select: () => p,
      eq: () => p,
      gt: () => p,
      order: () => p,
      limit: () => p,
      maybeSingle: () => Promise.resolve(result),
      then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
    };
    return p;
  };
  return {
    calls,
    auth: { getUser: () => Promise.resolve({ data: { user: opts.user ?? null }, error: null }) },
    from: (table: string) =>
      table === "guest_match_events"
        ? build({ data: opts.events ?? [], error: null })
        : build({ data: opts.row ?? null, error: null }),
  };
}

import { mapRow, createMatch, loadEvents } from "../src/repos/matchRepo.web";
import { defaultConfig } from "../src/engine";

afterEach(() => {
  mockSupabase = null;
});

test("mapRow converts created_at to epoch ms and passes jsonb through", () => {
  const rec = mapRow({
    id: "m1",
    config: { matchType: "singles" },
    side_a: [{ club_player_id: null, name: "Ann" }],
    side_b: [{ club_player_id: null, name: "Bob" }],
    status: "completed",
    winner: null,
    score_summary: { games: [{ A: 21, B: 15 }] },
    created_at: "2026-09-01T10:00:00.000Z",
  });
  expect(rec.created_at).toBe(Date.parse("2026-09-01T10:00:00.000Z"));
  expect(rec.club_id).toBeNull();
  expect(rec.winner).toBeNull();
  expect(rec.side_a[0].name).toBe("Ann");
  expect(rec.score_summary?.games[0]).toEqual({ A: 21, B: 15 });
});

test("createMatch throws a friendly error when the anon session is not ready", async () => {
  mockSupabase = makeFake({ user: null });
  await expect(
    createMatch(defaultConfig({ matchType: "singles", teams: { A: [{ id: "a0", name: "Ann" }], B: [{ id: "b0", name: "Bob" }] }, pointsToWin: 21, cap: 30, intervalAt: 11, bestOf: 3, firstServer: { team: "A", playerIndex: 0 } }), [], [], null, null)
  ).rejects.toThrow(/signing you in/i);
});

test("createMatch inserts a row with created_by and returns the id", async () => {
  mockSupabase = makeFake({ user: { id: "user-1" } });
  const id = await createMatch(
    defaultConfig({ matchType: "singles", teams: { A: [{ id: "a0", name: "Ann" }], B: [{ id: "b0", name: "Bob" }] }, pointsToWin: 21, cap: 30, intervalAt: 11, bestOf: 3, firstServer: { team: "A", playerIndex: 0 } }),
    [{ club_player_id: null, name: "Ann" }],
    [{ club_player_id: null, name: "Bob" }],
    null,
    null
  );
  expect(typeof id).toBe("string");
  const insert = mockSupabase!.calls.find((c) => c[0] === "insert");
  expect(insert?.[1]).toMatchObject({ id, created_by: "user-1" });
});

test("loadEvents returns the parsed event of each row in seq order", async () => {
  mockSupabase = makeFake({ events: [{ event: { type: "MATCH_STARTED" } }, { event: { type: "POINT" } }] });
  const events = await loadEvents("m1");
  expect(events).toEqual([{ type: "MATCH_STARTED" }, { type: "POINT" }]);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest tests/matchRepoWeb.test.ts`
Expected: FAIL — `Cannot find module '../src/repos/matchRepo.web'`.

- [ ] **Step 5: Write the web repo (part 1)**

Create `src/repos/matchRepo.web.ts`:

```ts
import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import type { MatchConfig, MatchEvent, MatchState, TeamId } from "../engine";
import { replay } from "../engine";

export type { MatchRecord, SidePlayer } from "./matchRecord";
import type { MatchRecord, SidePlayer } from "./matchRecord";

/** Supabase row (jsonb already parsed, created_at an ISO string) -> MatchRecord. */
export function mapRow(row: Record<string, any>): MatchRecord {
  return {
    id: row.id,
    club_id: null,
    session_id: null,
    config: row.config as MatchConfig,
    side_a: row.side_a as SidePlayer[],
    side_b: row.side_b as SidePlayer[],
    status: row.status,
    winner: (row.winner as TeamId) ?? null,
    score_summary: row.score_summary ?? null,
    created_at: new Date(row.created_at).getTime(),
  };
}

export async function createMatch(
  config: MatchConfig,
  sideA: SidePlayer[],
  sideB: SidePlayer[],
  _clubId: string | null,
  _sessionId: string | null,
): Promise<string> {
  if (!supabase) throw new Error("The app is not configured to reach the server.");
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Still signing you in — try that again in a moment.");
  const id = Crypto.randomUUID();
  const { error } = await supabase.from("guest_matches").insert({
    id,
    config,
    side_a: sideA,
    side_b: sideB,
    created_by: data.user.id,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function appendEvent(matchId: string, seq: number, event: MatchEvent): Promise<void> {
  if (!supabase) return;
  // ignoreDuplicates makes a re-dispatched seq a no-op, mirroring native
  // "insert or ignore".
  await supabase
    .from("guest_match_events")
    .upsert({ match_id: matchId, seq, event }, { onConflict: "match_id,seq", ignoreDuplicates: true });
}

/** Undo: physically remove events after the kept seq. No sync concept on web. */
export async function removeEventsAfter(matchId: string, lastKeptSeq: number): Promise<void> {
  if (!supabase) return;
  await supabase.from("guest_match_events").delete().eq("match_id", matchId).gt("seq", lastKeptSeq);
}

export async function loadEvents(matchId: string): Promise<MatchEvent[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("guest_match_events")
    .select("event")
    .eq("match_id", matchId)
    .order("seq", { ascending: true });
  return (data ?? []).map((r) => r.event as MatchEvent);
}

export async function getMatch(matchId: string): Promise<MatchRecord | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("guest_matches").select("*").eq("id", matchId).maybeSingle();
  return data ? mapRow(data) : null;
}
```

- [ ] **Step 6: Run the test to verify part 1 passes**

Run: `npx jest tests/matchRepoWeb.test.ts`
Expected: FAIL — only on the `endMatchEarly` / `updateLiveScore` / `listMatches` tests added in Task 3 (not written yet). The four tests in this file PASS. If `mapRow`, `createMatch`, `loadEvents` tests pass, part 1 is done.

Actually at this point only the four tests above exist — expect all 4 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repos/matchRecord.ts src/repos/matchRepo.ts src/repos/matchRepo.web.ts tests/matchRepoWeb.test.ts
git commit -m "feat(web): guest match create/read/events via Supabase"
```

---

## Task 3: Web repo — finalize, live score, end early, lists, stubs

**Files:**
- Modify: `src/repos/matchRepo.web.ts` (append functions)
- Modify: `tests/matchRepoWeb.test.ts` (append tests)

**Interfaces:**
- Consumes: everything from Task 2, plus `MatchState` from `src/engine`.
- Produces (consumed by `src/stores/matchStore.ts`, `app/guest/matches.tsx`, unchanged callers):
  - `finalizeMatch(matchId: string, state: MatchState): Promise<void>`
  - `updateLiveScore(matchId: string, state: MatchState): Promise<void>`
  - `endMatchEarly(matchId: string, state: MatchState): Promise<void>`
  - `listMatches(): Promise<MatchRecord[]>`
  - `replayMatch(matchId: string): Promise<MatchState | null>`
  - `listAllMatches(): Promise<MatchRecord[]>` — returns `[]`
  - `listMatchesForSession(sessionId: string): Promise<MatchRecord[]>` — returns `[]`
  - `listMatchesForClub(clubId: string): Promise<MatchRecord[]>` — returns `[]`
  - `endLiveMatchesForSession(sessionId: string): Promise<void>` — no-op

- [ ] **Step 1: Write the failing tests**

Append to `tests/matchRepoWeb.test.ts`:

```ts
import { updateLiveScore, endMatchEarly, listMatches } from "../src/repos/matchRepo.web";
import type { MatchState } from "../src/engine";

/** Bare MatchState good enough for the repo's summary/winner logic. */
function stateFixture(over: Partial<MatchState>): MatchState {
  return {
    phase: "in_game",
    score: { A: 0, B: 0 },
    gamesWon: { A: 0, B: 0 },
    gameHistory: [],
    winner: null,
    ...over,
  } as MatchState;
}

test("updateLiveScore writes score_summary and targets live rows only", async () => {
  mockSupabase = makeFake({});
  await updateLiveScore("m1", stateFixture({ score: { A: 5, B: 3 }, gameHistory: [] }));
  const update = mockSupabase!.calls.find((c) => c[0] === "update");
  expect(update?.[1]).toHaveProperty("score_summary");
  expect(update?.[1]).not.toHaveProperty("status");
});

test("endMatchEarly falls back to the current game leader when games are level", async () => {
  mockSupabase = makeFake({});
  await endMatchEarly(
    "m1",
    stateFixture({ phase: "in_game", score: { A: 15, B: 9 }, gamesWon: { A: 0, B: 0 }, winner: null }),
  );
  const update = mockSupabase!.calls.find((c) => c[0] === "update");
  expect(update?.[1]).toMatchObject({ status: "completed", winner: "A" });
  expect(update?.[1].score_summary.games).toContainEqual({ A: 15, B: 9 });
});

test("listMatches returns [] when the anon session is not ready", async () => {
  mockSupabase = makeFake({ user: null });
  expect(await listMatches()).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/matchRepoWeb.test.ts`
Expected: FAIL — `updateLiveScore`, `endMatchEarly`, `listMatches` are not exported.

- [ ] **Step 3: Append the implementation**

Add to the end of `src/repos/matchRepo.web.ts`:

```ts
export async function finalizeMatch(matchId: string, state: MatchState): Promise<void> {
  if (!supabase) return;
  const summary = { games: state.gameHistory.map((g) => g.score) };
  await supabase
    .from("guest_matches")
    .update({ status: "completed", winner: state.winner, score_summary: summary })
    .eq("id", matchId);
}

/**
 * Periodic live-score snapshot. The status='live' guard makes a stray tick
 * racing a just-finished match a no-op instead of resurrecting score_summary
 * after completion (same contract as matchRepo.ts).
 */
export async function updateLiveScore(matchId: string, state: MatchState): Promise<void> {
  if (!supabase) return;
  const summary = {
    games: state.gameHistory.map((g) => g.score),
    current: { A: state.score.A, B: state.score.B },
  };
  await supabase
    .from("guest_matches")
    .update({ score_summary: summary })
    .eq("id", matchId)
    .eq("status", "live");
}

/**
 * End a match before a natural finish. The in-progress game joins the summary;
 * the winner is decided by games won, falling back to the current game's leader
 * (null if dead level). Logic duplicated verbatim from matchRepo.ts.
 */
export async function endMatchEarly(matchId: string, state: MatchState): Promise<void> {
  if (!supabase) return;
  const games = state.gameHistory.map((g) => g.score);
  if (state.phase !== "match_over" && (state.score.A > 0 || state.score.B > 0)) {
    games.push({ A: state.score.A, B: state.score.B });
  }
  const winner: TeamId | null =
    state.winner ??
    (state.gamesWon.A !== state.gamesWon.B
      ? state.gamesWon.A > state.gamesWon.B
        ? "A"
        : "B"
      : state.score.A === state.score.B
        ? null
        : state.score.A > state.score.B
          ? "A"
          : "B");
  await supabase
    .from("guest_matches")
    .update({ status: "completed", winner, score_summary: { games } })
    .eq("id", matchId);
}

export async function listMatches(): Promise<MatchRecord[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase
    .from("guest_matches")
    .select("*")
    .eq("created_by", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map(mapRow);
}

export async function replayMatch(matchId: string): Promise<MatchState | null> {
  const events = await loadEvents(matchId);
  return events.length ? replay(events) : null;
}

// Guest web sessions never navigate to club, session, tournament, or
// profile-analytics screens, so these have no rows to serve.
export async function listAllMatches(): Promise<MatchRecord[]> {
  return [];
}
export async function listMatchesForSession(_sessionId: string): Promise<MatchRecord[]> {
  return [];
}
export async function listMatchesForClub(_clubId: string): Promise<MatchRecord[]> {
  return [];
}
export async function endLiveMatchesForSession(_sessionId: string): Promise<void> {
  return;
}
```

- [ ] **Step 4: Run the full web-repo suite**

Run: `npx jest tests/matchRepoWeb.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Confirm the whole suite is still green**

Run: `npm test`
Expected: PASS — existing tests plus the 7 new ones.

- [ ] **Step 6: Confirm the web bundle compiles**

Run: `npm run build:web`
Expected: `Exported: dist` with no TypeScript or Metro errors. (Confirms Metro resolves `matchRepo.web.ts` and every `matchRepo` consumer still type-checks on web.)

- [ ] **Step 7: Commit**

```bash
git add src/repos/matchRepo.web.ts tests/matchRepoWeb.test.ts
git commit -m "feat(web): finalize/live/end-early/list for guest matches"
```

---

## Task 4: History list + native-only guest recorder

**Files:**
- Modify: `app/guest/matches.tsx:1-9` (imports), `:43-53` (focus effect)
- Modify: `app/new-match.tsx:1-3` (import `Platform`), `:379` (guard the call)

**Interfaces:**
- Consumes: `listMatches()`, `getMatch()` from `../../src/repos/matchRepo` (Task 3); `Platform` from `react-native`.
- Produces: nothing new — behavioural change only.

- [ ] **Step 1: Branch the history query to `listMatches()` on web**

In `app/guest/matches.tsx`, change the import on line 5 from:

```ts
import { getMatch, MatchRecord } from "../../src/repos/matchRepo";
```

to:

```ts
import { getMatch, listMatches, MatchRecord } from "../../src/repos/matchRepo";
```

Add `Platform` to the `react-native` import on line 2:

```ts
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
```

Replace the `useFocusEffect` body (lines 43-53) with:

```ts
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        // Web: RLS scopes listMatches() to this anon user, so no local id list.
        // Native: guest history is a session-scoped id list (native listMatches
        // would also return matches from a previous signed-in account on a
        // shared device).
        const rows =
          Platform.OS === "web"
            ? await listMatches()
            : (await Promise.all((await getGuestMatchIds()).map((id) => getMatch(id)))).filter(
                (m): m is MatchRecord => m !== null,
              );
        if (live) setMatches(rows);
      })();
      return () => {
        live = false;
      };
    }, []),
  );
```

- [ ] **Step 2: Guard the guest recorder to native**

In `app/new-match.tsx`, add `Platform` to the `react-native` import on line 3:

```ts
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
```

On line 379, change:

```ts
      if (isGuest) await recordGuestMatch(id);
```

to:

```ts
      // Web guest history reads straight from guest_matches (RLS-scoped); the
      // localStorage id list is native-only.
      if (isGuest && Platform.OS !== "web") await recordGuestMatch(id);
```

- [ ] **Step 3: Confirm existing tests still pass**

Run: `npm test`
Expected: PASS — `guestMatches.test.ts` unchanged and green (the module is still used on native).

- [ ] **Step 4: Confirm the web bundle compiles**

Run: `npm run build:web`
Expected: `Exported: dist`, no errors.

- [ ] **Step 5: Commit**

```bash
git add app/guest/matches.tsx app/new-match.tsx
git commit -m "feat(web): read guest match history from Supabase"
```

---

## Task 5: End-to-end + RLS verification

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a recorded pass/fail of the full guest scoring flow on web and of RLS isolation.

- [ ] **Step 1: Apply the migration to the target database**

For a hosted Supabase project: enable `pg_cron` first (Dashboard → Database → Extensions → enable `pg_cron`), then:

```bash
supabase db push
```

Expected: `0043_guest_matches.sql` reported applied. If `cron.schedule` errors with `schema "cron" does not exist`, `pg_cron` is not enabled — enable it and re-run.

Record in the plan / PR description which database this was applied to (local, staging, prod).

- [ ] **Step 2: Build and serve the web app**

```bash
npm run build:web
npx serve -s dist -l 4173
```

- [ ] **Step 3: Run the full guest scoring flow in a browser**

Open `http://localhost:4173`, then:

1. Guest home renders → tap **Quick match**.
2. Fill all four player names (Doubles) → **Start scoring**.
3. Confirm the score screen renders (not a blank view).
4. Score several points on each side; reach an interval / game point.
5. **Reload the page.** Confirm the match resumes with the same score (events replayed from Supabase).
6. Undo a point → confirm the score steps back.
7. Tap **End** (end early) → confirm it returns to a completed state.
8. Navigate to **My matches** → confirm the match is listed with the right format and score summary, and that tapping a still-live match reopens the score screen.

Expected: every step works. Record any failure with the console output (`read_console_messages`) and the network calls to `guest_matches` / `guest_match_events` (`read_network_requests`).

- [ ] **Step 4: Verify RLS isolation between two anon users**

With the target DB's connection string:

```bash
psql "$DB_URL" <<'SQL'
-- Simulate user A inserting a match, then user B trying to read it.
-- Run as the 'authenticated' role with a forged JWT claim for each uid.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.guest_matches (id, config, side_a, side_b, created_by)
values ('11111111-1111-4111-8111-111111111111', '{}', '[]', '[]', '00000000-0000-0000-0000-00000000000a');
select count(*) as a_sees_own from public.guest_matches;  -- expect 1

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select count(*) as b_sees_a from public.guest_matches
  where id = '11111111-1111-4111-8111-111111111111';     -- expect 0
update public.guest_matches set status = 'forfeited'
  where id = '11111111-1111-4111-8111-111111111111';     -- expect UPDATE 0
delete from public.guest_matches
  where id = '11111111-1111-4111-8111-111111111111';     -- expect DELETE 0

-- cleanup
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
delete from public.guest_matches where id = '11111111-1111-4111-8111-111111111111';
SQL
```

Expected: `a_sees_own = 1`, `b_sees_a = 0`, `UPDATE 0`, `DELETE 0`.

- [ ] **Step 5: Commit the verification note**

If any doc or checklist file records verification status (e.g. `docs/SUPABASE_SETUP.md` migration list, or the CLAUDE.md "APPLIED TO PRODUCTION" tracking), update it to reflect where `0043` was applied, then:

```bash
git add docs/SUPABASE_SETUP.md
git commit -m "docs: record 0043_guest_matches applied to <db>"
```

(Skip this commit if there is no such file to update.)

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| Data model — `guest_matches`, `guest_match_events`, index | 1 Step 1 |
| RLS — owner-only, all verbs, `to authenticated` | 1 Step 1 |
| Retention — pg_cron 30-day purge | 1 Step 1; enabled/applied 5 Step 1 |
| Web repo adapter — every export mapped | 2 (create/events/get), 3 (finalize/live/end/list/replay/stubs) |
| `row -> MatchRecord` mapper, epoch-ms conversion | 2 Step 5 (`mapRow`), tested 2 Step 3 |
| History list — branch to `listMatches()` on web | 4 Step 1 |
| `guestMatches.ts` / `recordGuestMatch` native-only | 4 Step 2 |
| Cadence — 15s `updateLiveScore` | inherited from unchanged `matchStore`; `updateLiveScore` impl 3 Step 3 |
| Realtime no-op on web | no code needed — `SupabaseBackend.setLive/clearLive/publishEvent` are already no-ops; noted here, not a task |
| Resume mid-match | 5 Step 3 item 5 |
| No session at createMatch time — friendly throw | 2 Step 5 (`createMatch` guard), tested 2 Step 3 |
| Migration safety — additive, reviewed, pg_cron prerequisite | Global Constraints; 1 Step 2; 5 Step 1 |
| Testing — node mapper unit tests, jest doesn't resolve `.web.ts`, RLS manual, browser E2E | 2 Step 2, 2-3 unit tests, 5 Steps 3-4 |
| Non-goals — PWA packaging, offline, orientation, native untouched | Global Constraints; not implemented |

No gaps.

**2. Placeholder scan**

No "TBD"/"TODO"/"handle edge cases". Every code step has a full code block. The two conditional commits (config.toml in Task 1, docs in Task 5) state explicitly when to skip.

**3. Type consistency**

- `MatchRecord` / `SidePlayer` defined once in `matchRecord.ts` (Task 2 Step 1), re-exported by both repos — no drift.
- `createMatch` signature identical to `matchRepo.ts:24-30` (verified against source).
- `mapRow` (Task 2) referenced by `getMatch` (Task 2) and `listMatches` (Task 3) — same name throughout.
- `updateLiveScore` / `finalizeMatch` / `endMatchEarly` / `replayMatch` names match `matchRepo.ts` exports and `matchStore.ts` call sites (`repo.updateLiveScore`, `repo.finalizeMatch`, `repo.endMatchEarly`).
- `endMatchEarly` winner-fallback expression copied verbatim from `matchRepo.ts:117-123`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-01-web-guest-match-storage.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
