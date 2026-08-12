# Club match history pull — design

**Date:** 2026-08-12
**Status:** Design approved (planning only; no implementation yet)

## Problem

Sync is push-only for matches. `syncNow` (`src/sync/runner.ts:49`) calls `pushAll`, then
refreshes clubs and sessions. Nothing ever reads `matches` or `match_events` back down
from Supabase.

Consequence for a member who joins an existing club: the club screen's leaderboard is
`getClubStats(clubId)` → `listMatchesForClub` → `select * from matches where club_id = ?`
on the **local** SQLite table (`src/repos/matchRepo.ts:186`). A fresh joiner has zero
rows there, so a club with months of history renders as "No completed matches yet" and
`0 matches / 0 games / 0 players`. The club looks empty and dead to exactly the person
who just decided to join it.

The same gap hits the profile analytics screen (`getPlayerAnalytics` reads the same local
table), and any device that reinstalls the app or signs in on a second phone: their own
pushed history does not come back.

The roster half of the reported bug was fixed separately by ungating the club roster link
in `app/(app)/clubs/[id].tsx` — that data was already on device via `refreshClubs()`. This
spec covers only the match-history half.

## Constraints from the existing design

- **Matches are the source of truth locally, and events are append-only.** `match_events`
  has insert + select policies and no update/delete (`0001_init.sql:165`). A pull must
  never rewrite an event the device authored.
- **Unsynced local rows must survive.** `pushAll` keys off `synced = 0`. Overwriting a
  local row that has not been pushed yet would silently drop a scored match.
- **Local `matches` holds rows with `club_id is null`** (personal/quick matches) that are
  never pushed. A pull must not disturb them.
- **Match ids are client-generated uuids**, so a pulled row and a local row with the same
  id are the same match, not a collision.
- RLS already scopes `matches` and `match_events` reads to `is_club_member(club_id)`, so
  a plain `select` returns exactly the caller's clubs. No new policy is needed.

## Approach

Add `pullMatches()` to `src/sync/`, called from `syncNow` after `pushAll` and before
`refreshClubs`, so one sync leaves the device consistent in both directions.

1. **Watermark.** Store `last_match_pull_at` per user in the existing settings table
   (`SETTINGS_DDL` in `src/db/db.ts`). Pull `matches` where `updated_at > watermark`,
   ordered, paged. First run for a device pulls everything the user can read; that is
   bounded by club membership and acceptable at current data sizes.
   - `public.matches` has no `updated_at` column today (`0001_init.sql:74`, and no later
     migration adds one). The pull needs a migration adding
     `updated_at timestamptz not null default now()` plus a before-update touch trigger,
     otherwise a match that goes live → completed after the watermark never re-pulls.
     That migration is security-neutral but still lands in `supabase/migrations/`, which
     is not inert in this repo — review before it lands.
2. **Write rule.** For each pulled row: insert if absent; if present and local
   `synced = 1`, replace; if present and local `synced = 0`, **skip** — the local copy is
   newer and still owed to the server.
3. **Events.** For each pulled match id, `select match_id, seq, event from match_events
   where match_id in (...)`. Insert locally with `synced = 1` and **`insert or ignore`**, so
   an existing local row at the same `(match_id, seq)` always wins — that covers the
   unsynced-local-event case without a max-seq calculation, and it also fills gaps below
   the local max seq. Never update, never delete.
4. **Batching.** Reuse `insertMany` from `src/db/batch.ts` — same variable budget and
   single-transaction shape as `refreshClubs`.
5. **Failure mode.** A failed pull leaves the watermark unmoved and returns; the device
   keeps showing what it has, exactly like `refreshClubs`' `return // stay on cache`.

## Out of scope

- Realtime match updates (the app already has a separate realtime path for tournaments).
- Backfilling `match_events` for matches whose events were never pushed.
- Conflict resolution beyond the `synced` flag rule above — matches are append-only in
  practice, so last-writer-wins on the summary row is sufficient.

## Verification

`src/sync/` is pure enough to unit test under the node Jest environment if the store is
injected the way `SyncStore`/`SyncClient` already are in `pushAll`. Cover:

- pulled row absent locally → inserted
- pulled row present, `synced = 1` → replaced
- pulled row present, `synced = 0` → left alone
- events inserted with `or ignore`, so a local row at the same `(match_id, seq)` survives
- `club_id is null` local rows untouched

Device check: sign in on a second account, join a club with history, confirm the
leaderboard and match counts populate.
