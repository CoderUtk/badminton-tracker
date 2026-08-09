# Profile & Analytics Caching — design

**Date:** 2026-08-09
**Status:** Design approved (planning only; no implementation yet)

P3 of four performance sub-projects. Two things on Home's critical path that cost far
more than they should: `getMyProfile()` hits the network on every call from five call
sites, and `getPlayerAnalytics()` reads every match ever recorded on the device and
recomputes lifetime statistics on every screen focus.

No user-visible feature changes. Depends on P2 only for convenience (the `matches`
indexes make the analytics read cheaper); the two can ship in either order.

## 1. Profile caching

`getMyProfile()` (`src/repos/profileRepo.ts:19`) makes two network calls every time —
`auth.getUser()` then a `profiles` select — and has no cache of any kind.

Call sites:

| Caller | When |
|---|---|
| `app/_layout.tsx:67` (`Gate`) | Every session change and every `profileTick` |
| `app/(app)/index.tsx:59` (Home) | Every focus, twice per reload |
| `app/(app)/profile/index.tsx:51` | Every focus |
| `app/welcome.tsx:39` | Onboarding mount |
| `src/lib/shareJoin.ts:24` | Every share action |

Home's reload calls it inside `loadFromCache`, which runs **twice per reload** by design
(`app/(app)/index.tsx:71-77`). So one Home focus is 4 network calls for a profile that
changes perhaps monthly.

Worse, `Gate` gates navigation on it (`_layout.tsx:99`: `if (needsName === undefined)
return`), so a slow profile fetch delays routing at app start.

### Design

A `profile_cache` local table plus an in-memory memo, following `clubRepo`'s
read/refresh split:

```sql
create table if not exists profile_cache (
  id text primary key,
  display_name text not null default '',
  display_name_set integer not null default 0,
  age integer,
  hand text,
  avatar_url text,
  username text not null default ''
);
```

```ts
readMyProfile(): Promise<Profile | null>     // memo → SQLite. No network.
refreshMyProfile(): Promise<Profile | null>  // network → write-through → memo.
getMyProfile(): Promise<Profile | null>      // kept as read-then-refresh-in-background
```

`getMyProfile` keeps its name and signature so the five call sites do not all have to
change shape. Its semantics become: resolve from cache immediately if present, and fire
a background refresh; if there is no cache, await the network as today.

**The in-memory memo matters as much as the table.** Within a single Home reload,
`getMyProfile` is called twice; a module-level memo makes the second call free without
even touching SQLite. The memo is invalidated by the existing `listeners` mechanism —
every writer in `profileRepo` already calls `listeners.forEach(...)` after a successful
write (`profileRepo.ts:55`, `:74`, `:89`, `:109`, `:121`, `:139`), so the invalidation
hook is a single subscriber added inside the module.

**Sign-out must clear both.** `src/stores/session.tsx:66` already handles the
`onAuthStateChange` null case; it gains a `clearProfileCache()` call. Without this, the
next user to sign in on the same device sees the previous user's cached name for one
frame. That is a correctness bug, not a performance one — it is the main risk in this
section and must be covered by a test.

**`Gate` keeps its correctness property.** `needsName === undefined` means "profile in
flight, do not redirect on a guess" (`_layout.tsx:59`). With a cache, the first render
after app start usually has a value immediately, so the undefined window shrinks —
but the guard stays exactly as written, because a first-ever launch still has no cache.

## 2. Analytics caching

`getPlayerAnalytics(name)` (`src/repos/statsRepo.ts:6`) does:

1. `listAllMatches()` — every match row on the device, uncapped, `JSON.parse` on four
   columns per row (`matchRepo.ts:200`).
2. Filters for matches containing `name`, collects session ids.
3. `getSessionLocations(sessionIds)` — a second query.
4. `playerAnalytics(matches, name, locations)` — a single pass over every match
   computing ~25 aggregates (`src/analytics/player.ts:75`).

Called from Home on every focus (`app/(app)/index.tsx:66`) and the profile screen
(`app/(app)/profile/index.tsx:204`).

The pure function is not the problem — it is one linear pass and it is well-tested. The
problem is doing all of it, over full lifetime history, on every focus, when the answer
only changes when a match completes.

### Design: cache keyed on a cheap fingerprint

Not incremental aggregation. `playerAnalytics` computes streaks, day/month histograms,
best-partner and toughest-opponent pairings, and flags like `comebackKid` — several of
which are order-dependent and cannot be correctly folded in one match at a time without
duplicating the logic. Duplicating it is how the cached and uncached paths drift apart.

Instead: keep the pure function exactly as it is, call it far less often.

```sql
create table if not exists analytics_cache (
  name text primary key,
  fingerprint text not null,
  payload text not null,     -- JSON PlayerAnalytics
  computed_at integer not null
);
```

The fingerprint is a cheap aggregate over the inputs the function actually reads:

```sql
select count(*) as n, coalesce(max(created_at), 0) as newest
from matches where status = 'completed'
```

If `n` and `newest` both match the cached fingerprint, return the cached payload. This
is one indexed aggregate query (free once P2's `matches_created` index exists) versus
reading and parsing every row.

**Why this fingerprint is sufficient, and where it is not.** It catches the only mutation
that happens in normal use — a match completing, which raises both `n` and `newest`.
It does *not* catch an edit that changes a completed match's contents without changing
the count or the max timestamp. Two such paths exist:

- `endMatchEarly` / `finalizeMatch` flip an existing row from `live` to `completed`,
  which changes `n`. Caught.
- A backfill or re-sync that rewrites `score_summary` on an already-completed row would
  not be caught.

The second is not a path the app exercises today. To keep it from becoming a silent
staleness bug later, the fingerprint includes a third term that is still cheap:

```sql
select count(*), coalesce(max(created_at),0), coalesce(sum(length(score_summary)),0)
from matches where status = 'completed'
```

`sum(length(...))` changes if any score summary is rewritten to a different length. It
is not a hash and does not claim to be — it is a cheap tripwire that costs one extra
aggregate over the same scan.

**`venues` needs care.** `PlayerAnalytics.venues` is a `Set<string>`
(`src/analytics/player.ts:47`), which `JSON.stringify` serialises as `{}`. The cache
layer must convert to and from an array explicitly. This is the single easiest bug to
introduce here and needs its own test.

**Invalidation is by fingerprint only** — no manual cache-busting calls scattered through
the write paths. A mismatch recomputes and rewrites. Rows are keyed by player name, and
a name the user no longer uses simply goes stale and unread; a periodic cleanup is not
worth the code.

## 3. Removing analytics from Home's critical path

Even cached, the analytics read sits in the middle of Home's sequential chain
(`app/(app)/index.tsx:50-69`): clubs → sessions → profile → club players → analytics,
each awaiting the last.

Only the analytics step depends on the profile step (it needs the resolved player name).
Clubs and sessions are independent of both.

**Fix:** restructure `loadFromCache` so the independent reads start together:

```ts
const [clubsNow, sessionsNow, profile, players] = await Promise.all([
  listRealClubs(), listSessions(), getMyProfile(), listMyClubPlayers(),
]);
// ... then, dependent on profile + players:
const stats = name ? await getPlayerAnalytics(name) : null;
```

The epoch guard (`app/(app)/index.tsx:37`) still applies before each `setState` — it
just moves to after the `Promise.all` rather than being interleaved.

**Trade-off, named:** today each `setState` lands as its data arrives, so clubs appear
before analytics. Batching means one later repaint instead of four progressive ones.
With everything served from cache, all four resolve in single-digit milliseconds and the
progressive paint has no user-visible value — it exists only because the chain was slow.
If the cold-cache case (first ever launch) feels worse in testing, the fix is to keep
`setClubs` firing early and batch only the rest.

## States and failure modes

| Situation | Behaviour |
|---|---|
| First launch, no profile cache | Awaits network as today. No regression. |
| Profile refresh fails | Cached profile stays. `Gate` uses cached `displayNameSet`, so routing still works offline. |
| Sign-out then different user signs in | Cache cleared on the `onAuthStateChange` null branch. Must be tested. |
| Profile edited on another device | Corrected on the next background refresh. Stale for at most one screen focus. |
| Analytics fingerprint matches | Cached payload returned. Zero match rows read. |
| Fingerprint mismatch | Full recompute, cache rewritten. Same cost as today. |
| `analytics_cache` payload fails to parse | Treat as a miss and recompute. Never throw into the render path — Home's existing `.catch` (`index.tsx:78`) must not become the thing that saves this. |
| Two players share a display name | Keyed by name, as the current function already is. Behaviour unchanged. |

## Verification

Unit-testable without native modules:

- `PlayerAnalytics` round-trips through serialise/deserialise with `venues` intact as a
  `Set` — the specific failure this section is most likely to introduce.
- Fingerprint equality and mismatch drive hit versus recompute.
- Corrupt cached payload falls back to recompute rather than throwing.
- Profile memo invalidation fires on each writer in `profileRepo`.

Requires a device:

- Home focus with a warm cache issues zero `profiles` selects and zero match-table reads.
- Complete a match, return to Home: stats update (fingerprint changed).
- Sign out, sign in as a different account: no trace of the previous user's name or
  stats at any point, including the first frame.
- Airplane mode: Home still paints name, clubs, and stats from cache.
- Cold launch to first navigable frame — compare against `Gate`'s current profile-fetch
  delay.

## Out of scope

- Changing what `playerAnalytics` computes. The pure function is untouched.
- Incremental or streaming aggregation. Rejected above.
- Server-side analytics. All inputs are already local; this is not a query problem.
- `listAllMatches` remaining uncapped — with the cache in front it is called rarely
  enough that capping it would only risk changing lifetime-milestone correctness, which
  is exactly why `matchRepo.ts:164` documents it as deliberately uncapped.
