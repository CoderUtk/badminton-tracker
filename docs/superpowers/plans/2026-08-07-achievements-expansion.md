# Achievement System Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 15 new achievements (Habit Building, Skill & Performance, Milestones, Onboarding, plus Dynamic Duo) to the existing badge system, extending `playerAnalytics`/`evaluateBadges` rather than replacing them, and give `BadgeGrid` a third "in progress" visual state.

**Architecture:** `src/analytics/player.ts`'s existing single-pass `playerAnalytics()` gains new derived fields computed in that same pass (plus one new optional `sessionLocations` input for venue tracking, sourced via a new `getSessionLocations()` in `sessionRepo.ts`). `src/achievements/rules.ts`'s `evaluateBadges()` gains 15 new badge definitions and a `profile` parameter for the one onboarding-completeness badge. `BadgeGrid.tsx` renders the existing `earned`/`progress` fields with a third visual tier.

**Tech Stack:** TypeScript, Jest, React Native/Expo Router, expo-sqlite (local cache reads).

## Global Constraints

- Every new fact must be derived from data already stored — no schema changes, no new backend (`matches.created_at`, `matches.score_summary`, `matches.config.matchType`, `matches.config.pointsToWin`, `sessions.location`, `profiles.age`/`hand`/`avatar_url`).
- Challenger, Social Butterfly, Good Sport are explicitly out of scope (need new invites/friends/endorsements systems — future work).
- Explorer counts distinct non-empty `session.location` values reachable from the player's matches via `session_id`; quick matches with no session don't contribute.
- Nail Biter is relative to each match's own `pointsToWin` (11/15/21), not a fixed ">21".
- `playerAnalytics` and `evaluateBadges` must stay pure (no I/O) — any I/O (session-location lookups) happens in the repo layer (`statsRepo.ts`/`sessionRepo.ts`) that already wraps them.
- Run `npx tsc --noEmit` and `npm test -- --silent` after every task; both must be clean before moving on.

---

### Task 1: `playerAnalytics` — day/time/streak/game-level derived facts

**Files:**
- Modify: `src/analytics/player.ts`
- Test: Modify `tests/player.test.ts`

**Interfaces:**
- Consumes: existing `MatchRecord[]` input (`created_at`, `config.matchType`, `config.pointsToWin`, `score_summary.games`, `winner`, `side_a`/`side_b`).
- Produces: `PlayerAnalytics` gains `dayStreak: number`, `weekendWarrior: boolean`, `earlyBird: boolean`, `nightOwl: boolean`, `maxMatchesInMonth: number`, `maxMatchesInDay: number`, `winStreak: number`, `doublesPlayed: number`, `flawlessVictory: boolean`, `nailBiter: boolean`, `comebackKid: boolean`. `playerAnalytics` gains an optional 4th parameter `now: number = Date.now()` (for deterministic testing of `dayStreak`). Task 2/3/4 build on these exact field names.

- [ ] **Step 1: Write the failing tests**

Add to `tests/player.test.ts` (after the existing `describe("playerAnalytics", ...)` block, as a sibling `describe`):

```typescript
describe("playerAnalytics — new derived facts", () => {
  const day = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  test("earlyBird/nightOwl flag matches before 08:00 / at-or-after 20:00 local time", () => {
    const early = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 7))],
      "Utkarsh"
    );
    expect(early.earlyBird).toBe(true);
    expect(early.nightOwl).toBe(false);

    const night = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 20))],
      "Utkarsh"
    );
    expect(night.nightOwl).toBe(true);
    expect(night.earlyBird).toBe(false);

    const midday = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 14))],
      "Utkarsh"
    );
    expect(midday.earlyBird).toBe(false);
    expect(midday.nightOwl).toBe(false);
  });

  test("weekendWarrior is true only when a Saturday and its Sunday both have a match", () => {
    // 2026-01-03 is a Saturday, 2026-01-04 is its Sunday.
    const both = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 3)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 4)),
      ],
      "Utkarsh"
    );
    expect(both.weekendWarrior).toBe(true);

    const satOnly = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 3))],
      "Utkarsh"
    );
    expect(satOnly.weekendWarrior).toBe(false);
  });

  test("dayStreak counts consecutive local days ending today or yesterday", () => {
    const now = day(2026, 0, 10, 18);
    const threeInARow = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 10, 9)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 9, 9)),
        match("m3", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 8, 9)),
      ],
      "Utkarsh",
      new Map(),
      now
    );
    expect(threeInARow.dayStreak).toBe(3);

    const gapBreaksIt = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 10, 9)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 7, 9)), // gap
      ],
      "Utkarsh",
      new Map(),
      now
    );
    expect(gapBreaksIt.dayStreak).toBe(1);

    const noMatchToday = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 9, 9))],
      "Utkarsh",
      new Map(),
      now // "now" is Jan 10, last match was Jan 9 (yesterday) — still counts
    );
    expect(noMatchToday.dayStreak).toBe(1);
  });

  test("maxMatchesInMonth and maxMatchesInDay track the busiest buckets", () => {
    const a = playerAnalytics(
      [
        match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 9)),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 5, 11)),
        match("m3", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 6, 9)),
        match("m4", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 1, 1, 9)),
      ],
      "Utkarsh"
    );
    expect(a.maxMatchesInDay).toBe(2); // Jan 5 had 2
    expect(a.maxMatchesInMonth).toBe(3); // January had 3
  });

  test("winStreak counts the current run from the most recent match, uncapped by the 8-entry form array", () => {
    const wins = Array.from({ length: 9 }, (_, i) =>
      match(`w${i}`, ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 20 - i))
    ); // 9 wins, newest first
    const a = playerAnalytics(wins, "Utkarsh");
    expect(a.form).toHaveLength(8); // display cap unchanged
    expect(a.winStreak).toBe(9); // full-history streak exceeds the cap

    const brokenAtFifth = [
      ...wins.slice(0, 4),
      match("loss", ["Utkarsh"], ["Bela"], "B", [{ A: 10, B: 21 }], day(2026, 0, 15)),
      ...wins.slice(5),
    ];
    const b = playerAnalytics(brokenAtFifth, "Utkarsh");
    expect(b.winStreak).toBe(4);
  });

  test("doublesPlayed counts only completed doubles matches", () => {
    const doublesConfig = { matchType: "doubles" } as import("../src/repos/matchRepo").MatchRecord["config"];
    const singlesConfig = { matchType: "singles" } as import("../src/repos/matchRepo").MatchRecord["config"];
    const a = playerAnalytics(
      [
        match("m1", ["Utkarsh", "Aarav"], ["Bela", "Soham"], "A", [{ A: 21, B: 10 }], day(2026, 0, 1), { config: doublesConfig }),
        match("m2", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }], day(2026, 0, 2), { config: singlesConfig }),
      ],
      "Utkarsh"
    );
    expect(a.doublesPlayed).toBe(1);
  });

  test("flawlessVictory: any won game where the loser scored under 5", () => {
    const cfg = { pointsToWin: 21 } as import("../src/repos/matchRepo").MatchRecord["config"];
    const a = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 4 }], day(2026, 0, 1), { config: cfg })],
      "Utkarsh"
    );
    expect(a.flawlessVictory).toBe(true);

    const b = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 5 }], day(2026, 0, 1), { config: cfg })],
      "Utkarsh"
    );
    expect(b.flawlessVictory).toBe(false);
  });

  test("nailBiter is relative to the match's own pointsToWin (deuce games)", () => {
    const cfg11 = { pointsToWin: 11 } as import("../src/repos/matchRepo").MatchRecord["config"];
    const deuceIn11 = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 13, B: 11 }], day(2026, 0, 1), { config: cfg11 })],
      "Utkarsh"
    );
    expect(deuceIn11.nailBiter).toBe(true);

    const normalIn11 = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 11, B: 6 }], day(2026, 0, 1), { config: cfg11 })],
      "Utkarsh"
    );
    expect(normalIn11.nailBiter).toBe(false);
  });

  test("comebackKid: won the match after losing the first game", () => {
    const a = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 15, B: 21 }, { A: 21, B: 18 }, { A: 21, B: 15 }], day(2026, 0, 1))],
      "Utkarsh"
    );
    expect(a.comebackKid).toBe(true);

    const b = playerAnalytics(
      [match("m1", ["Utkarsh"], ["Bela"], "A", [{ A: 21, B: 10 }, { A: 21, B: 15 }], day(2026, 0, 1))],
      "Utkarsh"
    );
    expect(b.comebackKid).toBe(false);
  });
});
```

Also update the existing `match()` test helper (near the top of `tests/player.test.ts`) to accept overrides — replace:

```typescript
function match(
  id: string,
  a: string[],
  b: string[],
  winner: "A" | "B" | null,
  games: { A: number; B: number }[],
  created_at: number
): MatchRecord {
  return {
    ...base,
    id,
    side_a: a.map((name) => ({ club_player_id: null, name })),
    side_b: b.map((name) => ({ club_player_id: null, name })),
    winner,
    score_summary: { games },
    created_at,
  };
}
```

with:

```typescript
function match(
  id: string,
  a: string[],
  b: string[],
  winner: "A" | "B" | null,
  games: { A: number; B: number }[],
  created_at: number,
  overrides: Partial<Pick<MatchRecord, "config" | "session_id">> = {}
): MatchRecord {
  return {
    ...base,
    id,
    side_a: a.map((name) => ({ club_player_id: null, name })),
    side_b: b.map((name) => ({ club_player_id: null, name })),
    winner,
    score_summary: { games },
    created_at,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/player.test.ts --silent`
Expected: FAIL — `playerAnalytics(...)` results have no `dayStreak`/`weekendWarrior`/etc. properties, so the new assertions fail (existing tests in the file still pass).

- [ ] **Step 3: Write the implementation**

In `src/analytics/player.ts`, extend `PlayerAnalytics`:

```typescript
export interface PlayerAnalytics {
  name: string;
  played: number; // completed matches with a decided winner
  wins: number;
  losses: number;
  winPct: number; // 0..100 (integer)
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  form: ("W" | "L")[]; // newest first, up to 8
  bestPartner: PairStat | null; // most wins alongside
  toughestOpponent: PairStat | null; // most losses against
  recent: RecentMatch[]; // newest first, up to 10
  dayStreak: number; // consecutive local calendar days with >=1 match, ending today or yesterday
  weekendWarrior: boolean; // some Saturday and its adjacent Sunday both have a match
  earlyBird: boolean; // any match created before 08:00 local time
  nightOwl: boolean; // any match created at/after 20:00 local time
  maxMatchesInMonth: number; // largest count of matches sharing a local (year, month)
  maxMatchesInDay: number; // largest count of matches sharing a local calendar day
  winStreak: number; // current win streak over full history (form is capped at 8 for display)
  doublesPlayed: number; // completed matches where config.matchType === "doubles"
  flawlessVictory: boolean; // any won game where the loser scored < 5
  nailBiter: boolean; // any won game whose winning score > that match's pointsToWin
  comebackKid: boolean; // won the match after losing game 1
  venues: Set<string>; // distinct non-empty session locations (populated in Task 3)
}
```

Add local calendar-day helpers near the top of the file (after the imports, before `sideOf`):

```typescript
type YMD = { y: number; m: number; d: number };
const ymd = (ts: number): YMD => {
  const dt = new Date(ts);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
};
const ymdKey = (v: YMD) => `${v.y}-${v.m}-${v.d}`;
const nextDay = (v: YMD): YMD => {
  const dt = new Date(v.y, v.m, v.d + 1);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
};
const prevDay = (v: YMD): YMD => {
  const dt = new Date(v.y, v.m, v.d - 1);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
};
```

Change the function signature and body. Replace:

```typescript
export function playerAnalytics(matches: MatchRecord[], name: string): PlayerAnalytics {
  let wins = 0, losses = 0, played = 0;
  let gamesWon = 0, gamesLost = 0, pointsFor = 0, pointsAgainst = 0;
  const form: ("W" | "L")[] = [];
  const partners = new Map<string, PairStat>();
  const opponents = new Map<string, PairStat>();
  const recent: RecentMatch[] = [];
```

with:

```typescript
export function playerAnalytics(
  matches: MatchRecord[],
  name: string,
  sessionLocations: Map<string, string> = new Map(),
  now: number = Date.now()
): PlayerAnalytics {
  let wins = 0, losses = 0, played = 0;
  let gamesWon = 0, gamesLost = 0, pointsFor = 0, pointsAgainst = 0;
  const form: ("W" | "L")[] = [];
  const partners = new Map<string, PairStat>();
  const opponents = new Map<string, PairStat>();
  const recent: RecentMatch[] = [];

  const daySet = new Set<string>();
  const dayCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  let earlyBird = false;
  let nightOwl = false;
  let winStreak = 0;
  let winStreakBroken = false;
  let doublesPlayed = 0;
  let flawlessVictory = false;
  let nailBiter = false;
  let comebackKid = false;
  const venues = new Set<string>();
```

Inside the `for (const m of matches)` loop, right after `const games = m.score_summary?.games ?? [];`, add:

```typescript
    const day = ymd(m.created_at);
    const dayK = ymdKey(day);
    daySet.add(dayK);
    dayCounts.set(dayK, (dayCounts.get(dayK) ?? 0) + 1);
    const monthK = `${day.y}-${day.m}`;
    monthCounts.set(monthK, (monthCounts.get(monthK) ?? 0) + 1);
    const hour = new Date(m.created_at).getHours();
    if (hour < 8) earlyBird = true;
    if (hour >= 20) nightOwl = true;
    if (m.session_id) {
      const loc = sessionLocations.get(m.session_id);
      if (loc) venues.add(loc);
    }

    for (const g of games) {
      const mine = side === "A" ? g.A : g.B;
      const theirs = side === "A" ? g.B : g.A;
      if (mine > theirs) {
        if (theirs < 5) flawlessVictory = true;
        if (m.config.pointsToWin && mine > m.config.pointsToWin) nailBiter = true;
      }
    }
```

Then, still inside the loop, extend the existing per-game score tally (which already reads `games`) — that block stays as-is, just note the new block above runs before it. Next, inside the existing `if (m.winner)` block, replace:

```typescript
    if (m.winner) {
      played += 1;
      const won = m.winner === side;
      result = won ? "W" : "L";
      if (won) wins += 1;
      else losses += 1;
      if (form.length < 8) form.push(result);
      if (partner) bump(partners, partner, won);
      for (const o of oppSide) bump(opponents, o.name, won); // won === my result vs them
    }
```

with:

```typescript
    if (m.winner) {
      played += 1;
      const won = m.winner === side;
      result = won ? "W" : "L";
      if (won) {
        wins += 1;
        if (!winStreakBroken) winStreak += 1;
      } else {
        losses += 1;
        winStreakBroken = true;
      }
      if (form.length < 8) form.push(result);
      if (partner) bump(partners, partner, won);
      for (const o of oppSide) bump(opponents, o.name, won); // won === my result vs them
      if (m.config.matchType === "doubles") doublesPlayed += 1;
      if (won && games.length > 0) {
        const g0 = games[0];
        const mine0 = side === "A" ? g0.A : g0.B;
        const theirs0 = side === "A" ? g0.B : g0.A;
        if (mine0 < theirs0) comebackKid = true;
      }
    }
```

After the loop, before `const bestPartner = ...`, compute the streak and weekend flag:

```typescript
  let dayStreak = 0;
  let cursor = ymd(now);
  if (!daySet.has(ymdKey(cursor))) cursor = prevDay(cursor);
  while (daySet.has(ymdKey(cursor))) {
    dayStreak += 1;
    cursor = prevDay(cursor);
  }

  let weekendWarrior = false;
  for (const key of daySet) {
    const [y, mo, d] = key.split("-").map(Number);
    if (new Date(y, mo, d).getDay() === 6) { // Saturday
      if (daySet.has(ymdKey(nextDay({ y, m: mo, d })))) {
        weekendWarrior = true;
        break;
      }
    }
  }

  const maxMatchesInDay = dayCounts.size ? Math.max(...dayCounts.values()) : 0;
  const maxMatchesInMonth = monthCounts.size ? Math.max(...monthCounts.values()) : 0;
```

Finally, extend the return statement — replace:

```typescript
  return {
    name,
    played,
    wins,
    losses,
    winPct: played ? Math.round((wins / played) * 100) : 0,
    gamesWon,
    gamesLost,
    pointsFor,
    pointsAgainst,
    form,
    bestPartner: bestPartner && bestPartner.wins > 0 ? bestPartner : null,
    toughestOpponent: toughestOpponent && toughestOpponent.losses > 0 ? toughestOpponent : null,
    recent,
  };
```

with:

```typescript
  return {
    name,
    played,
    wins,
    losses,
    winPct: played ? Math.round((wins / played) * 100) : 0,
    gamesWon,
    gamesLost,
    pointsFor,
    pointsAgainst,
    form,
    bestPartner: bestPartner && bestPartner.wins > 0 ? bestPartner : null,
    toughestOpponent: toughestOpponent && toughestOpponent.losses > 0 ? toughestOpponent : null,
    recent,
    dayStreak,
    weekendWarrior,
    earlyBird,
    nightOwl,
    maxMatchesInMonth,
    maxMatchesInDay,
    winStreak,
    doublesPlayed,
    flawlessVictory,
    nailBiter,
    comebackKid,
    venues,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/player.test.ts --silent`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/analytics/player.ts tests/player.test.ts
git commit -m "feat(analytics): derive day/time/streak/game-level achievement facts"
```

---

### Task 2: `getSessionLocations` in `sessionRepo.ts`

**Files:**
- Modify: `src/repos/sessionRepo.ts`
- Test: Create `tests/sessionLocations.test.ts`

**Interfaces:**
- Produces: `getSessionLocations(sessionIds: string[]): Promise<Map<string, string>>`, exported from `src/repos/sessionRepo.ts`. Task 3 calls this exact name and signature.

- [ ] **Step 1: Write the failing tests**

Create `tests/sessionLocations.test.ts`:

```typescript
const getAllAsync = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: null }));
jest.mock("../src/db/db", () => ({ getDb: async () => ({ getAllAsync: (...a: unknown[]) => getAllAsync(...a) }) }));

import { getSessionLocations } from "../src/repos/sessionRepo";

beforeEach(() => getAllAsync.mockReset());

test("returns a map of non-empty locations keyed by session id", async () => {
  getAllAsync.mockResolvedValue([
    { id: "s1", location: "Court 5" },
    { id: "s2", location: null },
    { id: "s3", location: "   " },
  ]);
  const map = await getSessionLocations(["s1", "s2", "s3"]);
  expect(map).toEqual(new Map([["s1", "Court 5"]]));
});

test("returns an empty map for an empty id list without querying", async () => {
  const map = await getSessionLocations([]);
  expect(map).toEqual(new Map());
  expect(getAllAsync).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/sessionLocations.test.ts --silent`
Expected: FAIL — `getSessionLocations` is not exported from `../src/repos/sessionRepo`.

- [ ] **Step 3: Write the implementation**

Add to the end of `src/repos/sessionRepo.ts`:

```typescript
/** Non-empty locations for the given session ids, keyed by session id. Used
 *  by achievements (Explorer) to count distinct venues without matches
 *  needing to carry their own venue field. */
export async function getSessionLocations(sessionIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (sessionIds.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = await db.getAllAsync<{ id: string; location: string | null }>(
    `select id, location from sessions_cache where id in (${placeholders})`,
    ...sessionIds
  );
  for (const r of rows) {
    if (r.location && r.location.trim()) map.set(r.id, r.location);
  }
  return map;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/sessionLocations.test.ts --silent`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/repos/sessionRepo.ts tests/sessionLocations.test.ts
git commit -m "feat(sessions): add getSessionLocations for venue-based achievements"
```

---

### Task 3: Wire venue lookup through `statsRepo.ts`

**Files:**
- Modify: `src/repos/statsRepo.ts`
- Test: Create `tests/statsRepo.test.ts`

**Interfaces:**
- Consumes: `getSessionLocations` (Task 2) from `./sessionRepo`, `playerAnalytics` (Task 1, now taking `sessionLocations` as its 3rd param) from `../analytics/player`.
- Produces: `getPlayerAnalytics(name: string): Promise<PlayerAnalytics>` — same public signature as before; its `venues` field is now populated. No other file depends on internals of this task.

- [ ] **Step 1: Write the failing test**

Create `tests/statsRepo.test.ts`:

```typescript
const listMatches = jest.fn();
const getSessionLocations = jest.fn();
jest.mock("../src/repos/matchRepo", () => ({ listMatches: (...a: unknown[]) => listMatches(...a) }));
jest.mock("../src/repos/sessionRepo", () => ({ getSessionLocations: (...a: unknown[]) => getSessionLocations(...a) }));

import { getPlayerAnalytics } from "../src/repos/statsRepo";
import type { MatchRecord } from "../src/repos/matchRepo";

beforeEach(() => {
  listMatches.mockReset();
  getSessionLocations.mockReset();
});

test("looks up locations only for the distinct session ids the player's matches reference", async () => {
  const matches: MatchRecord[] = [
    {
      id: "m1", club_id: null, session_id: "s1", config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "Utkarsh" }], side_b: [{ club_player_id: null, name: "Bela" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }] }, created_at: 1,
    },
    {
      id: "m2", club_id: null, session_id: "s1", config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "Utkarsh" }], side_b: [{ club_player_id: null, name: "Bela" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }] }, created_at: 2,
    },
    {
      id: "m3", club_id: null, session_id: null, config: {} as MatchRecord["config"],
      side_a: [{ club_player_id: null, name: "Utkarsh" }], side_b: [{ club_player_id: null, name: "Bela" }],
      status: "completed", winner: "A", score_summary: { games: [{ A: 21, B: 10 }] }, created_at: 3,
    },
  ];
  listMatches.mockResolvedValue(matches);
  getSessionLocations.mockResolvedValue(new Map([["s1", "Court 5"]]));

  const a = await getPlayerAnalytics("Utkarsh");

  expect(getSessionLocations).toHaveBeenCalledWith(["s1"]);
  expect(a.venues).toEqual(new Set(["Court 5"]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/statsRepo.test.ts --silent`
Expected: FAIL — `getSessionLocations` mock is never called (current `getPlayerAnalytics` only calls `playerAnalytics(await listMatches(), name)`), so `venues` on the result is either `undefined` (Task 1 not yet consuming a real `sessionLocations` map) or empty when it should contain `"Court 5"`.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/repos/statsRepo.ts`:

```typescript
import { playerAnalytics, type PlayerAnalytics } from "../analytics/player";
import { listMatches } from "./matchRepo";
import { getSessionLocations } from "./sessionRepo";

/** Lifetime analytics for one player, across every match on the device. */
export async function getPlayerAnalytics(name: string): Promise<PlayerAnalytics> {
  const matches = await listMatches();
  const sessionIds = [...new Set(matches.map((m) => m.session_id).filter((id): id is string => !!id))];
  const sessionLocations = await getSessionLocations(sessionIds);
  return playerAnalytics(matches, name, sessionLocations);
}

export type { PlayerAnalytics };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/statsRepo.test.ts --silent`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/repos/statsRepo.ts tests/statsRepo.test.ts
git commit -m "feat(stats): wire session locations into player analytics for Explorer"
```

---

### Task 4: `evaluateBadges` — 15 new achievement rules + `profile` parameter

**Files:**
- Modify: `src/achievements/rules.ts`
- Modify: `app/(app)/profile.tsx:169` (call site)
- Test: Modify `tests/achievements.test.ts`

**Interfaces:**
- Consumes: `PlayerAnalytics` fields from Task 1 (`dayStreak`, `weekendWarrior`, `earlyBird`, `nightOwl`, `maxMatchesInMonth`, `maxMatchesInDay`, `winStreak`, `doublesPlayed`, `flawlessVictory`, `nailBiter`, `comebackKid`, `venues`).
- Produces: `evaluateBadges(a: PlayerAnalytics, profile: { age: number | null; hand: Hand | null; avatarUrl: string | null }): EarnedBadge[]` — the `profile` parameter is new; every existing badge id stays unchanged. Task 5 does not depend on this signature (it only touches `BadgeGrid.tsx`, which consumes `EarnedBadge[]`, not `evaluateBadges` directly).

- [ ] **Step 1: Write the failing tests**

Add to `tests/achievements.test.ts`. First, update the `base` fixture and existing calls to match the new required fields — replace the file's `base` constant:

```typescript
const base = {
  played: 0, wins: 0, losses: 0, winPct: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0,
  form: [] as ("W" | "L")[], recent: [] as unknown[],
  dayStreak: 0, weekendWarrior: false, earlyBird: false, nightOwl: false,
  maxMatchesInMonth: 0, maxMatchesInDay: 0, winStreak: 0, doublesPlayed: 0,
  flawlessVictory: false, nailBiter: false, comebackKid: false, venues: new Set<string>(),
};
const noProfile = { age: null, hand: null, avatarUrl: null };
```

Update every existing `evaluateBadges(...)` call in the file to pass `noProfile` as the second argument, e.g. `evaluateBadges(base as any, noProfile)`, `evaluateBadges({ ...base, played: 1, wins: 1, winPct: 100, form: ["W"] } as any, noProfile)`, and so on for all 5 existing tests.

Then append:

```typescript
describe("new achievements", () => {
  test("boolean-rule badges (weekend warrior, early bird, night owl, flawless, comeback, nail biter)", () => {
    const b = evaluateBadges({
      ...base, weekendWarrior: true, earlyBird: true, nightOwl: true,
      flawlessVictory: true, comebackKid: true, nailBiter: true,
    } as any, noProfile);
    for (const id of ["weekend_warrior", "early_bird", "night_owl", "flawless", "comeback", "nail_biter"]) {
      expect(b.find((x) => x.id === id)!.earned).toBe(true);
    }
    const none = evaluateBadges(base as any, noProfile);
    for (const id of ["weekend_warrior", "early_bird", "night_owl", "flawless", "comeback", "nail_biter"]) {
      expect(none.find((x) => x.id === id)!.earned).toBe(false);
      expect(none.find((x) => x.id === id)!.progress).toBe(0);
    }
  });

  test("streak_7 (The Streak) earns at 7 consecutive days, progress before that", () => {
    const partial = evaluateBadges({ ...base, dayStreak: 3 } as any, noProfile);
    expect(partial.find((x) => x.id === "streak_7")!.earned).toBe(false);
    expect(partial.find((x) => x.id === "streak_7")!.progress).toBeCloseTo(3 / 7, 5);

    const full = evaluateBadges({ ...base, dayStreak: 7 } as any, noProfile);
    expect(full.find((x) => x.id === "streak_7")!.earned).toBe(true);
  });

  test("monthly_15 (Monthly Regular) earns at 15 matches in a month", () => {
    const b = evaluateBadges({ ...base, maxMatchesInMonth: 15 } as any, noProfile);
    expect(b.find((x) => x.id === "monthly_15")!.earned).toBe(true);
  });

  test("doubles_10 (Dynamic Duo) earns at 10 doubles matches", () => {
    const b = evaluateBadges({ ...base, doublesPlayed: 10 } as any, noProfile);
    expect(b.find((x) => x.id === "doubles_10")!.earned).toBe(true);
  });

  test("streak_10 (Unstoppable) uses winStreak, independent of streak_5's form-based check", () => {
    const b = evaluateBadges({ ...base, winStreak: 10, form: [] } as any, noProfile);
    expect(b.find((x) => x.id === "streak_10")!.earned).toBe(true);
  });

  test("played_100 (Centurion) and wins_100 (Court Legend)", () => {
    const b = evaluateBadges({ ...base, played: 100, wins: 100 } as any, noProfile);
    expect(b.find((x) => x.id === "played_100")!.earned).toBe(true);
    expect(b.find((x) => x.id === "wins_100")!.earned).toBe(true);
  });

  test("venues_3 (Explorer) earns at 3 distinct venues", () => {
    const b = evaluateBadges({ ...base, venues: new Set(["A", "B", "C"]) } as any, noProfile);
    expect(b.find((x) => x.id === "venues_3")!.earned).toBe(true);
    const partial = evaluateBadges({ ...base, venues: new Set(["A"]) } as any, noProfile);
    expect(partial.find((x) => x.id === "venues_3")!.progress).toBeCloseTo(1 / 3, 5);
  });

  test("iron_man earns at 5 matches in a single day", () => {
    const b = evaluateBadges({ ...base, maxMatchesInDay: 5 } as any, noProfile);
    expect(b.find((x) => x.id === "iron_man")!.earned).toBe(true);
  });

  test("scribe_20 (The Scribe) earns at 20 played matches", () => {
    const b = evaluateBadges({ ...base, played: 20 } as any, noProfile);
    expect(b.find((x) => x.id === "scribe_20")!.earned).toBe(true);
  });

  test("profile_complete (Setting Up Shop) requires photo, age, and handedness all set", () => {
    const missingAll = evaluateBadges(base as any, noProfile);
    expect(missingAll.find((x) => x.id === "profile_complete")!.earned).toBe(false);
    expect(missingAll.find((x) => x.id === "profile_complete")!.progress).toBe(0);

    const partial = evaluateBadges(base as any, { age: 30, hand: null, avatarUrl: "https://x/y.png" });
    expect(partial.find((x) => x.id === "profile_complete")!.earned).toBe(false);
    expect(partial.find((x) => x.id === "profile_complete")!.progress).toBeCloseTo(2 / 3, 5);

    const complete = evaluateBadges(base as any, { age: 30, hand: "right", avatarUrl: "https://x/y.png" });
    expect(complete.find((x) => x.id === "profile_complete")!.earned).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/achievements.test.ts --silent`
Expected: FAIL — `evaluateBadges` still takes one argument and has no `weekend_warrior`/etc. ids, and the updated existing-test calls now pass an unused second argument (harmless until the signature changes, but the new `describe` block's `.find(...)!` calls throw on `undefined` since those ids don't exist yet).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/achievements/rules.ts`:

```typescript
import type { EarnedBadge } from "./types";
import type { Hand } from "../repos/profileRepo";

type Analytics = {
  played: number; wins: number; losses: number; winPct: number;
  gamesWon: number; gamesLost: number; pointsFor: number; pointsAgainst: number;
  form: ("W" | "L")[];
  dayStreak: number; weekendWarrior: boolean; earlyBird: boolean; nightOwl: boolean;
  maxMatchesInMonth: number; maxMatchesInDay: number; winStreak: number; doublesPlayed: number;
  flawlessVictory: boolean; nailBiter: boolean; comebackKid: boolean; venues: Set<string>;
};

type ProfileFacts = { age: number | null; hand: Hand | null; avatarUrl: string | null };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const currentStreak = (form: ("W" | "L")[]) => {
  let n = 0;
  for (let i = 0; i < form.length && form[i] === "W"; i++) n++;
  return n;
};
const bool = (earned: boolean) => clamp01(earned ? 1 : 0);

export function evaluateBadges(a: Analytics, profile: ProfileFacts): EarnedBadge[] {
  const streak = currentStreak(a.form);
  const profileFieldsSet = [profile.avatarUrl, profile.age !== null, profile.hand !== null]
    .filter(Boolean).length;

  return [
    { id: "first_win", title: "First Win", description: "Win your first match", icon: "trophy-outline",
      earned: a.wins >= 1, progress: clamp01(a.wins / 1) },
    { id: "played_10", title: "Regular", description: "Play 10 matches", icon: "badminton",
      earned: a.played >= 10, progress: clamp01(a.played / 10) },
    { id: "wins_10", title: "Contender", description: "Win 10 matches", icon: "trophy",
      earned: a.wins >= 10, progress: clamp01(a.wins / 10) },
    { id: "streak_5", title: "On Fire", description: "Win 5 in a row", icon: "flag",
      earned: streak >= 5, progress: clamp01(streak / 5) },
    { id: "sharp", title: "Sharp", description: "Reach a 60% win rate (min 10 games)", icon: "scoreboard-outline",
      earned: a.played >= 10 && a.winPct >= 60, progress: clamp01(Math.min(a.played / 10, a.winPct / 60)) },

    { id: "weekend_warrior", title: "Weekend Warrior", description: "Play on both Saturday and Sunday in one weekend", icon: "calendar",
      earned: a.weekendWarrior, progress: bool(a.weekendWarrior) },
    { id: "early_bird", title: "Early Bird", description: "Log a match played before 8 AM", icon: "time-outline",
      earned: a.earlyBird, progress: bool(a.earlyBird) },
    { id: "night_owl", title: "Night Owl", description: "Log a match played after 8 PM", icon: "time-outline",
      earned: a.nightOwl, progress: bool(a.nightOwl) },
    { id: "streak_7", title: "The Streak", description: "Play at least one match for 7 days in a row", icon: "flag",
      earned: a.dayStreak >= 7, progress: clamp01(a.dayStreak / 7) },
    { id: "monthly_15", title: "Monthly Regular", description: "Play 15 matches in a calendar month", icon: "calendar",
      earned: a.maxMatchesInMonth >= 15, progress: clamp01(a.maxMatchesInMonth / 15) },

    { id: "doubles_10", title: "Dynamic Duo", description: "Play 10 doubles matches", icon: "account-group",
      earned: a.doublesPlayed >= 10, progress: clamp01(a.doublesPlayed / 10) },

    { id: "flawless", title: "Flawless Victory", description: "Win a game keeping your opponent under 5 points", icon: "trophy",
      earned: a.flawlessVictory, progress: bool(a.flawlessVictory) },
    { id: "comeback", title: "Comeback Kid", description: "Win a match after losing the first game", icon: "arrow-redo",
      earned: a.comebackKid, progress: bool(a.comebackKid) },
    { id: "nail_biter", title: "Nail Biter", description: "Win a game that goes to deuce", icon: "scoreboard-outline",
      earned: a.nailBiter, progress: bool(a.nailBiter) },
    { id: "streak_10", title: "Unstoppable", description: "Win 10 matches in a row", icon: "flag",
      earned: a.winStreak >= 10, progress: clamp01(a.winStreak / 10) },

    { id: "played_100", title: "Centurion", description: "Play 100 completed matches", icon: "badminton",
      earned: a.played >= 100, progress: clamp01(a.played / 100) },
    { id: "wins_100", title: "Court Legend", description: "Win 100 matches", icon: "trophy",
      earned: a.wins >= 100, progress: clamp01(a.wins / 100) },
    { id: "venues_3", title: "Explorer", description: "Play at 3 different venues", icon: "shuffle-variant",
      earned: a.venues.size >= 3, progress: clamp01(a.venues.size / 3) },
    { id: "iron_man", title: "Iron Man", description: "Play 5 matches in a single day", icon: "flag",
      earned: a.maxMatchesInDay >= 5, progress: clamp01(a.maxMatchesInDay / 5) },

    { id: "profile_complete", title: "Setting Up Shop", description: "Complete your profile: photo, age, handedness", icon: "person",
      earned: profileFieldsSet === 3, progress: clamp01(profileFieldsSet / 3) },
    { id: "scribe_20", title: "The Scribe", description: "Log and score 20 matches", icon: "create-outline",
      earned: a.played >= 20, progress: clamp01(a.played / 20) },
  ];
}
```

Update the call site in `app/(app)/profile.tsx:169` — replace:

```typescript
  const badges = a ? evaluateBadges(a) : [];
```

with:

```typescript
  const badges = a ? evaluateBadges(a, { age, hand, avatarUrl }) : [];
```

(`age`, `hand`, `avatarUrl` are already component state, loaded from `getMyProfile()` in the existing `useEffect` at the top of the component — no new fetch needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/achievements.test.ts --silent`
Expected: PASS (5 existing + 10 new tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/achievements/rules.ts "app/(app)/profile.tsx" tests/achievements.test.ts
git commit -m "feat(achievements): add 15 new badges and profile-completeness check"
```

---

### Task 5: `BadgeGrid` — three visual states

**Files:**
- Modify: `src/components/Icon.tsx` (add `checkmark-circle`)
- Modify: `src/components/BadgeGrid.tsx`

**Interfaces:**
- Consumes: `EarnedBadge[]` (`id`, `title`, `description`, `icon`, `earned`, `progress`) — unchanged shape, already produced by Task 4's `evaluateBadges`.

No new test — `BadgeGrid.tsx` has no existing test coverage (confirmed: no `BadgeGrid` entry in `tests/`), and this is a presentational-only change with no logic to unit test. Verified manually per Step 3 below.

- [ ] **Step 1: Add the checkmark icon**

In `src/components/Icon.tsx`, add `"checkmark-circle"` to the Ionicons section of `IconName` — replace:

```typescript
  | "information-circle-outline" | "hand-left-outline"
  | "phone-portrait-outline" | "phone-landscape-outline" | "sync-outline"
```

with:

```typescript
  | "information-circle-outline" | "hand-left-outline"
  | "phone-portrait-outline" | "phone-landscape-outline" | "sync-outline"
  | "checkmark-circle"
```

- [ ] **Step 2: Update `BadgeGrid.tsx` for the three visual states**

Replace the full contents of `src/components/BadgeGrid.tsx`:

```typescript
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { C, F, glow } from "../theme";

/**
 * Wrap grid of badge chips. Three visual states driven by earned/progress:
 * locked (progress 0, fully dimmed), in progress (0 < progress < 1,
 * standard-color icon + active progress fill), unlocked (earned, accented
 * icon + glow + checkmark badge, progress bar hidden since the goal's met).
 * Purely presentational — no data fetching, no tap action, so plain Views
 * rather than PressableScale.
 */
export default function BadgeGrid({ badges }: { badges: EarnedBadge[] }) {
  return (
    <View style={s.grid}>
      {badges.map((b) => {
        const inProgress = !b.earned && b.progress > 0;
        const iconColor = b.earned ? C.red : inProgress ? C.text : C.text3;
        const titleStyle = b.earned ? s.titleEarned : inProgress ? s.titleActive : s.titleLocked;
        return (
          <View key={b.id} style={[s.chip, b.earned && s.chipEarned, b.earned && glow(C.red, 10, 0.35)]}>
            {b.earned && (
              <View style={s.checkBadge}>
                <Icon name="checkmark-circle" color={C.red} size={16} />
              </View>
            )}
            <Icon name={b.icon as IconName} color={iconColor} size={24} />
            <Text style={[s.title, titleStyle]} numberOfLines={1}>{b.title}</Text>
            <Text style={s.desc} numberOfLines={2}>{b.description}</Text>
            {!b.earned && (
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round(b.progress * 100)}%` }, inProgress && s.fillActive]} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    width: "31%",
    backgroundColor: C.bgElev,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 10,
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  chipEarned: { borderColor: C.red },
  checkBadge: {
    position: "absolute", top: 6, right: 6, zIndex: 1,
    backgroundColor: C.bgElev, borderRadius: 999,
  },
  title: { fontSize: 12, fontFamily: F.semibold, textAlign: "center" },
  titleEarned: { color: C.red },
  titleActive: { color: C.text },
  titleLocked: { color: C.text2 },
  desc: { color: C.text3, fontSize: 10, fontFamily: F.body, textAlign: "center" },
  track: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: C.text3 },
  fillActive: { backgroundColor: C.red },
});
```

- [ ] **Step 3: Manual verification**

Run `npx tsc --noEmit` — must be clean. With the dev server running, open Profile and confirm: badges with 0 progress render fully dimmed; badges with partial progress show a standard-color icon and a red-filled partial progress bar; earned badges show a red glow, red icon, no progress bar, and a small checkmark circle in the top-right corner.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add src/components/Icon.tsx src/components/BadgeGrid.tsx
git commit -m "feat(badges): add in-progress visual state and unlock glow/checkmark"
```

---

## Self-Review Notes

- **Spec coverage:** All 15 in-scope achievements (§Categories A, C, D, E,
  plus Dynamic Duo from B) map to Task 4's badge list, backed by Task 1's
  derived facts and Task 2/3's venue plumbing. The 3-state UI (§5 of the
  design) is Task 5. Challenger/Social Butterfly/Good Sport are
  out-of-scope per the design doc, not present in any task.
- **Placeholder scan:** every step has literal, complete code (full file
  replacements for `rules.ts`/`statsRepo.ts`/`BadgeGrid.tsx` rather than
  partial diffs, since those files change substantially); no TBDs.
- **Type consistency:** `playerAnalytics(matches, name, sessionLocations?, now?)`
  from Task 1 is called with the 3rd argument by Task 3's `statsRepo.ts`
  and with the 3rd+4th arguments in Task 1's own tests — signature matches
  throughout. `evaluateBadges(a, profile)` from Task 4 is called with a
  `ProfileFacts`-shaped object both in `profile.tsx` (Task 4) and in every
  test (Task 4's own file) — consistent. `getSessionLocations(sessionIds)`
  from Task 2 is called identically in Task 3.
