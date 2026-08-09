# Profile & Analytics Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop re-fetching the profile from the network on every screen focus, and stop recomputing lifetime analytics over every match on the device on every Home focus.

**Architecture:** Two local cache tables plus an in-memory memo, following `clubRepo`'s read/refresh split. Analytics keeps its existing pure function untouched and is gated behind a cheap fingerprint over the inputs. DDL lives in `src/db/schema.ts` so Jest can assert on it; serialisation lives in a pure module for the same reason.

**Tech Stack:** expo-sqlite, Supabase, TypeScript, Jest + ts-jest (node env).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-09-profile-analytics-caching-design.md`.
- **Never edit an applied `MIGRATIONS` entry.** Append only. P2 added index 7; this plan adds index 8.
- **DDL constants go in `src/db/schema.ts`.** `src/db/db.ts` imports `Platform` from `react-native` and cannot load under the node test environment.
- **`playerAnalytics` in `src/analytics/player.ts` is NOT modified.** Its 301-test suite must stay green.
- **Commits use explicit pathspecs.** Never `git add -A` / `.` / `-a`.
- **Run `npx tsc --noEmit && npm test` before every commit.**

## File Structure

**Create:**
- `src/analytics/serialize.ts` — `PlayerAnalytics` ↔ JSON, handling the `venues` Set.
- `src/repos/analyticsCache.ts` — fingerprint + cache read/write.
- `tests/analyticsSerialize.test.ts`
- `tests/analyticsFingerprint.test.ts`

**Modify:**
- `src/db/schema.ts` — `PROFILE_ANALYTICS_CACHE_DDL`.
- `src/db/db.ts` — append migration index 8.
- `src/repos/profileRepo.ts` — memo + cache.
- `src/repos/statsRepo.ts` — fingerprint gate.
- `src/stores/session.tsx` — clear cache on sign-out.
- `app/(app)/index.tsx` — parallelise the read chain.

---

### Task 1: Cache table DDL

**Files:** Modify `src/db/schema.ts`, `src/db/db.ts`. Create `tests/schema.cacheTables.test.ts`.

**Interfaces:** Produces `PROFILE_ANALYTICS_CACHE_DDL`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/schema.cacheTables.test.ts
import { PROFILE_ANALYTICS_CACHE_DDL } from "../src/db/schema";

test("declares the profile cache with a single-row shape", () => {
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(
    /create table if not exists profile_cache/
  );
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/id text primary key/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/display_name_set integer/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/username text/);
});

test("declares the analytics cache keyed by player name", () => {
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(
    /create table if not exists analytics_cache/
  );
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/name text primary key/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/fingerprint text not null/);
  expect(PROFILE_ANALYTICS_CACHE_DDL).toMatch(/payload text not null/);
});

test("is re-runnable", () => {
  const statements = PROFILE_ANALYTICS_CACHE_DDL
    .split(";").map((s) => s.trim()).filter(Boolean);
  expect(statements).toHaveLength(2);
  for (const s of statements) expect(s).toMatch(/if not exists/);
});
```

- [ ] **Step 2: Run to confirm failure.** `npx jest tests/schema.cacheTables.test.ts` → FAIL, not exported.

- [ ] **Step 3: Add the DDL**

Append to `src/db/schema.ts`:

```ts
// Profile and analytics caches.
//
// profile_cache: getMyProfile() previously made two network calls (auth.getUser
// then a profiles select) on every call, from five call sites — including Gate,
// which blocks routing on it, and Home, which calls it twice per reload.
//
// analytics_cache: getPlayerAnalytics() read every match on the device and
// recomputed ~25 lifetime aggregates on every Home focus. The payload is the
// JSON-serialised PlayerAnalytics; fingerprint is a cheap aggregate over the
// completed-match rows the computation actually reads.
//
// A SEPARATE migration entry appended to the list in db.ts.
export const PROFILE_ANALYTICS_CACHE_DDL = `
create table if not exists profile_cache (
  id text primary key,
  display_name text not null default '',
  display_name_set integer not null default 0,
  age integer,
  hand text,
  avatar_url text,
  username text not null default ''
);
create table if not exists analytics_cache (
  name text primary key,
  fingerprint text not null,
  payload text not null,
  computed_at integer not null
);
`;
```

- [ ] **Step 4: Append migration.** Add `PROFILE_ANALYTICS_CACHE_DDL` to the `./schema` import in `src/db/db.ts` and append it as the last `MIGRATIONS` element (after `MATCH_INDEXES_DDL`).

- [ ] **Step 5: Verify.** `npx jest tests/schema.cacheTables.test.ts && npx tsc --noEmit` → PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/db.ts tests/schema.cacheTables.test.ts
git commit -m "feat(db): profile and analytics cache tables"
```

---

### Task 2: Analytics serialisation

**Files:** Create `src/analytics/serialize.ts`, `tests/analyticsSerialize.test.ts`.

**Interfaces:** Produces `serializeAnalytics(a: PlayerAnalytics) => string`, `deserializeAnalytics(json: string) => PlayerAnalytics | null`.

> `PlayerAnalytics.venues` is a `Set<string>` (`src/analytics/player.ts:47`). `JSON.stringify` renders a Set as `{}`, silently losing it. This is the single easiest bug in P3 and is what this task exists to prevent.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/analyticsSerialize.test.ts
import { serializeAnalytics, deserializeAnalytics } from "../src/analytics/serialize";
import { playerAnalytics } from "../src/analytics/player";
import type { MatchRecord } from "../src/repos/matchRepo";

const match = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  id: "m1", club_id: "c1", session_id: "s1",
  config: { matchType: "singles", pointsToWin: 21, bestOf: 3 } as MatchRecord["config"],
  side_a: [{ club_player_id: "p1", name: "Ana" }],
  side_b: [{ club_player_id: "p2", name: "Bo" }],
  status: "completed", winner: "A",
  score_summary: { games: [{ A: 21, B: 15 }, { A: 21, B: 18 }] },
  created_at: Date.UTC(2026, 7, 1, 12, 0), ...over,
});

test("round-trips venues as a Set, not an empty object", () => {
  const a = playerAnalytics([match()], "Ana", new Map([["s1", "Main Hall"]]));
  expect(a.venues.has("Main Hall")).toBe(true);
  const back = deserializeAnalytics(serializeAnalytics(a));
  expect(back).not.toBeNull();
  expect(back!.venues).toBeInstanceOf(Set);
  expect(back!.venues.has("Main Hall")).toBe(true);
});

test("naive JSON.stringify would have lost venues", () => {
  // Guards the reason this module exists.
  const a = playerAnalytics([match()], "Ana", new Map([["s1", "Main Hall"]]));
  expect(JSON.parse(JSON.stringify(a)).venues).toEqual({});
});

test("preserves every scalar and array field", () => {
  const a = playerAnalytics([match()], "Ana", new Map());
  const back = deserializeAnalytics(serializeAnalytics(a))!;
  expect(back.played).toBe(a.played);
  expect(back.wins).toBe(a.wins);
  expect(back.winPct).toBe(a.winPct);
  expect(back.form).toEqual(a.form);
  expect(back.recent).toEqual(a.recent);
  expect(back.bestPartner).toEqual(a.bestPartner);
  expect(back.longestWinStreak).toBe(a.longestWinStreak);
  expect(back.flawlessVictory).toBe(a.flawlessVictory);
});

test("returns null on corrupt JSON rather than throwing", () => {
  expect(deserializeAnalytics("{not json")).toBeNull();
});

test("returns null when the payload is missing required fields", () => {
  expect(deserializeAnalytics('{"played":3}')).toBeNull();
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement**

```ts
// src/analytics/serialize.ts
//
// PlayerAnalytics carries a Set (venues), which JSON.stringify renders as {}.
// Every cached payload must go through here rather than raw JSON.
import type { PlayerAnalytics } from "./player";

export function serializeAnalytics(a: PlayerAnalytics): string {
  return JSON.stringify({ ...a, venues: [...a.venues] });
}

export function deserializeAnalytics(json: string): PlayerAnalytics | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    // A payload written by an older build, or a truncated write, must read as
    // a cache miss rather than surfacing as undefined fields in the UI.
    if (typeof raw.played !== "number" || !Array.isArray(raw.venues)) return null;
    return { ...raw, venues: new Set(raw.venues as string[]) } as unknown as PlayerAnalytics;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Verify.** `npx jest tests/analyticsSerialize.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/analytics/serialize.ts tests/analyticsSerialize.test.ts
git commit -m "feat(analytics): Set-safe serialisation for cached payloads"
```

---

### Task 3: Fingerprint and analytics cache

**Files:** Create `src/repos/analyticsCache.ts`, `tests/analyticsFingerprint.test.ts`. Modify `src/repos/statsRepo.ts`.

**Interfaces:** Produces `fingerprintOf(row) => string`, `readCachedAnalytics(name, fingerprint)`, `writeCachedAnalytics(name, fingerprint, analytics)`, `currentFingerprint()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/analyticsFingerprint.test.ts
import { fingerprintOf } from "../src/repos/analyticsCache";

test("changes when a match completes", () => {
  const before = fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 });
  const after = fingerprintOf({ n: 11, newest: 2000, summaryLen: 560 });
  expect(before).not.toBe(after);
});

test("is stable for identical inputs", () => {
  expect(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }))
    .toBe(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }));
});

test("catches a rewritten score summary that leaves count and max intact", () => {
  // The tripwire case: a backfill rewrites score_summary without adding rows.
  expect(fingerprintOf({ n: 10, newest: 1000, summaryLen: 500 }))
    .not.toBe(fingerprintOf({ n: 10, newest: 1000, summaryLen: 610 }));
});

test("treats an empty table as a valid fingerprint", () => {
  expect(fingerprintOf({ n: 0, newest: 0, summaryLen: 0 })).toBeTruthy();
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement**

```ts
// src/repos/analyticsCache.ts
//
// getPlayerAnalytics reads every match on the device and recomputes ~25
// lifetime aggregates. The answer only changes when the completed-match set
// changes, so gate it on a cheap aggregate rather than recomputing on focus.
import { getDb } from "../db/db";
import { serializeAnalytics, deserializeAnalytics } from "../analytics/serialize";
import type { PlayerAnalytics } from "../analytics/player";

export type FingerprintInput = { n: number; newest: number; summaryLen: number };

/**
 * n and newest catch the normal mutation: a match completing raises both.
 * summaryLen is a tripwire for a rewrite that changes neither — not a hash,
 * and not claimed to be, but it costs nothing over the same aggregate scan.
 */
export function fingerprintOf(i: FingerprintInput): string {
  return `${i.n}:${i.newest}:${i.summaryLen}`;
}

export async function currentFingerprint(): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ n: number; newest: number; summary_len: number }>(
    `select count(*) as n,
            coalesce(max(created_at), 0) as newest,
            coalesce(sum(length(score_summary)), 0) as summary_len
     from matches where status = 'completed'`
  );
  if (!row) return null;
  return fingerprintOf({ n: row.n, newest: row.newest, summaryLen: row.summary_len });
}

export async function readCachedAnalytics(
  name: string, fingerprint: string
): Promise<PlayerAnalytics | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ fingerprint: string; payload: string }>(
    "select fingerprint, payload from analytics_cache where name = ?", name
  );
  if (!row || row.fingerprint !== fingerprint) return null;
  // A corrupt payload reads as a miss; never throw into a render path.
  return deserializeAnalytics(row.payload);
}

export async function writeCachedAnalytics(
  name: string, fingerprint: string, analytics: PlayerAnalytics
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(
    `insert into analytics_cache (name, fingerprint, payload, computed_at)
     values (?, ?, ?, ?)
     on conflict(name) do update set
       fingerprint = excluded.fingerprint,
       payload = excluded.payload,
       computed_at = excluded.computed_at`,
    name, fingerprint, serializeAnalytics(analytics), Date.now()
  );
}
```

- [ ] **Step 4: Gate `getPlayerAnalytics`**

Rewrite `src/repos/statsRepo.ts`:

```ts
import { playerAnalytics, type PlayerAnalytics } from "../analytics/player";
import { listAllMatches } from "./matchRepo";
import { getSessionLocations } from "./sessionRepo";
import { currentFingerprint, readCachedAnalytics, writeCachedAnalytics } from "./analyticsCache";

/**
 * Lifetime analytics for one player, across every match on the device.
 *
 * Gated on a cheap fingerprint: when the completed-match set is unchanged
 * since the last computation, the cached payload is returned without reading
 * or parsing a single match row.
 */
export async function getPlayerAnalytics(name: string): Promise<PlayerAnalytics> {
  const fingerprint = await currentFingerprint();
  if (fingerprint) {
    const cached = await readCachedAnalytics(name, fingerprint);
    if (cached) return cached;
  }

  const matches = await listAllMatches();
  const sessionIds = [...new Set(
    matches.filter((m) => m.side_a.some((p) => p.name === name) || m.side_b.some((p) => p.name === name))
      .map((m) => m.session_id)
      .filter((id): id is string => !!id)
  )];
  const sessionLocations = await getSessionLocations(sessionIds);
  const result = playerAnalytics(matches, name, sessionLocations);
  if (fingerprint) await writeCachedAnalytics(name, fingerprint, result);
  return result;
}

export type { PlayerAnalytics };
```

- [ ] **Step 5: Verify.** `npx jest tests/analyticsFingerprint.test.ts tests/statsRepo.test.ts && npx tsc --noEmit && npm test`

> `tests/statsRepo.test.ts` exists and must stay green. If it mocks `getDb`, the cache path returns null and falls through to the original computation — which is the intended behaviour and means the test needs no change. If it fails, read it before altering anything.

- [ ] **Step 6: Commit**

```bash
git add src/repos/analyticsCache.ts src/repos/statsRepo.ts tests/analyticsFingerprint.test.ts
git commit -m "perf(analytics): cache lifetime stats behind a fingerprint"
```

---

### Task 4: Profile memo and cache

**Files:** Modify `src/repos/profileRepo.ts`, `src/stores/session.tsx`.

**Interfaces:** Produces `clearProfileCache(): void`. `getMyProfile()` keeps its signature.

- [ ] **Step 1: Add the memo and cache to `profileRepo.ts`**

Insert after the `listeners` declaration:

```ts
// In-memory memo. Home calls getMyProfile twice per reload by design, and Gate
// re-reads on every auth tick; without this each is a fresh network round trip.
let memo: Profile | null = null;

/**
 * Drops both memo and table. MUST be called on sign-out: without it the next
 * user to sign in on this device sees the previous user's name for a frame.
 */
export function clearProfileCache(): void {
  memo = null;
  void (async () => {
    const db = await getDb();
    await db?.runAsync("delete from profile_cache");
  })();
}

async function readCachedProfile(): Promise<Profile | null> {
  if (memo) return memo;
  const db = await getDb();
  if (!db) return null;
  const r = await db.getFirstAsync<Record<string, unknown>>("select * from profile_cache limit 1");
  if (!r) return null;
  memo = {
    id: r.id as string,
    displayName: (r.display_name as string) ?? "",
    displayNameSet: !!(r.display_name_set as number),
    age: (r.age as number | null) ?? null,
    hand: (r.hand as Hand | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    username: (r.username as string) ?? "",
  };
  return memo;
}

async function writeCachedProfile(p: Profile): Promise<void> {
  memo = p;
  const db = await getDb();
  if (!db) return;
  await db.runAsync("delete from profile_cache");
  await db.runAsync(
    `insert into profile_cache
       (id, display_name, display_name_set, age, hand, avatar_url, username)
     values (?, ?, ?, ?, ?, ?, ?)`,
    p.id, p.displayName, p.displayNameSet ? 1 : 0, p.age, p.hand, p.avatarUrl, p.username
  );
}
```

Add `import { getDb } from "../db/db";` at the top.

- [ ] **Step 2: Split fetch from read**

Rename the existing network body to `refreshMyProfile`, and make `getMyProfile` cache-first:

```ts
/** Network fetch, written through to cache. */
export async function refreshMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, display_name_set, age, hand, avatar_url, username")
    .eq("id", uid)
    .maybeSingle();
  if (error || !data) return null;

  const profile: Profile = {
    id: data.id as string,
    displayName: (data.display_name as string | null) ?? "",
    displayNameSet: Boolean(data.display_name_set),
    age: (data.age as number | null) ?? null,
    hand: (data.hand as Hand | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    username: (data.username as string | null) ?? "",
  };
  await writeCachedProfile(profile);
  return profile;
}

/**
 * Cache-first. Returns immediately from memo or table when warm, refreshing in
 * the background; awaits the network only on a cold cache. Signature unchanged
 * so the five call sites keep working.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const cached = await readCachedProfile();
  if (cached) {
    void refreshMyProfile().catch(() => {
      // Background refresh; the cached value stays valid.
    });
    return cached;
  }
  return refreshMyProfile();
}
```

- [ ] **Step 3: Invalidate the memo on every write**

Each writer already calls `listeners.forEach((l) => l())`. Add memo invalidation alongside by replacing each of those six calls (`setDisplayName`, `completeOnboarding`, `setProfileDetails`, `uploadAvatar`, `removeAvatar`, `setUsername`) with a helper defined next to `listeners`:

```ts
/** Announce a profile write: drop the memo so the next read re-fetches. */
function announceProfileWrite(): void {
  memo = null;
  listeners.forEach((l) => l());
}
```

Then replace all six `listeners.forEach((l) => l());` call sites with `announceProfileWrite();`. Verify with `grep -n "listeners.forEach" src/repos/profileRepo.ts` → only the one inside the helper.

- [ ] **Step 4: Clear on sign-out**

In `src/stores/session.tsx`, inside the `onAuthStateChange` handler's `if (!s)` branch (line ~66), add `clearProfileCache();` and import it from `../repos/profileRepo`.

- [ ] **Step 5: Verify.** `npx tsc --noEmit && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/repos/profileRepo.ts src/stores/session.tsx
git commit -m "perf(profile): memo + local cache, cleared on sign-out"
```

---

### Task 5: Parallelise Home's read chain

**Files:** Modify `app/(app)/index.tsx`.

- [ ] **Step 1: Replace the sequential chain**

`loadFromCache` at `app/(app)/index.tsx:50-69` awaits four reads in series though only analytics depends on the others. Replace its body:

```tsx
    const loadFromCache = async () => {
      // Clubs, sessions, profile, and club players are mutually independent —
      // only analytics depends on the resolved player name. Serial awaits here
      // were costing four round trips for no ordering benefit.
      const [clubsNow, sessionsNow, profile, players] = await Promise.all([
        listRealClubs(), listSessions(), getMyProfile(), listMyClubPlayers(),
      ]);
      if (epoch !== epochRef.current) return;
      setClubs(clubsNow);
      setSessions(sessionsNow);
      setDisplayName(profile?.displayName ?? null);

      const name = resolveMyPlayerName(players, profile?.id ?? null, profile?.displayName ?? null);
      const stats = name ? await getPlayerAnalytics(name) : null;
      if (epoch !== epochRef.current) return;
      setAnalytics(stats);
    };
```

The epoch guard still runs before every `setState`; it just moves after the `Promise.all` rather than being interleaved.

- [ ] **Step 2: Verify.** `npx tsc --noEmit && npm test`

- [ ] **Step 3: Manual check (requires a device)**

1. Home paints name, clubs, and stats.
2. Airplane mode: Home still paints everything from cache.
3. Sign out, sign in as a different account: no trace of the previous user's name or stats at any point, including the first frame.
4. Complete a match, return to Home: match count and win rate update.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "perf(home): parallelise the independent cache reads"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 `profile_cache` table | 1 |
| §1 memo + invalidation via existing listeners | 4 |
| §1 sign-out clears both | 4 |
| §2 `analytics_cache` table | 1 |
| §2 fingerprint incl. `summaryLen` tripwire | 3 |
| §2 `venues` Set handling | 2 |
| §2 corrupt payload reads as a miss | 2, 3 |
| §3 Home chain parallelised | 5 |

**Type consistency:** `fingerprintOf(FingerprintInput)` is defined in Task 3 and asserted in its test with the same field names (`n`, `newest`, `summaryLen`). `serializeAnalytics` / `deserializeAnalytics` are defined in Task 2 and consumed in Task 3. `clearProfileCache` is defined in Task 4 Step 1 and imported in Step 4.

**Deviation from spec:** the spec described `readMyProfile` / `refreshMyProfile` / `getMyProfile` as three exported functions. Implemented with `readCachedProfile` private and only `getMyProfile` / `refreshMyProfile` exported — no call site needs the raw cache read, and keeping it private prevents a caller accidentally binding to cache-only data.

**Risk ranking:**
1. **Task 4's sign-out clear.** If missed, user B sees user A's name. Task 4 Step 4 is the fix; the manual check in Task 5 Step 3 is what catches it.
2. **Task 2's `venues` Set.** Silent data loss if serialisation is bypassed. Test 2 in that task exists specifically to document why raw JSON is wrong.
3. **Task 3's fingerprint** cannot detect a same-length rewrite of `score_summary`. Accepted in the spec; no such path exists in the app today.
4. **Task 5** changes four progressive repaints into one. Spec names the trade-off and the fallback (keep `setClubs` early) if cold start regresses.
