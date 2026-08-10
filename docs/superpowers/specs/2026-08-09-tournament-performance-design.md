# Tournament Read Performance — design

**Date:** 2026-08-09
**Status:** SHIPPED. Reverted once, verified, re-landed. History below.

## Implementation history

| Commit | What |
|---|---|
| `0eca806` | Task 1 — pure mappers (`src/tournament/bundle.ts`) + 9 tests. **Still on master.** |
| `f3052f5` | Task 2 — local cache (`src/repos/tournamentCache.ts`). **Still on master.** |
| `31b28d2` | Tasks 3-7 — RPC, read/refresh split, `startBracketMatch`, `BracketView`, screens |
| `d3dced2` | `0038` dropped `tournament_full_view` from production |
| `a8d5334` | Reverted `31b28d2` |
| `0040` | Restored the function, after verification |
| `669609e` | Reapplied `31b28d2` |

**What happened.** Migration `0037` reached the production database without its
authorisation cases having been verified by a human — notably the case where an
authenticated user with no relationship to the club must be *refused* rather than
served tournament data. It is a `security definer` function returning
`tournament_staff` rows and pending join requests. Rather than leave an unverified
privileged function live, it was dropped (`0038`). That left the client calling an
RPC that no longer existed, so the client was reverted too.

**Verification, then re-land.** The function was recreated on a **local**
database (`supabase start`, all migrations applied) and each actor impersonated
by setting `request.jwt.claims`, which is what `auth.uid()` reads. All six cases
passed:

| Case | Expected | Result |
|---|---|---|
| plain club member | rows; `staff=[]`, `requests=[]` | rows; 0, 0 |
| club owner | staff and requests populated | `staff=2`, `requests=1` |
| scorer, NOT a club member | rows; `my_staff_role='scorer'`; staff/requests withheld | as expected |
| **outsider (THE GATE)** | **RAISES `not authorised for this tournament`** | **raises** |
| unknown tournament id | RAISES `tournament not found` | raises |
| unauthenticated | RAISES `not authenticated` | raises |

Case 4 is the one that mattered — an authenticated user with no relationship to
the club is refused rather than served tournament data. Case 3 confirms the
separate property that a scorer invited into a club they do not belong to can
read the tournament without being treated as an admin.

`0040` restored the function with a body byte-identical to `0037`, and
`669609e` reapplied the client. **Nothing in the design or the SQL was found
wrong.** The original failure was purely that it shipped unverified.

Two implementation bugs *were* found and fixed while building, both recorded in
the plan's status banner: a third `getTournament` call site the plan missed
(`tournaments/edit/[id].tsx`, which must read network-only because it is a
form), and a `tabContent` gate that must be `panelOpen || isDraft` rather than
`panelOpen` alone.

**Still unverified: device behaviour.** Nothing below has been exercised on a
real device — instant second paint, offline cached render, `startBracketMatch`
at 2 round trips, and the two-admins-tap-Start concurrency case all remain
manual checks.

---

**Original status:** Design approved (planning only; no implementation yet)

The tournament bracket and ops screens take ~7 serial network round trips to paint,
show nothing at all until the last one lands, and repeat the whole sequence every 15
seconds. This makes them the slowest screens in the app by a wide margin. Everything
here is about **time to first paint** and **render cost**; no user-visible feature
changes.

This is P1 of four sub-projects split out of a broader performance brainstorm. P2
(local SQLite indexes and batch inserts), P3 (profile and analytics caching), and P4
(Supabase FK indexes) are separate specs.

## Context

Every other feature in the app renders from a local SQLite cache and refreshes in the
background: `clubs_cache`, `club_players_cache`, `sessions_cache`, `attendance_cache`,
and the `matches` / `match_events` tables. `clubRepo.refreshClubs()` is the reference
implementation of the pattern, and `app/(app)/index.tsx:50` is the reference consumer —
paint from cache, refresh, re-read.

Tournaments are the sole exception. `src/repos/tournamentRepo.ts` calls `supabase`
directly for every read, with no cache tier.

**The local tables already exist.** `src/db/schema.ts:3` creates `tournaments`,
`tournament_entrants`, and `bracket_matches` with indexes on `tournament_id`, and later
migrations add every column the UI needs (`courts`, `match_type`, `bestof`,
`finals_bestof`, `club_player_id_2`, `court`, `scored_by`). They are migrated on every
installed device today and sit empty. `tournamentRepo.deleteTournament` still cleans
them up, commented as legacy leftovers (`tournamentRepo.ts:358`).

So this work does not add a cache tier. It starts using one that is already deployed.

### Superseding the 2026-08-02 no-cache decision

`docs/superpowers/specs/2026-08-02-tournament-cloud-sync-design.md` §1 explicitly chose
"no local cache, no pull-and-replace step", reasoning that a cache "buys offline *reads*
of bracket state, but every *write* to bracket structure already needs a connection, so
a cache would only mask staleness without buying real offline capability."

That reasoning is sound **on the axis it considered**, which is offline capability. It
did not weigh paint latency. This spec supersedes that decision on the latency axis
only, and preserves its conclusion on the offline axis:

- **Unchanged:** every tournament *write* still requires a connection and still fails
  loudly offline. No optimistic writes, no write queue, no offline bracket editing.
- **Changed:** tournament *reads* paint from cache first, then reconcile against the
  network. The cache is a latency buffer, not an offline store.

The staleness concern is real and is addressed directly: a cache-first read is always
followed by a refresh, and the screen re-renders when the refresh lands. The user never
sees cached data as a terminal state — only as a first frame. Stale-and-then-corrected
beats blank-and-then-correct, because the blank period is currently ~7 round trips long.

## Scope

In scope:

1. Cache-first read path for tournaments, backed by the existing local tables.
2. A single `tournament_full_view` RPC replacing 4-7 serial queries.
3. `startBracketMatch` reduced from 6 network round trips to 2.
4. `BracketView` and `tournaments/[id].tsx` render cost.

Out of scope, with reasons in "Deferred" below: realtime subscriptions, the spectator
screen, offline writes, and any change to how points are scored or synced.

## 1. Read path

Three functions replace `getTournament`, mirroring `clubRepo`'s shape:

```ts
// SQLite only. Never touches the network. Returns null if not cached yet.
readTournament(id): Promise<TournamentBundle | null>

// One RPC, write-through to SQLite. In-flight guarded. Resolves when cache is fresh.
refreshTournament(id): Promise<void>

// getTournament() is deleted. Both call sites migrate to read + refresh.
```

`TournamentBundle` is the existing return shape of `getTournament` plus the staff data
the bracket screen fetches separately today:

```ts
type TournamentBundle = {
  tournament: TournamentRow;
  entrants: Entrant[];
  bracket: BracketMatch[];
  myStaffRole: StaffRole | null;
  staff: TournamentStaff[];
  requests: TournamentJoinRequest[];  // empty for non-admins
};
```

### Screen pattern

Both `app/(app)/tournaments/[id].tsx` and `app/(app)/tournaments/ops/[tournamentId].tsx`
adopt the pattern `app/(app)/index.tsx:50` already uses:

```
readTournament()   → paint (0 RTT)
  ↓
refreshTournament() → 1 RTT, background
  ↓
readTournament()   → repaint
```

The epoch-guard technique from `app/(app)/index.tsx:37` is reused verbatim: a
`useRef` counter bumped at the start of each reload and in the focus-effect cleanup,
checked before every `setState`. Without it, a refresh that resolves after the user has
navigated away writes into an unmounted screen, and a slow refresh can overwrite a newer
one.

A tournament opened for the first time on this device has no cache, so
`readTournament` returns null and the screen shows its existing loading state. This is
strictly no worse than today. Every subsequent open is instant.

### Entrant names resolve locally

Local `tournament_entrants` stores `club_player_id` and `club_player_id_2`, not names.
`club_players_cache` already holds every `club_players` row the user can see —
`refreshClubs()` selects them unfiltered (`clubRepo.ts:64`) — so `readTournament` joins
names locally with no network call:

```sql
select e.*, p1.name as name1, p2.name as name2
from tournament_entrants e
left join club_players_cache p1 on p1.id = e.club_player_id
left join club_players_cache p2 on p2.id = e.club_player_id_2
where e.tournament_id = ? order by e.seed
```

The existing `entrantName()` helper (`tournamentRepo.ts:25`) consumes this row shape
unchanged.

A name missing from `club_players_cache` (a player added on another device since the
last `refreshClubs`) falls back to the existing `"Player"` / `"P1"` / `"P2"` defaults,
and the subsequent `refreshTournament` — whose RPC joins names server-side — corrects
it. Degraded for one frame, never wrong at rest.

### The RPC

New migration adding `tournament_full_view(p_tournament_id uuid)`, modeled on the
existing `tournament_spectator_view` (`0017_tournament_spectator_view.sql`) but with
materially different security properties.

Returns, in one round set: the tournament row, its entrants with names joined
server-side, its bracket cells, the caller's staff role, the staff list, and pending
join requests.

This replaces, per screen load:

| Today | Calls |
|---|---|
| `select tournaments` | 1 |
| `select tournament_entrants` | 1 (serial, waits on above) |
| `select club_players in(ids)` | 1 (serial, waits on above) |
| `select bracket_matches` | 1 (serial) |
| `auth.getUser()` + `select tournament_staff` | 2 (inside `myStaffRole`) |
| `getTournamentStaff` + `listPendingTournamentRequests` | 2 (parallel) |
| **Total** | **~7, mostly serial** |

The four `getTournament` queries are serial because the object literal at
`tournamentRepo.ts:235` evaluates its properties in order — `loadBracket` does not start
until `loadEntrants` and its nested `loadEntrantNames` have both resolved.

**Why an RPC rather than `Promise.all`.** Parallelising would cut wall time to roughly
2 RTTs, which is most of the win and much less work. It cannot reach 1: `loadEntrantNames`
genuinely depends on `loadEntrants`' output. The RPC also moves the name join into
Postgres instead of round-tripping ids out and back, and gives the background refresh a
single failure point to reason about. Given the refresh runs on every focus of two
screens, 2 RTTs → 1 is worth one migration.

### Security

`tournament_spectator_view` is `security definer` and deliberately readable by anyone
holding the tournament id — it powers the public spectator link.

`tournament_full_view` must **not** inherit that property. It returns
`tournament_staff` rows and pending join requests, which are not public.

Requirements:

- `security definer`, but with an explicit membership check as its first statement:
  the caller must be a member of the tournament's club (`is_club_member(club_id)`),
  or have a `tournament_staff` row. Otherwise raise.
- `staff` and `requests` are returned only when the caller is an admin — club
  `owner`/`admin`, or `tournament_staff.role = 'admin'`. This mirrors exactly what the
  client computes today at `app/(app)/tournaments/[id].tsx:116` and gates
  `listPendingTournamentRequests` on at `:119`. Moving the gate server-side is a
  security improvement, not just a performance one: today a non-admin who called
  `listPendingTournamentRequests` directly would be stopped only by table RLS.
- `set search_path = ''` and fully-qualified table names, matching the project's
  existing `security definer` functions.

The client keeps computing `isAdmin` for UI purposes, but it is no longer the only
thing standing between a non-admin and the staff list.

## 2. Write path

`startBracketMatch` (`tournamentRepo.ts:286`) currently makes 7 serial network calls
before the scoring screen can open — 5 reads, then 2 writes. This is the "tapped Start,
nothing happened" delay. (An 8th call, `auth.getUser()` at `:323`, is normally served
from the local session and is not counted here.)

All 5 reads are removable once the cache exists:

| Call | Today | After |
|---|---|---|
| `select bracket_matches` (the cell) | network | local cache |
| `select tournaments` (config) | network | local cache |
| `loadEntrantSides` (entrants + names) | 2 network | derived from cached entrants |
| `loadBracket` (for `maxRound`) | network | local cache |
| `insert matches` | network | network — **kept** |
| `update bracket_matches ... is null` | network | network — **kept** |

Result: **2 round trips, from 7.**

Both remaining calls are load-bearing and stay:

- The `matches` insert must precede the link, because `bracket_matches.match_id` has a
  foreign key to `matches(id)` — established in the 2026-08-02 spec §2 and unchanged.
- The `.is("match_id", null)` guard on the link update is a real concurrency check. Two
  admins tapping Start on the same cell must produce one match and one
  `"This match was already started"` error. It stays exactly as written.

**Not moving this to an RPC.** A `start_bracket_match` RPC could reach 1 RTT, but the
null-guard and FK-ordering logic are subtle and correct today. Porting them into
PL/pgSQL risks a real concurrency bug to save one round trip on an action that already
navigates to a new screen. 7 → 2 is the win worth taking.

**Not making this optimistic.** Starting a match navigates to the scoring screen.
Navigating optimistically and then discovering the cell was already claimed would eject
the user from a live scoring screen — a worse failure than a one-second wait. The cell
shows a spinner while the two calls run.

`startBracketMatch` reads from cache, so it must tolerate a cold or stale cache: if
`readTournament` returns null, it falls back to `refreshTournament` first. The stale
case is already handled by the null-guard — a cell that looks unstarted in cache but was
started elsewhere fails on the link update with the existing error.

## 3. Render

`src/components/BracketView.tsx` uses **no `StyleSheet.create` at all**. Every style is
an inline object literal (`BracketView.tsx:93` onward). A 32-entrant draw is 31 cells ×
roughly 10 fresh objects each, reallocated on every render — and today every render is
triggered by a 15-second timer that fires whether or not anything changed.

In impact order:

1. **`StyleSheet.create` for all static styles.** Only `left`, `top`, and `borderColor`
   are genuinely dynamic; those stay as a second array element.
2. **Extract `BracketCell` as a `memo`'d component.** Today the cells are one inline
   `.map`, so there is no memo boundary anywhere — opening a sheet or toggling
   `refreshing` re-renders all 31 cells. Memoised on the cell's own fields plus its
   `liveScore` entry.
3. **`useMemo` `computeCenters` and `nameOf` on `[bracket, entrants]`.**
   `computeCenters` (`BracketView.tsx:22`) runs a `bracket.filter` inside a per-round
   loop, so it is O(rounds × cells) on every render.
4. **`useMemo` the parent's derived block.** `champ`, `champName`, `maxRound`,
   `finalMatch`, `runnerUpId`, `runnerUpName`, `isDraft`, `players`, and `blocker`
   (`app/(app)/tournaments/[id].tsx:171-185`) all recompute on every render, including
   two more `Math.max` sweeps over the bracket.
5. **Gate `tabContent` on `panelOpen`.** `app/(app)/tournaments/[id].tsx:213` constructs
   the active tab's element tree on every render even when the bottom sheet is closed —
   so `TournamentPlayersTab` and friends build their trees unconditionally. A
   `panelOpen &&` guard is the entire fix; no `React.lazy` refactor needed.

Combined with §1 making the refresh payload cheap, an idle bracket screen with nothing
changing should settle to zero renders between real changes, versus a full re-render
every 15 seconds today.

## 4. What stays exactly as it is

- The 15-second poll cadence. See "Deferred" below.
- Point-by-point scoring, `matchStore`, and `src/sync/runner.ts`. Untouched.
- The spectator screen and `tournament_spectator_view`. Untouched.
- Every tournament write requires a connection and fails loudly offline.
- All existing bracket UI, copy, and interaction.

## States and failure modes

| Situation | Behaviour |
|---|---|
| First open of a tournament on this device | No cache; existing loading state, then paint. No worse than today. |
| Subsequent open | Instant paint from cache, then background refresh. |
| Refresh fails (offline, RPC error) | Cached data stays on screen. Toast on explicit user-initiated refresh only, silent on the automatic one — matching `tournaments/index.tsx:24`'s existing "leave previously loaded rows on screen" rule. |
| Cache is stale vs server | Corrected on the refresh that always follows the read. Writes are additionally protected by their existing server-side guards. |
| `club_players_cache` missing an entrant's name | Falls back to existing `"Player"` default for one frame; the RPC's server-side join corrects it. |
| Two admins start the same cell | Unchanged — `.is("match_id", null)` guard yields one match and one error. |
| Non-admin calls `tournament_full_view` | Returns tournament/entrants/bracket; `staff` and `requests` come back empty. |
| Non-member calls it | Raises. |
| Screen unmounts mid-refresh | Epoch guard discards the result. |

## Verification

Unit-testable without native modules, following the existing `src/tournament/rows.ts`
convention of keeping pure mappers importable in plain Jest:

- Row mappers for the new cache reads/writes, including the entrant-name join fallback.
- `TournamentBundle` assembly from RPC payload shape.
- The admin gate's expected output shape for admin / non-admin / non-member.

Requires a device or Supabase instance:

- `tournament_full_view` returns identical data to today's 7-call sequence for an
  admin, a plain member, and a scorer.
- A non-member's call raises rather than returning rows.
- Round-trip count for a warm-cache screen open is 1 (verify via Supabase logs).
- `startBracketMatch` issues exactly 2 network calls (excluding any `auth.getUser()`
  served from the local session).
- Concurrency: two devices tapping Start on one cell — one match created, one error.
- Cold cache path: fresh install, open a tournament, confirm it paints and caches.

Render, measured not asserted:

- React DevTools profiler on a 16+ entrant bracket: confirm cells do not re-render when
  the refresh payload is unchanged.

## Deferred

**Realtime subscriptions on `bracket_matches`.** `docs/superpowers/specs/2026-08-06-brackets-realtime-design.md`
rejected realtime, correctly, for live *scores*: the scoring device only writes a
snapshot every 15s (`matchRepo.ts:94`), so a subscription would save only the gap
between that write and the next poll tick, at the cost of per-match channels and a hard
RLS problem for anonymous spectators.

That reasoning does not extend to bracket *structure*. Winner advancement, court
assignment, and scorer claim are discrete events, not 15s-cadenced, and on the ops
screen a 15-second delay is precisely the window in which two staff claim the same
match.

It is nonetheless deferred out of P1, because it addresses **freshness**, and the
reported problem is **paint latency**. Once §1 makes the poll cost 1 RTT instead of 7
and §3 makes an unchanged payload cost zero renders, most of the poll's actual cost is
gone. Revisit if staff report stale ops data after this ships.

A prerequisite, worth noting whenever it is revisited: no migration in this repo adds
any table to the `supabase_realtime` publication. The existing realtime features were
enabled by hand in the Supabase dashboard, which means realtime configuration cannot be
rebuilt from source. That should be captured in a migration regardless of whether
bracket realtime ever ships.

**Spectator screen.** `getTournamentSpectatorView` is a single RPC already and does not
have this problem.

**P2/P3/P4.** Local SQLite indexes and batch inserts; profile and analytics caching;
Supabase FK indexes (`supabase/migrations/0036_missing_fk_indexes.sql` is written but
unapplied). Separate specs.

## Open items

- Exact `tournament_full_view` return shape: one denormalised row set (spectator-view
  style, with the tournament's scalar fields repeated per bracket row) versus a single
  row of `jsonb` columns. The `jsonb` form is smaller on the wire and simpler to parse
  given the bundle has four independent collections; the denormalised form matches the
  existing spectator-view precedent. Decide during planning.
- Whether `refreshTournament` should also refresh `club_players_cache` when it detects
  an entrant name it cannot resolve locally, or leave that to the next `refreshClubs`.
  Leaning toward leaving it — the RPC already returns correct names, so the local
  fallback only affects the first frame.
