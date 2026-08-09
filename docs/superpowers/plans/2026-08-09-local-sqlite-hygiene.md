# Local SQLite Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index the `matches` table, replace row-at-a-time cache rebuilds with batched inserts, and take a network RPC off the session read path.

**Architecture:** Three independent defects sharing the local SQLite layer. Each is a separate task with its own commit. DDL lives in `src/db/schema.ts` as exported constants so Jest can assert on it without a device — the convention `TOURNAMENT_COURTS_DDL` already establishes. SQL assembly for batching is split from execution for the same reason.

**Tech Stack:** expo-sqlite, TypeScript, Jest + ts-jest (node environment, `roots: ["<rootDir>/tests"]`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-09-local-sqlite-hygiene-design.md`.
- **Never edit an applied `MIGRATIONS` entry.** `src/db/db.ts`'s array is keyed by `pragma user_version`; applied entries never re-run. Append only.
- **DDL constants go in `src/db/schema.ts`**, never inline in `db.ts`, so `tests/` can import them. `src/db/db.ts` imports `Platform` from `react-native` at module scope and is therefore NOT importable under the node test environment.
- **Commits use explicit pathspecs.** Never `git add -A` / `.` / `-a`.
- **No `Co-Authored-By` trailer.**
- **Run `npx tsc --noEmit && npm test` before every commit.**

## File Structure

**Create:**
- `src/db/batch.ts` — pure multi-row INSERT assembly + chunked execution.
- `tests/batch.test.ts` — unit tests for the SQL assembly.
- `tests/schema.matchIndexes.test.ts` — asserts the index DDL.

**Modify:**
- `src/db/schema.ts` — add `MATCH_INDEXES_DDL`.
- `src/db/db.ts` — append one `MIGRATIONS` entry.
- `src/repos/clubRepo.ts` — batch `refreshClubs`.
- `src/repos/sessionRepo.ts` — batch `refreshSessions`; split read from sweep.
- `app/_layout.tsx` — call the sweep at startup.

---

### Task 1: Index the `matches` table

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/db.ts`
- Create: `tests/schema.matchIndexes.test.ts`

**Interfaces:**
- Produces: `MATCH_INDEXES_DDL` exported from `src/db/schema.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/schema.matchIndexes.test.ts
import { MATCH_INDEXES_DDL } from "../src/db/schema";

test("indexes the three matches access patterns", () => {
  expect(MATCH_INDEXES_DDL).toMatch(
    /create index if not exists matches_session_created on matches \(session_id, created_at desc\)/
  );
  expect(MATCH_INDEXES_DDL).toMatch(
    /create index if not exists matches_club_created on matches \(club_id, created_at desc\)/
  );
  expect(MATCH_INDEXES_DDL).toMatch(
    /create index if not exists matches_created on matches \(created_at desc\)/
  );
});

test("uses if-not-exists so a re-run is safe", () => {
  const statements = MATCH_INDEXES_DDL.split(";").map((s) => s.trim()).filter(Boolean);
  expect(statements).toHaveLength(3);
  for (const s of statements) expect(s).toMatch(/if not exists/);
});

test("declares no table, only indexes", () => {
  expect(MATCH_INDEXES_DDL).not.toMatch(/create table/i);
  expect(MATCH_INDEXES_DDL).not.toMatch(/alter table/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/schema.matchIndexes.test.ts`
Expected: FAIL — `MATCH_INDEXES_DDL` is not exported.

- [ ] **Step 3: Add the DDL constant**

Append to `src/db/schema.ts`:

```ts
// Indexes for the matches table, which migration 0 created without any beyond
// its primary key. It is the fastest-growing table in the app (one row per
// game), and every list query filters and sorts over it:
//   listMatchesForSession  where session_id = ? order by created_at desc
//   listMatchesForClub     where club_id = ?    order by created_at desc
//   listMatches            order by created_at desc limit 100
//   listAllMatches         order by created_at desc
// Composite (column, created_at desc) lets SQLite satisfy the filter AND the
// sort from one index, skipping the sort step entirely.
//
// A SEPARATE migration entry appended to the list in db.ts — editing an
// applied migration does not re-run it, so existing installs would never
// get these.
export const MATCH_INDEXES_DDL = `
create index if not exists matches_session_created on matches (session_id, created_at desc);
create index if not exists matches_club_created on matches (club_id, created_at desc);
create index if not exists matches_created on matches (created_at desc);
`;
```

- [ ] **Step 4: Append the migration entry**

In `src/db/db.ts`, add `MATCH_INDEXES_DDL` to the import from `./schema`, then append it as the **last** element of `MIGRATIONS` (after `` `alter table sessions_cache add column created_by text;` ``):

```ts
  MATCH_INDEXES_DDL,
];
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/schema.matchIndexes.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/db.ts tests/schema.matchIndexes.test.ts
git commit -m "perf(db): index matches on session_id, club_id, created_at"
```

---

### Task 2: Batched multi-row inserts

**Files:**
- Create: `src/db/batch.ts`
- Create: `tests/batch.test.ts`

**Interfaces:**
- Produces:
  - `buildInsert(table: string, columns: string[], rowCount: number) => string`
  - `chunkRows<T>(rows: T[], columnsPerRow: number) => T[][]`
  - `insertMany(db, table, columns, rows) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/batch.test.ts
import { buildInsert, chunkRows, MAX_VARS } from "../src/db/batch";

describe("buildInsert", () => {
  it("emits one placeholder group per row", () => {
    expect(buildInsert("t", ["a", "b"], 3))
      .toBe("insert into t (a, b) values (?, ?), (?, ?), (?, ?)");
  });

  it("handles a single row", () => {
    expect(buildInsert("t", ["a"], 1)).toBe("insert into t (a) values (?)");
  });

  it("throws on zero rows rather than emitting invalid SQL", () => {
    expect(() => buildInsert("t", ["a"], 0)).toThrow();
  });

  it("throws on zero columns", () => {
    expect(() => buildInsert("t", [], 1)).toThrow();
  });
});

describe("chunkRows", () => {
  it("keeps every chunk under the variable budget", () => {
    const rows = Array.from({ length: 500 }, (_, i) => [i, i, i, i]);
    const chunks = chunkRows(rows, 4);
    for (const c of chunks) expect(c.length * 4).toBeLessThanOrEqual(MAX_VARS);
  });

  it("preserves order and loses no rows", () => {
    const rows = Array.from({ length: 500 }, (_, i) => [i]);
    const chunks = chunkRows(rows, 1);
    expect(chunks.flat()).toEqual(rows);
  });

  it("returns one chunk when everything fits", () => {
    expect(chunkRows([[1], [2], [3]], 1)).toHaveLength(1);
  });

  it("returns no chunks for no rows", () => {
    expect(chunkRows([], 4)).toEqual([]);
  });

  it("still chunks when one row alone exceeds the budget", () => {
    // Degenerate but must not infinite-loop or produce empty chunks.
    const chunks = chunkRows([[1], [2]], MAX_VARS + 10);
    expect(chunks.flat()).toHaveLength(2);
    for (const c of chunks) expect(c.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/batch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/db/batch.ts
//
// Multi-row INSERT helper. refreshClubs and refreshSessions previously issued
// one runAsync per row; a club with 200 players cost 200 JS->native bridge
// crossings and 200 statement prepares. Batching collapses that to one or two
// statements.
//
// SQL assembly is separated from execution so it can be unit tested in the
// node test environment, which cannot load expo-sqlite.
import type { SQLiteDatabase } from "expo-sqlite";

// SQLite's SQLITE_MAX_VARIABLE_NUMBER is 999 on older builds and 32766 on
// newer ones. Rather than depend on which expo-sqlite ships, budget
// conservatively — the win is already ~100x at this size.
export const MAX_VARS = 900;

export function buildInsert(table: string, columns: string[], rowCount: number): string {
  if (rowCount < 1) throw new Error("buildInsert requires at least one row");
  if (columns.length < 1) throw new Error("buildInsert requires at least one column");
  const group = `(${columns.map(() => "?").join(", ")})`;
  const groups = Array.from({ length: rowCount }, () => group).join(", ");
  return `insert into ${table} (${columns.join(", ")}) values ${groups}`;
}

export function chunkRows<T>(rows: T[], columnsPerRow: number): T[][] {
  if (rows.length === 0) return [];
  // At least 1, so a pathologically wide row still makes progress instead of
  // looping forever on a zero-size chunk.
  const size = Math.max(1, Math.floor(MAX_VARS / Math.max(1, columnsPerRow)));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Inserts every row in as few statements as the variable budget allows.
 * Does NOT open a transaction — callers already run inside one, and nesting
 * transactions in expo-sqlite surfaces as "cannot rollback - no transaction
 * is active", which hides the real error.
 */
export async function insertMany(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;
  for (const chunk of chunkRows(rows, columns.length)) {
    await db.runAsync(buildInsert(table, columns, chunk.length), ...chunk.flat() as never[]);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/batch.test.ts && npx tsc --noEmit`
Expected: PASS (10 tests), clean.

- [ ] **Step 5: Commit**

```bash
git add src/db/batch.ts tests/batch.test.ts
git commit -m "feat(db): batched multi-row insert helper"
```

---

### Task 3: Use batching in the cache rebuilds

**Files:**
- Modify: `src/repos/clubRepo.ts`
- Modify: `src/repos/sessionRepo.ts`

**Interfaces:**
- Consumes: `insertMany` from Task 2.

- [ ] **Step 1: Batch `refreshClubs`**

Replace the two `for` loops inside `withTransactionAsync` at `src/repos/clubRepo.ts:73-88`:

```ts
    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from clubs_cache");
      await db.runAsync("delete from club_players_cache");
      await insertMany(
        db, "clubs_cache", ["id", "name", "invite_code", "role", "personal"],
        (clubs.data ?? []).map((c) => [
          c.id, c.name, c.invite_code, roleByClub.get(c.id) ?? "member", c.personal ? 1 : 0,
        ]),
      );
      await insertMany(
        db, "club_players_cache", ["id", "club_id", "profile_id", "name"],
        (players.data ?? []).map((p) => [p.id, p.club_id, p.profile_id, p.name]),
      );
    });
```

Add `import { insertMany } from "../db/batch";` at the top.

- [ ] **Step 2: Batch `refreshSessions`**

Replace the two loops at `src/repos/sessionRepo.ts:87-107`:

```ts
    await db.withTransactionAsync(async () => {
      await db.runAsync("delete from sessions_cache");
      await db.runAsync("delete from attendance_cache");
      await insertMany(
        db, "sessions_cache",
        ["id", "club_id", "starts_at", "ends_at", "location", "courts",
         "status", "created_at", "created_by", "synced"],
        (sessions ?? []).map((s) => [
          s.id as string, s.club_id as string, new Date(s.starts_at as string).getTime(),
          s.ends_at ? new Date(s.ends_at as string).getTime() : null,
          s.location as string | null, s.courts as number, s.status as string,
          new Date(s.created_at as string).getTime(), s.created_by as string, 1,
        ]),
      );
      await insertMany(
        db, "attendance_cache", ["session_id", "club_player_id", "status", "synced"],
        (attendance.data ?? []).map((a) => [
          a.session_id as string, a.club_player_id as string, a.status as string, 1,
        ]),
      );
    });
```

Add `import { insertMany } from "../db/batch";` at the top.

> `synced` was a literal `1` in the original SQL; it becomes an explicit column and value here. Both inserts previously hardcoded it in the VALUES clause — verify against `sessionRepo.ts:92-106` that the column list matches the table definition in `src/db/db.ts:34-51` exactly, in order.

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all pass.

- [ ] **Step 4: Commit**

```bash
git add src/repos/clubRepo.ts src/repos/sessionRepo.ts
git commit -m "perf(db): batch club and session cache rebuilds"
```

---

### Task 4: Take the network write off the session read path

**Files:**
- Modify: `src/repos/sessionRepo.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Produces: `sweepStaleLiveSessions(): Promise<void>` exported from `src/repos/sessionRepo.ts`.

> `listSessions` currently loops its results and awaits `endSession(row.id)` — which calls `endLiveMatchesForSession` (replaying every live match) then `updateSessionStatus`, a **Supabase RPC**. A plain cache read therefore fires N network calls. It is on Home's critical path (`app/(app)/index.tsx:55`).

- [ ] **Step 1: Make the reads pure**

Replace `listSessions` at `src/repos/sessionRepo.ts:113-133`:

```ts
/**
 * Cache-only read. A session that is stale-live is reported as "done" here
 * without persisting that — isStaleLive is a pure local computation over data
 * already in hand. Persisting it is sweepStaleLiveSessions' job, which runs at
 * app start rather than inside a render path.
 */
export async function listSessions(clubId?: string): Promise<ClubSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = clubId
    ? await db.getAllAsync<ClubSession>(
        "select * from sessions_cache where club_id = ? order by starts_at desc", clubId
      )
    : await db.getAllAsync<ClubSession>("select * from sessions_cache order by starts_at desc");
  const now = Date.now();
  return rows.map((row) => (isStaleLive(row, now) ? { ...row, status: "done" as const } : row));
}

export async function getSession(id: string): Promise<ClubSession | null> {
  const db = await getDb();
  const row = (await db?.getFirstAsync<ClubSession>(
    "select * from sessions_cache where id = ?", id
  )) ?? null;
  if (row && isStaleLive(row, Date.now())) return { ...row, status: "done" };
  return row;
}
```

- [ ] **Step 2: Add the sweep**

Append to `src/repos/sessionRepo.ts`:

```ts
/**
 * Persists the auto-finish of sessions left live past AUTO_FINISH_HOURS.
 * Fire-and-forget, called once at app start. Previously this ran inline inside
 * listSessions(), which meant a cache read could fire N match replays and N
 * network RPCs before returning.
 *
 * Failures are swallowed per session: a session that cannot be ended must not
 * stop the others, and the next app open retries.
 */
export async function sweepStaleLiveSessions(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.getAllAsync<ClubSession>(
    "select * from sessions_cache where status = 'live'"
  );
  const now = Date.now();
  for (const row of rows) {
    if (!isStaleLive(row, now)) continue;
    try {
      await endSession(row.id);
    } catch {
      // Retried on the next app open.
    }
  }
}
```

- [ ] **Step 3: Call it at startup**

In `app/_layout.tsx`, extend the existing db-then-sync effect at line 132:

```tsx
  useEffect(() => {
    // Wait for db to be ready before starting sync to avoid nested transactions
    void (async () => {
      await getDb(); // Ensure migrations complete first
      startSyncListener();
      // Persist auto-finish for sessions left live past the window. Runs here,
      // not inside listSessions, so a cache read never fires network calls.
      void sweepStaleLiveSessions();
    })();
  }, []);
```

Add `import { sweepStaleLiveSessions } from "../src/repos/sessionRepo";`.

- [ ] **Step 4: Verify the existing autoFinish tests still hold**

Run: `npx jest tests/autoFinish.test.ts && npm test`
Expected: PASS. `isStaleLive` is unchanged; only its callers moved.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/repos/sessionRepo.ts app/_layout.tsx
git commit -m "perf(sessions): move stale-live sweep off the read path"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 three `matches` indexes | 1 |
| §2 `insertMany` helper + chunking | 2 |
| §2 applied to `refreshClubs` / `refreshSessions` | 3 |
| §3 pure reads + `sweepStaleLiveSessions` at startup | 4 |
| Migration entry appended, never edited | 1 |

**Type consistency:** `insertMany(db, table, columns, rows)` is defined in Task 2 and called with that exact signature four times in Task 3. `MAX_VARS` is exported for the test to assert against. `sweepStaleLiveSessions` is defined in Task 4 Step 2 and imported in Step 3 under the same name.

**Deviation from spec:** the spec's §3 said `listSessions` should "still apply `isStaleLive` to the returned objects". Implemented as a non-mutating `.map` producing new objects rather than mutating rows in place, since the originals came from `getAllAsync` and mutating them was only safe by accident.

**Risk ranking:**
1. **Task 3's column lists** must match the table DDL exactly, in order — a silent mismatch inserts values into wrong columns. Step 2's note flags it.
2. **Task 4's behaviour change**: a stale-live session's server status now lags by up to one app open. Spec accepts this explicitly; it was already unreliable since the old sweep only ran when someone happened to open a list screen.
3. **Task 1** is the safest — additive indexes only.
