# Local SQLite Hygiene — design

**Date:** 2026-08-09
**Status:** Design approved (planning only; no implementation yet)

P2 of four performance sub-projects. Three unrelated defects in the local SQLite layer
that share a file and a migration mechanism, so they ship together: missing indexes on
`matches`, row-at-a-time cache rebuilds, and a network write hidden inside a read path.

No user-visible feature changes. P1 (tournament read path) is independent of this and
they can land in either order.

## Context

`src/db/db.ts` holds a `MIGRATIONS` array applied by `pragma user_version`. It currently
has 7 entries (indices 0-6). New work appends entries; existing entries are never
edited, because an applied migration does not re-run — the convention is documented at
`src/db/schema.ts:42` and enforced by `tests/schema.tournaments.test.ts`.

## 1. Missing indexes on `matches`

`sessions_cache` and `attendance_cache` got indexes when they were added
(`src/db/db.ts:52`). `bracket_matches` and `tournament_entrants` got them in
`schema.ts:18`. The `matches` table — created first, in migration 0, and the
fastest-growing table in the app at one row per game — got none beyond its primary key.

Every one of these is a full table scan plus a sort:

| Query | Location |
|---|---|
| `where session_id = ? order by created_at desc` | `listMatchesForSession` (`matchRepo.ts:180`) |
| `where club_id = ? order by created_at desc` | `listMatchesForClub` (`matchRepo.ts:189`) |
| `order by created_at desc limit 100` | `listMatches` (`matchRepo.ts:158`) |
| `order by created_at desc` (uncapped) | `listAllMatches` (`matchRepo.ts:171`) |

New migration entry:

```sql
create index if not exists matches_session_created on matches (session_id, created_at desc);
create index if not exists matches_club_created on matches (club_id, created_at desc);
create index if not exists matches_created on matches (created_at desc);
```

Composite rather than single-column: each of the first two queries filters *and* sorts,
so a composite lets SQLite satisfy both from the index and skip the sort entirely.
`matches_created` serves the two unfiltered list queries.

`match_events` needs nothing — its primary key `(match_id, seq)` already serves
`loadEvents`' `where match_id = ? order by seq` (`matchRepo.ts:70`).

**Cost:** three indexes on a table that is written once per match creation and a handful
of times per match (finalize, live-score ticks). Write amplification is negligible
against the read win.

## 2. Row-at-a-time cache rebuilds

`refreshClubs` (`clubRepo.ts:73`) and `refreshSessions` (`sessionRepo.ts:87`) both do:

```
delete everything
for (const row of rows) await db.runAsync("insert ... values (?, ?, ?)", ...)
```

Each `runAsync` is a separate JS→native bridge crossing plus a statement prepare. A club
with 200 players costs 200 crossings; `refreshSessions` inserts sessions *and* attendance
rows, so an active club is easily several hundred. These run inside `withTransactionAsync`,
so they are at least not 200 separate transactions — but the per-call overhead dominates.

Both are on the critical path of Home's reload chain (`app/(app)/index.tsx:72`).

**Fix:** batch into multi-row `insert ... values (?,?,?),(?,?,?),...` statements, chunked
to stay under SQLite's variable limit.

SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` is 999 on older builds and 32766 on newer
ones. Rather than depend on which expo-sqlite ships, chunk on a conservative fixed budget:

```ts
const MAX_VARS = 900;
const chunkSize = Math.floor(MAX_VARS / columnsPerRow);
```

For `club_players_cache` (4 columns) that is 225 rows per statement — 200 players becomes
**1 statement instead of 200**.

A shared helper, since four call sites need it (`clubs_cache`, `club_players_cache`,
`sessions_cache`, `attendance_cache`):

```ts
// src/db/batch.ts
export async function insertMany(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void>
```

Pure string assembly plus `runAsync`, so the SQL-building half is unit-testable without
native modules — the same split `src/tournament/rows.ts` uses.

**Correctness note:** the `delete`-then-`insert` shape and its enclosing transaction stay
exactly as they are. This changes only how many statements the inserts take. Both
functions keep their `refreshing` re-entrancy guard.

## 3. A network write inside a read path

`listSessions()` (`sessionRepo.ts:113`) reads sessions from cache, then loops the results
and calls `endSession(row.id)` for any that are stale-live — and `endSession` calls
`endLiveMatchesForSession` (which replays every live match) followed by
`updateSessionStatus`, which is a **Supabase RPC**.

So a plain list read can, without warning, fire N match replays and N network calls
before it returns. `getSession()` (`sessionRepo.ts:135`) has the same problem for one row.

This is on Home's critical path (`listSessions` at `app/(app)/index.tsx:55`) and the
sessions list screen. On a slow connection a stale session makes the entire Home reload
wait on a network RPC that has nothing to do with rendering Home.

The existing code already treats the sweep as best-effort — it catches and ignores
failures, with the comment "a failed sweep must never prevent the rest of the list from
loading." The sweep being *synchronous* contradicts that intent.

**Fix:** split read from sweep.

- `listSessions()` / `getSession()` become pure cache reads. They still apply
  `isStaleLive` to the *returned objects* so the UI shows `"done"` immediately — that is
  a local computation over data already in hand, costing nothing.
- The actual persistence (`endSession`) moves to a fire-and-forget sweep,
  `sweepStaleLiveSessions()`, called from the same place the sync listener starts
  (`app/_layout.tsx:136`), after `getDb()` resolves.

`isStaleLive` (`src/session/autoFinish.ts:8`) is already pure and unit-tested, so the
display-level status override needs no new logic.

**Behaviour change, stated plainly:** a stale-live session's *server* status may now lag
its displayed status by up to one app-open. It already could — the current sweep only
runs when someone happens to open a screen that lists sessions, and silently swallows
failures. Moving it to app start makes it *more* reliable, not less, while taking it off
the render path.

## Migration entries

One new `MIGRATIONS` entry appended to `src/db/db.ts` (index 7): the three `matches`
indexes from §1. Sections 2 and 3 are code changes with no schema component.

Per the project convention, this entry is appended and never edited afterward.

## States and failure modes

| Situation | Behaviour |
|---|---|
| Migration runs on a device with a large `matches` table | Index build is one-time, on a table of at most a few thousand rows. Inside the existing per-migration transaction. |
| `insertMany` called with zero rows | No-op, returns immediately. Must not emit `values ()`. |
| `insertMany` chunk boundary | Each chunk is its own statement inside the caller's existing transaction, so a mid-chunk failure still rolls the whole refresh back. |
| Sweep fails at app start | Silently ignored, as today. Retried next app open. |
| Session stale-live, sweep not yet run | UI shows `"done"` (local override); server still says `"live"`. Converges on next app open. |

## Verification

Unit-testable without native modules:

- `insertMany` SQL assembly: column list, placeholder groups, chunk boundaries, the
  zero-row case, and that flattened parameter order matches placeholder order.
- `isStaleLive` display override on `listSessions`' returned rows — already covered,
  extend for the read/sweep split.

Requires a device:

- `pragma user_version` advances and the three indexes exist after upgrade.
- `explain query plan` on the four `matches` queries shows index use, not `SCAN`.
- A club with 200+ players: `refreshClubs` statement count drops from ~200 to ~2.
- Home reload issues no `set_session_status` RPC even with a stale-live session present.
- Fresh install applies all migrations cleanly — the failure mode `schema.ts:28` warns
  about is fresh-installs-only, so this must be tested on a wiped app, not an upgrade.

## Out of scope

- Any change to what `playerAnalytics` computes or how often — that is P3.
- Supabase-side indexes — that is P4.
- `listAllMatches` remaining uncapped. The index makes its sort free, but it still
  materialises and JSON-parses every match on the device. Fixing that is P3's problem,
  since P3 is what removes the call from the render path.
