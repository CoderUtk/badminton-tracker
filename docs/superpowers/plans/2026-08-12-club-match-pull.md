# Club Match History Pull Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull club match history and its event log down from Supabase so a member who joins an existing club — or reinstalls, or signs in on a second device — sees the club's real leaderboard instead of an empty one.

**Architecture:** Mirror the existing push design exactly. `src/sync/sync.ts` holds pure `pushAll(store, client, userId)` against injected `SyncStore`/`SyncClient` interfaces, with the SQLite and Supabase implementations built in `src/sync/runner.ts`. This plan adds `src/sync/pull.ts` with pure `pullAll(store, client)` against `PullStore`/`PullClient`, wires the concrete implementations in `runner.ts`, and adds one server migration for the `updated_at` watermark column the pull pages on.

**Tech Stack:** TypeScript 5.9, Expo SDK 54 / React Native 0.81, expo-sqlite, Supabase (PostgREST + RLS), Jest 29 + ts-jest (`testEnvironment: "node"`, `roots: ["<rootDir>/tests"]`).

**Design spec:** `docs/superpowers/specs/2026-08-12-club-match-pull-design.md`

## Global Constraints

- Jest runs in the **node** environment and cannot parse React Native or load `expo-sqlite`. Only pure modules get unit tests. `src/sync/pull.ts` must therefore import nothing from `expo-sqlite`, `react-native`, or `../lib/supabase` — all I/O arrives through injected interfaces, exactly like `src/sync/sync.ts`.
- Keep every file under 500 lines.
- Commit with an **explicit pathspec** every time. Never `git add -A`, `git add .`, or `git commit -a`.
- Never add a `Co-Authored-By` trailer.
- A file written under `supabase/migrations/` is **not inert in this repo** — the Supabase CLI reads that directory from disk, so an unapplied file can reach production on the next push. Task 1's SQL must be shown to the user before it is applied.
- `match_events` is append-only server-side: it has select + insert policies and no update/delete (`supabase/migrations/0001_init.sql:165`). The pull must never delete or rewrite a local event row.
- Local rows with `synced = 0` are still owed to the server. The pull must never overwrite them.
- Local `matches` rows with `club_id is null` are personal/quick matches that are never pushed. The pull must never touch them. (Server `public.matches.club_id` is `not null`, so no pulled row can carry a null club_id.)

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0041_matches_updated_at.sql` (create) | Adds `public.matches.updated_at` + touch trigger, so the pull has a monotonic watermark column. |
| `src/db/batch.ts` (modify) | `buildInsert` gains an `or ignore` mode so pulled event rows can be inserted without clobbering local rows on `(match_id, seq)` conflict. |
| `src/sync/pull.ts` (create) | Pure `pullAll` — paging, the synced-flag write rule, event dedupe, watermark advance. No I/O. |
| `src/sync/runner.ts` (modify) | Builds the SQLite `PullStore` and Supabase `PullClient`, calls `pullAll` inside `syncNow`. |
| `src/repos/settingsRepo.ts` (modify) | Adds the `MATCH_PULL_KEY` watermark key alongside the existing keys. |
| `tests/batch.test.ts` (modify) | Covers the new `or ignore` mode. |
| `tests/pull.test.ts` (create) | Covers every `pullAll` rule against an in-memory store. |

---

### Task 1: Server watermark column

`public.matches` has no `updated_at` today (`supabase/migrations/0001_init.sql:74`, and no later migration adds one). Without it the pull cannot tell which rows changed, and a match that goes `live` → `completed` after the watermark would never re-pull.

**Files:**
- Create: `supabase/migrations/0041_matches_updated_at.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.matches.updated_at timestamptz not null default now()`, monotonically bumped on every update. Task 3's `PullClient` orders and filters on it.

- [ ] **Step 1: Write the migration**

```sql
-- 0041_matches_updated_at.sql
-- Sync was push-only for matches, so a member who joined an existing club saw
-- an empty leaderboard (the club screen aggregates the LOCAL matches table).
-- The pull added in src/sync/pull.ts pages on a watermark, which needs a column
-- that moves when a row changes -- created_at does not, because a match is
-- inserted while live and updated when it completes.
--
-- Backfill is implicit: existing rows get now() from the default, so the first
-- pull on any device sees every row it is allowed to read. That is intended --
-- a fresh device must receive the whole history once.
alter table public.matches
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function public.touch_updated_at();

-- The pull's only query is: updated_at > watermark, ordered by (updated_at, id).
create index if not exists matches_updated_at on public.matches (updated_at);
```

- [ ] **Step 2: Show the SQL to the user and get explicit approval before applying**

This file lands in `supabase/migrations/`, which the Supabase CLI reads from disk. Print the migration and stop. Do not run `supabase db push` until the user says to.

Expected: user reviews and approves, or asks for changes.

- [ ] **Step 3: Verify it is not already applied, then apply**

Run: `npx supabase migration list`
Expected: `0041` appears under Local only, not Remote.

Run: `npx supabase db push`
Expected: `0041_matches_updated_at.sql` applied.

- [ ] **Step 4: Verify the trigger actually fires**

Run this in the Supabase SQL editor (or `npx supabase db execute`) against any existing match id:

```sql
select id, created_at, updated_at from public.matches limit 1;
-- note updated_at, then:
update public.matches set status = status where id = '<that id>';
select id, created_at, updated_at from public.matches where id = '<that id>';
```

Expected: `updated_at` moved, `created_at` did not.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0041_matches_updated_at.sql
git commit -m "feat(sync): add matches.updated_at watermark for the history pull"
```

---

### Task 2: `insert or ignore` support in the batch helper

Pulled event rows collide with local rows on the local `match_events` primary key `(match_id, seq)`. `insertMany` issues a plain `insert into`, which throws on conflict and would roll back the whole pull transaction. `or ignore` is also the write rule the plan wants: on conflict, **keep the local row**, because a local row at that seq may be an unsynced event this device authored.

**Files:**
- Modify: `src/db/batch.ts:24-30` (`buildInsert`)
- Modify: `src/db/batch.ts:45-58` (`insertMany`)
- Test: `tests/batch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildInsert(table: string, columns: string[], rowCount: number, conflict?: "fail" | "ignore"): string` — default `"fail"` keeps every existing caller byte-identical.
  - `insertMany(db: SQLiteDatabase, table: string, columns: string[], rows: unknown[][], conflict?: "fail" | "ignore"): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/batch.test.ts`:

```ts
describe("buildInsert conflict mode", () => {
  it("defaults to a plain insert", () => {
    expect(buildInsert("t", ["a", "b"], 1)).toBe("insert into t (a, b) values (?, ?)");
  });

  it("emits insert or ignore when asked", () => {
    expect(buildInsert("t", ["a", "b"], 2, "ignore")).toBe(
      "insert or ignore into t (a, b) values (?, ?), (?, ?)"
    );
  });

  it("emits a plain insert for an explicit fail mode", () => {
    expect(buildInsert("t", ["a"], 1, "fail")).toBe("insert into t (a) values (?)");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/batch.test.ts -t "conflict mode"`
Expected: FAIL — the two-arg-plus-mode call returns `insert into ...` without `or ignore`.

- [ ] **Step 3: Implement the minimal change**

In `src/db/batch.ts`, replace `buildInsert` and `insertMany` with:

```ts
/** How to handle a primary-key/unique collision. "ignore" keeps the row already
 *  in the table — the pull relies on that to never clobber an unsynced local
 *  event with the server's copy of the same (match_id, seq). */
export type ConflictMode = "fail" | "ignore";

export function buildInsert(
  table: string,
  columns: string[],
  rowCount: number,
  conflict: ConflictMode = "fail",
): string {
  if (rowCount < 1) throw new Error("buildInsert requires at least one row");
  if (columns.length < 1) throw new Error("buildInsert requires at least one column");
  const group = `(${columns.map(() => "?").join(", ")})`;
  const groups = Array.from({ length: rowCount }, () => group).join(", ");
  const verb = conflict === "ignore" ? "insert or ignore" : "insert";
  return `${verb} into ${table} (${columns.join(", ")}) values ${groups}`;
}
```

and in `insertMany`, add the parameter and forward it:

```ts
export async function insertMany(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict: ConflictMode = "fail",
): Promise<void> {
  if (rows.length === 0) return;
  for (const chunk of chunkRows(rows, columns.length)) {
    await db.runAsync(
      buildInsert(table, columns, chunk.length, conflict),
      ...(chunk.flat() as never[]),
    );
  }
}
```

- [ ] **Step 4: Run the full batch suite to verify nothing regressed**

Run: `npx jest tests/batch.test.ts`
Expected: PASS, including the pre-existing tests that call `buildInsert` with three arguments.

- [ ] **Step 5: Commit**

```bash
git add src/db/batch.ts tests/batch.test.ts
git commit -m "feat(db): let insertMany ignore primary-key conflicts"
```

---

### Task 3: Pure pull logic

**Files:**
- Create: `src/sync/pull.ts`
- Test: `tests/pull.test.ts`

**Interfaces:**
- Consumes: nothing at runtime (all I/O injected).
- Produces:

```ts
export interface PullMatchRow {
  id: string;
  club_id: string;
  session_id: string | null;
  config: unknown;
  side_a: unknown;
  side_b: unknown;
  status: string;
  winner: string | null;
  score_summary: unknown;
  created_at: string;   // ISO timestamptz from PostgREST
  updated_at: string;   // ISO timestamptz, the watermark
}
export interface PullEventRow { match_id: string; seq: number; event: unknown }
export interface LocalMatchWrite {
  id: string; club_id: string; session_id: string | null;
  config: string; side_a: string; side_b: string;
  status: string; winner: string | null; score_summary: string | null;
  created_at: number;   // epoch ms, matching the local schema
}
export interface LocalEventWrite { match_id: string; seq: number; event: string }
export interface PullClient {
  matchesSince(since: string | null, limit: number): Promise<{ data: PullMatchRow[] | null; error: unknown }>;
  eventsFor(matchIds: string[]): Promise<{ data: PullEventRow[] | null; error: unknown }>;
}
export interface PullStore {
  /** synced flag per id for ids that exist locally; absent key = not present. */
  localSyncState(ids: string[]): Promise<Record<string, 0 | 1>>;
  replaceMatches(rows: LocalMatchWrite[]): Promise<void>;
  insertEvents(rows: LocalEventWrite[]): Promise<void>;
  getWatermark(): Promise<string | null>;
  setWatermark(iso: string): Promise<void>;
}
export interface PullResult { pulledMatches: number; pulledEvents: number; skipped: number }
export declare function pullAll(store: PullStore, client: PullClient, pageSize?: number): Promise<PullResult>;
```

Task 4 implements `PullStore`/`PullClient` against SQLite and Supabase and calls `pullAll`.

- [ ] **Step 1: Write the failing tests**

Create `tests/pull.test.ts`:

```ts
import {
  pullAll, type PullClient, type PullEventRow, type PullMatchRow, type PullStore,
  type LocalEventWrite, type LocalMatchWrite,
} from "../src/sync/pull";

function makeRemote(id: string, updatedAt: string, status = "completed"): PullMatchRow {
  return {
    id,
    club_id: "club1",
    session_id: null,
    config: { matchType: "doubles" },
    side_a: [{ club_player_id: null, name: "A" }],
    side_b: [{ club_player_id: null, name: "B" }],
    status,
    winner: "A",
    score_summary: { games: [{ A: 21, B: 15 }] },
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: updatedAt,
  };
}

function memory(opts: {
  pages: PullMatchRow[][];
  events?: PullEventRow[];
  local?: Record<string, 0 | 1>;
  watermark?: string | null;
  matchError?: unknown;
  eventError?: unknown;
}) {
  const written: LocalMatchWrite[] = [];
  const events: LocalEventWrite[] = [];
  let watermark = opts.watermark ?? null;
  const sinceCalls: (string | null)[] = [];
  const eventIdCalls: string[][] = [];
  let page = 0;

  const client: PullClient = {
    matchesSince: async (since, _limit) => {
      sinceCalls.push(since);
      if (opts.matchError) return { data: null, error: opts.matchError };
      return { data: opts.pages[page++] ?? [], error: null };
    },
    eventsFor: async (ids) => {
      eventIdCalls.push(ids);
      if (opts.eventError) return { data: null, error: opts.eventError };
      const set = new Set(ids);
      return { data: (opts.events ?? []).filter((e) => set.has(e.match_id)), error: null };
    },
  };

  const store: PullStore = {
    localSyncState: async (ids) => {
      const out: Record<string, 0 | 1> = {};
      for (const id of ids) {
        const v = opts.local?.[id];
        if (v !== undefined) out[id] = v;
      }
      return out;
    },
    replaceMatches: async (rows) => { written.push(...rows); },
    insertEvents: async (rows) => { events.push(...rows); },
    getWatermark: async () => watermark,
    setWatermark: async (iso) => { watermark = iso; },
  };

  return { store, client, written, events, sinceCalls, eventIdCalls, mark: () => watermark };
}

describe("pullAll", () => {
  it("writes a remote match the device has never seen", async () => {
    const m = memory({ pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z")]] });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledMatches).toBe(1);
    expect(m.written).toHaveLength(1);
    expect(m.written[0].id).toBe("m1");
  });

  it("serialises json columns as text and created_at as epoch ms", async () => {
    const m = memory({ pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z")]] });
    await pullAll(m.store, m.client);

    const row = m.written[0];
    expect(row.config).toBe(JSON.stringify({ matchType: "doubles" }));
    expect(row.score_summary).toBe(JSON.stringify({ games: [{ A: 21, B: 15 }] }));
    expect(row.created_at).toBe(Date.parse("2026-08-01T10:00:00.000Z"));
  });

  it("keeps score_summary null rather than the string \"null\"", async () => {
    const remote = makeRemote("m1", "2026-08-02T00:00:00.000Z", "live");
    remote.score_summary = null;
    const m = memory({ pages: [[remote]] });
    await pullAll(m.store, m.client);

    expect(m.written[0].score_summary).toBeNull();
  });

  it("replaces a local row that is already synced", async () => {
    const m = memory({
      pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z")]],
      local: { m1: 1 },
    });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledMatches).toBe(1);
    expect(m.written.map((r) => r.id)).toEqual(["m1"]);
  });

  it("skips a local row that has not been pushed yet", async () => {
    const m = memory({
      pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z")]],
      local: { m1: 0 },
    });
    const result = await pullAll(m.store, m.client);

    expect(result.skipped).toBe(1);
    expect(result.pulledMatches).toBe(0);
    expect(m.written).toEqual([]);
  });

  it("does not request events for a skipped match", async () => {
    const m = memory({
      pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z"), makeRemote("m2", "2026-08-02T00:00:01.000Z")]],
      local: { m1: 0 },
      events: [{ match_id: "m1", seq: 0, event: { type: "RALLY_WON" } },
               { match_id: "m2", seq: 0, event: { type: "RALLY_WON" } }],
    });
    await pullAll(m.store, m.client);

    expect(m.eventIdCalls).toEqual([["m2"]]);
    expect(m.events.map((e) => e.match_id)).toEqual(["m2"]);
  });

  it("serialises pulled events as text", async () => {
    const m = memory({
      pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z")]],
      events: [{ match_id: "m1", seq: 3, event: { type: "RALLY_WON", by: "A" } }],
    });
    const result = await pullAll(m.store, m.client);

    expect(result.pulledEvents).toBe(1);
    expect(m.events[0]).toEqual({
      match_id: "m1", seq: 3, event: JSON.stringify({ type: "RALLY_WON", by: "A" }),
    });
  });

  it("pages until a short page comes back, carrying the watermark forward", async () => {
    const m = memory({
      pages: [
        [makeRemote("m1", "2026-08-02T00:00:00.000Z"), makeRemote("m2", "2026-08-02T00:00:01.000Z")],
        [makeRemote("m3", "2026-08-02T00:00:02.000Z")],
      ],
    });
    const result = await pullAll(m.store, m.client, 2);

    expect(result.pulledMatches).toBe(3);
    expect(m.sinceCalls).toEqual([null, "2026-08-02T00:00:01.000Z"]);
    expect(m.mark()).toBe("2026-08-02T00:00:02.000Z");
  });

  it("starts from the stored watermark", async () => {
    const m = memory({ pages: [[]], watermark: "2026-08-01T00:00:00.000Z" });
    await pullAll(m.store, m.client);

    expect(m.sinceCalls).toEqual(["2026-08-01T00:00:00.000Z"]);
  });

  it("leaves the watermark alone when the match query fails", async () => {
    const m = memory({ pages: [[]], watermark: "2026-08-01T00:00:00.000Z", matchError: new Error("offline") });
    const result = await pullAll(m.store, m.client);

    expect(result).toEqual({ pulledMatches: 0, pulledEvents: 0, skipped: 0 });
    expect(m.mark()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("leaves the watermark alone when the event query fails", async () => {
    const m = memory({
      pages: [[makeRemote("m1", "2026-08-02T00:00:00.000Z")]],
      watermark: null,
      eventError: new Error("offline"),
    });
    await pullAll(m.store, m.client);

    expect(m.mark()).toBeNull();
  });

  it("does nothing at all when there is nothing new", async () => {
    const m = memory({ pages: [[]] });
    const result = await pullAll(m.store, m.client);

    expect(result).toEqual({ pulledMatches: 0, pulledEvents: 0, skipped: 0 });
    expect(m.written).toEqual([]);
    expect(m.eventIdCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/pull.test.ts`
Expected: FAIL — `Cannot find module '../src/sync/pull'`.

- [ ] **Step 3: Write the implementation**

Create `src/sync/pull.ts`:

```ts
/**
 * Pull-side counterpart to sync.ts.
 *
 * Sync was push-only for matches, so the local `matches` table only ever held
 * what this device scored. Anyone who joined an existing club saw its
 * leaderboard as empty, because the club screen aggregates that local table
 * (app/(app)/clubs/[id].tsx -> getClubStats -> listMatchesForClub).
 *
 * Two rules make the pull safe to run alongside the push:
 *
 *   - A local match with `synced = 0` is still owed to the server, so its local
 *     copy is newer than anything the server can return. Those are skipped, not
 *     overwritten.
 *   - Local events are inserted with `or ignore` (see PullStore.insertEvents),
 *     so an unsynced local event at some (match_id, seq) always wins over the
 *     server's row at the same key. `match_events` is append-only on both sides.
 *
 * Pure by construction: every read and write arrives through the two interfaces
 * below, because the Jest environment is node and can load neither expo-sqlite
 * nor react-native.
 */

export interface PullMatchRow {
  id: string;
  club_id: string;
  session_id: string | null;
  config: unknown;
  side_a: unknown;
  side_b: unknown;
  status: string;
  winner: string | null;
  score_summary: unknown;
  created_at: string;
  /** The watermark column added in 0041_matches_updated_at.sql. */
  updated_at: string;
}

export interface PullEventRow {
  match_id: string;
  seq: number;
  event: unknown;
}

/** A row shaped for the local `matches` table: json as text, times as epoch ms. */
export interface LocalMatchWrite {
  id: string;
  club_id: string;
  session_id: string | null;
  config: string;
  side_a: string;
  side_b: string;
  status: string;
  winner: string | null;
  score_summary: string | null;
  created_at: number;
}

export interface LocalEventWrite {
  match_id: string;
  seq: number;
  event: string;
}

export interface PullClient {
  /** Rows with updated_at > since, ordered by (updated_at, id), at most `limit`. */
  matchesSince(since: string | null, limit: number): Promise<{ data: PullMatchRow[] | null; error: unknown }>;
  eventsFor(matchIds: string[]): Promise<{ data: PullEventRow[] | null; error: unknown }>;
}

export interface PullStore {
  /** The `synced` flag for each id that exists locally. Absent key = no local row. */
  localSyncState(ids: string[]): Promise<Record<string, 0 | 1>>;
  /** Insert-or-replace, so a re-pulled match picks up its new status/summary. */
  replaceMatches(rows: LocalMatchWrite[]): Promise<void>;
  /** Insert-or-ignore, so a local row at the same (match_id, seq) survives. */
  insertEvents(rows: LocalEventWrite[]): Promise<void>;
  getWatermark(): Promise<string | null>;
  setWatermark(iso: string): Promise<void>;
}

export interface PullResult {
  pulledMatches: number;
  pulledEvents: number;
  /** Remote rows left alone because the local copy was still unsynced. */
  skipped: number;
}

const DEFAULT_PAGE = 200;

function toLocal(row: PullMatchRow): LocalMatchWrite {
  return {
    id: row.id,
    club_id: row.club_id,
    session_id: row.session_id,
    config: JSON.stringify(row.config),
    side_a: JSON.stringify(row.side_a),
    side_b: JSON.stringify(row.side_b),
    status: row.status,
    winner: row.winner,
    // A live match has no summary yet; JSON.stringify(null) would write the
    // four-character string "null", which rowToRecord would then parse into a
    // summary-shaped nothing instead of a real null.
    score_summary: row.score_summary === null || row.score_summary === undefined
      ? null
      : JSON.stringify(row.score_summary),
    created_at: Date.parse(row.created_at),
  };
}

/**
 * Reads every match the caller can see that changed since the stored watermark,
 * writes it and its events locally, then advances the watermark.
 *
 * The watermark only moves after a page has been fully written, so any failure
 * leaves it where it was and the next run re-reads that page. Re-reading is
 * harmless: replaceMatches is idempotent and insertEvents ignores conflicts.
 */
export async function pullAll(
  store: PullStore,
  client: PullClient,
  pageSize: number = DEFAULT_PAGE,
): Promise<PullResult> {
  const result: PullResult = { pulledMatches: 0, pulledEvents: 0, skipped: 0 };
  let since = await store.getWatermark();

  for (;;) {
    const { data, error } = await client.matchesSince(since, pageSize);
    if (error || !data) return result;
    if (data.length === 0) return result;

    const ids = data.map((r) => r.id);
    const local = await store.localSyncState(ids);
    const writable = data.filter((r) => local[r.id] !== 0);
    result.skipped += data.length - writable.length;

    if (writable.length) {
      await store.replaceMatches(writable.map(toLocal));

      const { data: events, error: eErr } = await client.eventsFor(writable.map((r) => r.id));
      // Stop without advancing the watermark: the match rows just written are
      // idempotent, but their events are not there yet, and a replay against a
      // partial log would be wrong. The next run redoes this page.
      if (eErr || !events) return result;
      if (events.length) {
        await store.insertEvents(events.map((e) => ({
          match_id: e.match_id,
          seq: e.seq,
          event: JSON.stringify(e.event),
        })));
        result.pulledEvents += events.length;
      }
      result.pulledMatches += writable.length;
    }

    // data is ordered by updated_at, so the last row carries the page's high
    // water mark. Advance even when every row was skipped: those rows are
    // locally newer, and re-reading them forever would stall the pull.
    since = data[data.length - 1].updated_at;
    await store.setWatermark(since);

    if (data.length < pageSize) return result;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/pull.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/sync/pull.ts tests/pull.test.ts
git commit -m "feat(sync): add pure pull logic for club match history"
```

---

### Task 4: Wire the pull into `syncNow`

**Files:**
- Modify: `src/repos/settingsRepo.ts` (add the watermark key)
- Modify: `src/sync/runner.ts:35-58` (`syncNow`)

**Interfaces:**
- Consumes: `pullAll`, `PullStore`, `PullClient`, `LocalEventWrite`, `LocalMatchWrite`, `PullMatchRow`, `PullEventRow` from Task 3; `insertMany` with the `"ignore"` conflict mode from Task 2; `getSetting`/`setSetting` from `src/repos/settingsRepo.ts`.
- Produces: nothing new — `syncNow()` keeps its `Promise<void>` signature, so `startSyncListener` and every existing caller are unchanged.

- [ ] **Step 1: Add the watermark key**

In `src/repos/settingsRepo.ts`, below `PUSH_TOKEN_KEY`:

```ts
// ISO timestamp of the newest matches.updated_at this device has pulled
// (see src/sync/pull.ts). Per-device on purpose: a reinstall has no local
// history, so it must pull everything again.
export const MATCH_PULL_KEY = "match_pull_at";
```

- [ ] **Step 2: Build the store and client, and call `pullAll`**

In `src/sync/runner.ts`, add these imports:

```ts
import { pullAll, type LocalEventWrite, type LocalMatchWrite, type PullClient, type PullEventRow, type PullMatchRow, type PullStore } from "./pull";
import { insertMany } from "../db/batch";
import { getSetting, setSetting, MATCH_PULL_KEY } from "../repos/settingsRepo";
```

Add, next to `sqliteStore`:

```ts
const MATCH_COLS = [
  "id", "club_id", "session_id", "config", "side_a", "side_b",
  "status", "winner", "score_summary", "created_at", "synced",
];

/** PullStore backed by the local database. Mirrors sqliteStore's shape. */
async function sqlitePullStore(): Promise<PullStore | null> {
  const db = await getDb();
  if (!db) return null;
  return {
    localSyncState: async (ids) => {
      if (ids.length === 0) return {};
      const holes = ids.map(() => "?").join(", ");
      const rows = await db.getAllAsync<{ id: string; synced: number }>(
        `select id, synced from matches where id in (${holes})`,
        ...(ids as never[]),
      );
      const out: Record<string, 0 | 1> = {};
      for (const r of rows) out[r.id] = r.synced ? 1 : 0;
      return out;
    },
    replaceMatches: async (rows: LocalMatchWrite[]) => {
      // synced = 1: these rows came FROM the server, so pushAll must not pick
      // them back up. `insert or replace` rather than `or ignore` because a
      // re-pulled match brings a newer status/winner/score_summary.
      await db.withTransactionAsync(async () => {
        for (const r of rows) {
          await db.runAsync(
            `insert or replace into matches (${MATCH_COLS.join(", ")})
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            r.id, r.club_id, r.session_id, r.config, r.side_a, r.side_b,
            r.status, r.winner, r.score_summary, r.created_at,
          );
        }
      });
    },
    insertEvents: async (rows: LocalEventWrite[]) => {
      await db.withTransactionAsync(async () => {
        await insertMany(
          db, "match_events", ["match_id", "seq", "event", "synced"],
          rows.map((r) => [r.match_id, r.seq, r.event, 1]),
          "ignore",
        );
      });
    },
    getWatermark: () => getSetting(MATCH_PULL_KEY),
    setWatermark: (iso) => setSetting(MATCH_PULL_KEY, iso),
  };
}
```

Then extend `syncNow`, after `pushAll` and before `refreshClubs`:

```ts
    await pushAll(store, client, user.id);

    // Pull after push so a match this device just scored is already on the
    // server (and marked synced = 1 locally) before the pull looks at it.
    const pullStore = await sqlitePullStore();
    if (pullStore) {
      const pullClient: PullClient = {
        matchesSince: async (since, limit) => {
          let q = supabase!
            .from("matches")
            .select("id, club_id, session_id, config, side_a, side_b, status, winner, score_summary, created_at, updated_at")
            .order("updated_at", { ascending: true })
            .order("id", { ascending: true })
            .limit(limit);
          if (since) q = q.gt("updated_at", since);
          const { data, error } = await q;
          return { data: (data as PullMatchRow[] | null), error };
        },
        eventsFor: async (matchIds) => {
          const { data, error } = await supabase!
            .from("match_events")
            .select("match_id, seq, event")
            .in("match_id", matchIds)
            .order("seq", { ascending: true });
          return { data: (data as PullEventRow[] | null), error };
        },
      };
      await pullAll(pullStore, pullClient);
    }

    await refreshClubs();
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Run the whole suite**

Run: `npx jest`
Expected: PASS. Note the baseline for this repo is **348** passing tests before this plan; expect 348 + the tests added in Tasks 2 and 3.

- [ ] **Step 5: Commit**

```bash
git add src/sync/runner.ts src/repos/settingsRepo.ts
git commit -m "feat(sync): pull club match history down from Supabase"
```

- [ ] **Step 6: Verify on device**

Run: `npx expo run:android`

(Note: this command exits 0 even when it cannot find a device — read the output for `Installing .../app-debug.apk` and `Opening badminton://... on <DEVICE>` before believing it worked.)

Then, with two accounts:
1. Account A: create a club, play and complete at least one match saved to that club, share the invite code.
2. Account B (second device or after signing out): join with the code, open the club.

Expected: the club screen shows A's match in the leaderboard and non-zero `matches / games / players`, not "No completed matches yet".

3. Account B: score a match in that club **while offline**, then reconnect.

Expected: B's match is pushed (it is not lost to the pull), and A sees it after their next sync.

- [ ] **Step 7: Commit any device fixes separately**

```bash
git add <only the files you changed>
git commit -m "fix(sync): <what the device run showed>"
```

---

## Notes for the implementer

- **Analytics cache invalidates itself.** `currentFingerprint()` (`src/repos/analyticsCache.ts:45`) hashes `count(*)`, `max(created_at)`, and `sum(length(score_summary))` over completed local matches. A pull that inserts rows changes all three, so cached analytics are discarded without any explicit invalidation call.
- **`matches.created_by` is nullable** since `0016_profile_delete_cascade.sql:21`, and the local `matches` table has no `created_by` column at all — do not try to carry it down.
- **Do not add a delete path.** Nothing in this plan removes local rows. A match deleted server-side stays on the device; that is out of scope and matches how `refreshSessions`/`refreshClubs` behave for their own tables.
- **The first pull on an established device is the biggest one** — every row gets `updated_at = now()` from Task 1's default. Paging at 200 handles it; it runs inside `syncNow`, which is already fire-and-forget from `startSyncListener`.
