# Web guest-match storage via Supabase anon rows

**Date:** 2026-09-01
**Status:** Approved, not yet implemented
**Scope:** Storage adapter only. PWA packaging (manifest, service worker, icons,
iOS install onboarding) is a separate spec.

## Problem

`npm run build:web` produces a working bundle, but the core flow is dead on web:

- `src/repos/matchRepo.ts` persists matches and events **only** to `expo-sqlite`.
- `src/db/db.web.ts` deliberately returns `null` from `getDb()` to keep the wasm
  asset out of the web bundle.
- Result: `createMatch` writes nothing, `getMatch` returns `null`, and
  `app/score/[matchId].tsx:30` renders a permanent blank `<View>`.
- `listMatches()` returns `[]`, so "My matches" is always empty.

Quick match — create, score, resume, history — is the only thing the guest web
build exists to do, and none of it works.

`src/sync/runner.ts:19` filters `where synced = 0 and club_id is not null`, so
quick matches (null `club_id`) have never synced to Supabase on any platform.
Migration `0018_anon_rls_restrictions.sql` states the intent explicitly: guest
matches are "the local-only matches table (never synced)". This design adds a
web-only sync path that did not previously exist. Native behaviour is unchanged.

## Approach

Metro already resolves `*.web.ts` siblings per platform (`src/db/db.web.ts` is
the precedent). Add `src/repos/matchRepo.web.ts` implementing the same exports
against Supabase, backed by two new anon-scoped tables. `src/stores/matchStore.ts`
(`import * as repo from "../repos/matchRepo"`) and every screen caller are
untouched — they bind to whichever module Metro resolves.

Guest sessions are already anonymous Supabase sessions (`app/_layout.tsx:111`
calls `signInAnonymously()` for every web visitor), so `auth.uid()` is a stable
per-device owner key with no new auth work.

### Alternatives rejected

- **Extend `public.matches`**: requires making `club_id` nullable, relaxing the
  `created_by -> profiles` FK, and adding an anon INSERT policy to a table whose
  RLS is club-member scoped and whose rows feed the native club-sync pull. Mixes
  anon rows into synced club data. Larger blast radius for no code saving —
  `matchRepo.web.ts` is needed either way.
- **Re-enable `expo-sqlite` web (wasm)**: keeps engine code identical but adds
  ~400 KB wasm to the bundle and puts match data under Safari's 7-day
  storage-eviction window. Offline capability is not a web goal (see Non-goals).
- **IndexedDB adapter**: most control, most code, and still device-local with
  eviction risk. No upside over Supabase given the anon session already exists.

## Data model

New migration, additive only. No changes to existing tables, policies, views, or
functions.

```sql
create table public.guest_matches (
  id            uuid primary key,
  config        jsonb not null,
  side_a        jsonb not null,          -- [{club_player_id: null, name}]
  side_b        jsonb not null,
  status        text not null default 'live'
                  check (status in ('live','completed','forfeited')),
  winner        text check (winner in ('A','B')),
  score_summary jsonb,                   -- denormalised from replay() for list rendering
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
```

### RLS — owner-only, every verb, `to authenticated`

```sql
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
```

- `for all` covers SELECT / INSERT / UPDATE / DELETE. DELETE on events is
  required — undo physically removes rows (`removeEventsAfter`).
- Not gated on `is_anonymous`. A real signed-in account on the web build is
  still app-gated to guest mode, so allowing it to own `guest_matches` rows is
  harmless and keeps the policy simple.
- `on delete cascade` from `auth.users`: when Supabase eventually reaps an
  anonymous user, their rows go with it.

### Retention — pg_cron

Requires the `pg_cron` extension enabled on the project (dashboard →
Database → Extensions, or `create extension pg_cron;`). This is a
prerequisite step, called out separately in the implementation plan.

```sql
select cron.schedule(
  'purge-guest-matches',
  '17 3 * * *',
  $$ delete from public.guest_matches
     where created_at < now() - interval '30 days' $$
);
```

`guest_match_events` cascades on the delete. 30 days bounds table growth without
a migration to revisit.

## Web repo adapter — `src/repos/matchRepo.web.ts`

Mirrors every export of `src/repos/matchRepo.ts` with identical signatures and
the `MatchRecord` / `SidePlayer` shapes. Backed by `supabase` from
`src/lib/supabase.ts`.

| Export | Web implementation |
|---|---|
| `createMatch(config, sideA, sideB, _clubId, _sessionId)` | `id = Crypto.randomUUID()`; resolve `auth.getUser()`; `insert into guest_matches (id, config, side_a, side_b, created_by)`; `club_id` / `session_id` args ignored (always null for guest); throws a friendly `Error` if there is no session |
| `appendEvent(matchId, seq, event)` | `insert into guest_match_events (match_id, seq, event) ... on conflict (match_id, seq) do nothing` (idempotent, mirrors native `insert or ignore`) |
| `removeEventsAfter(matchId, lastKeptSeq)` | `delete from guest_match_events where match_id = ? and seq > ?` (no `synced` guard — no sync concept here) |
| `loadEvents(matchId)` | `select event from guest_match_events where match_id = ? order by seq`; `[]` when none |
| `finalizeMatch(matchId, state)` | `update guest_matches set status = 'completed', winner = ?, score_summary = ?` |
| `updateLiveScore(matchId, state)` | `update guest_matches set score_summary = ?` (never resurrects `status`/`winner` after completion — same guard as native) |
| `endMatchEarly(matchId, state)` | `update guest_matches set status = 'forfeited'|'completed', winner = ?, score_summary = ?` per the native rules |
| `getMatch(matchId)` | `select * from guest_matches where id = ?`; map row -> `MatchRecord`; `null` when missing |
| `listMatches()` | `select * from guest_matches where created_by = auth.uid() order by created_at desc limit 100` |
| `replayMatch(matchId)` | `loadEvents(matchId)` then `replay()` — same as native |
| `listMatchesForClub`, `listMatchesForSession`, `listAllMatches`, `endLiveMatchesForSession` | return `[]` / no-op — guest never navigates to club, session, tournament, or profile-analytics screens |

The only non-trivial logic is the `row -> MatchRecord` mapper (jsonb columns
come back parsed; `created_at` is an ISO string that must become the epoch-ms
number `MatchRecord` uses). It is a pure function, unit-tested.

`replay()` is imported from `../engine` exactly as the native repo does; no
shared helper module needed.

## History list

`app/guest/matches.tsx` currently reads a localStorage id list
(`getGuestMatchIds()`) and calls `getMatch` per id. Change:

```ts
const rows = Platform.OS === "web"
  ? await listMatches()                       // already auth.uid()-scoped by RLS
  : await Promise.all(ids.map((id) => getMatch(id)));
```

On web, RLS scopes `listMatches()` to the current anonymous user, so the
localStorage id list is redundant. `src/lib/guestMatches.ts` and the
`recordGuestMatch(id)` call in `app/new-match.tsx:379` become native-only —
guard the call site with `Platform.OS !== "web"`. `guestMatches.ts` itself keeps
its existing web branch (harmless dead code path once the call site is guarded)
or the guard can be pushed into the module; implementer's choice, no behaviour
difference.

Native guest history is deliberately left on the id-list mechanism: native
`listMatches()` returns every local match including rows from a previous
signed-in account on a shared device, which is exactly why the session-scoped id
list exists there.

## Cadence, realtime, edge cases

- **Live-score writes**: `matchStore` fires `updateLiveScore` every
  `LIVE_TICK_MS` (15s) while a match is live and not over — one UPDATE per 15s.
  Acceptable write rate.
- **Realtime**: no `supabase_realtime` publication for these tables. Quick match
  is single-device with no spectators. Verify `getRealtimeBackend()`
  (`src/realtime`) is a clean no-op on web; it is native-guarded and should be.
- **Resume mid-match**: reload -> `matchStore.open(matchId)` -> `loadEvents`
  rebuilds `MatchState` from the event log. Works once events are in Supabase.
- **Offline**: web quick match is online-only. A connection drop mid-match loses
  taps made while offline. Accepted.
- **No session at `createMatch` time**: the anonymous sign-in from
  `app/_layout.tsx` can still be in flight. `createMatch` guards on
  `auth.getUser()` and throws; `app/new-match.tsx` `start()` already catches and
  shows a toast. By the time a user has filled four names and tapped Start
  scoring the session realistically exists, so this is a rare-race safety net.

## Migration safety

The migration only creates new tables, policies, an index, and a cron job. It
does not alter or drop anything. Blast radius is limited to the two new tables.
Still: the migration file must be reviewed before it lands (writing a file under
`supabase/migrations/` is not inert in this project), and `pg_cron` must be
enabled on the project first or the `cron.schedule` call fails.

## Testing

1. **Node / jest** — unit test the `row -> MatchRecord` mapper and the
   query-builder calls in `matchRepo.web.ts` against a fake supabase client.
   Confirm the existing jest config does not resolve `.web.ts` so the current
   suite keeps running against `matchRepo.ts` and stays green.
2. **RLS** — manual check with two anonymous sessions: user B's
   `select from guest_matches` and `select from guest_match_events` return zero
   of user A's rows; B cannot `update` or `delete` A's rows. Record the steps in
   the implementation plan.
3. **Manual browser E2E** — `npm run build:web`, serve `dist/`, then:
   create a doubles match -> score to game/match point -> reload mid-game and
   confirm resume -> undo a point -> end early -> confirm "My matches" lists it
   with the right score summary.

## Non-goals

- Offline scoring on web.
- PWA manifest, service worker, app icons, offline shell.
- iOS "Add to Home Screen" onboarding.
- Orientation-lock behaviour on `MatchScreen` for web (needs its own check).
- Any change to native persistence, native sync, or `public.matches`.
- Accounts, clubs, sessions, tournaments-as-organiser, stats, or profile on the
  web build — all remain gated behind non-anonymous auth.
