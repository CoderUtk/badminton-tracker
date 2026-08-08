# Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `app/(app)/index.tsx` from a launcher into a dashboard — enlarged CTA, self-retiring feature copy, next-session card, richer club rows, and three real performance stats.

**Architecture:** All display logic lives in a new pure module `src/home/dashboard.ts` and is unit-tested with jest. The screen and its components stay dumb — they call pure selectors and render. One new analytics field (`longestWinStreak`) is added to the existing reducer in `src/analytics/player.ts`. The create/join club forms move out of the clubs-list footer into a `BottomPanel`-hosted sheet.

**Tech Stack:** React Native (Expo SDK 57), expo-router, TypeScript, jest (pure logic only), reanimated + gesture-handler (already used by `BottomPanel`).

## Global Constraints

- **Theme is unchanged.** Use only tokens from `src/theme.ts` (`C`, `F`, `GRAD`, `glow`, `press`). No new colours, no new fonts, no raw hex in components.
- **No component render tests exist in this repo.** `package.json` has no `@testing-library/react-native` and no `react-test-renderer`. Every test in `tests/` is pure logic. Do not add a component-testing dependency. Instead, extract logic into pure functions and test those; components are verified on device in Task 6.
- **Test location and style:** flat files in `tests/`, named `<subject>.test.ts`, importing from `../src/...`. Follow `tests/player.test.ts`.
- **Threshold constant:** `MIN_MATCHES_FOR_RATES = 5`. It gates both the `—` placeholders in the stat tiles and the visibility of the feature copy. Define it once, in `src/home/dashboard.ts`, and import it. Never inline the literal `5`.
- **Contrast:** stat tile labels use `C.text2`, never `C.text3`. `#5C6472` on `#0C0E12` is ~2.9:1, below WCAG AA.
- **Motion:** no entrance or stagger animation on the home screen. Press feedback only, via the `press` token.
- **Commits:** explicit pathspec on every `git add`. Never `git add -A`, `git add .`, or `git commit -a` — this is a shared checkout.
- **Commit trailers:** do not add a `Co-Authored-By` trailer.
- **Typecheck:** `npx tsc --noEmit` is currently clean. It must stay clean after every task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/analytics/player.ts` | **Modify.** Add `longestWinStreak` to `PlayerAnalytics` and compute it in the existing match loop. |
| `src/home/dashboard.ts` | **Create.** All pure home-screen logic: next-session selection, label formatting, player-name resolution, live-club detection, stat-tile value formatting, the threshold constant. |
| `tests/homeDashboard.test.ts` | **Create.** Unit tests for every export of `src/home/dashboard.ts`. |
| `tests/player.test.ts` | **Modify.** Add `longestWinStreak` cases. |
| `src/components/StatTile.tsx` | **Create.** One label + value tile. Presentational only. |
| `src/components/NextSessionCard.tsx` | **Create.** The upcoming-session card. Presentational only; receives a resolved view model. |
| `src/components/ClubSheet.tsx` | **Create.** `BottomPanel`-hosted create-club + join-by-code form. Owns the create/join mutations moved out of home. |
| `app/(app)/index.tsx` | **Rewrite.** New layout and section order; delegates to the above. |

Note: the spec says the club sheet "reuses the existing sheet component". The
correct host is **`BottomPanel`**, not `Sheet`. `Sheet` takes
`actions: SheetAction[]` — a fixed action list, which cannot host text inputs.
`BottomPanel` (`src/components/BottomPanel.tsx`) takes arbitrary `children` and
its own docstring says it exists "for full forms/lists ... rather than a confirm
menu". It shares `Sheet`'s animation and chrome.

---

### Task 1: Add `longestWinStreak` to player analytics

The existing `winStreak` is the *current* streak — it stops accumulating after
the first loss (`winStreakBroken`). The stat tile needs the longest run over
full history. Matches arrive newest-first, but the maximum run length is
unchanged by reversal, so a single pass works regardless of direction.

**Files:**
- Modify: `src/analytics/player.ts` (interface ~line 40, counters ~line 92, loop ~line 156, return ~line 234)
- Test: `tests/player.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PlayerAnalytics.longestWinStreak: number` — consumed by Task 2's `statTileValues`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/player.test.ts`, at the end of the file:

```ts
describe("longestWinStreak", () => {
  const wl = (results: ("W" | "L")[]): MatchRecord[] =>
    // newest-first, matching how listAllMatches returns rows
    results.map((r, i) =>
      match(
        `x${i}`,
        ["Utkarsh"],
        ["Rival"],
        r === "W" ? "A" : "B",
        [{ A: 21, B: 10 }],
        1000 - i
      )
    );

  test("no matches -> 0", () => {
    expect(playerAnalytics([], "Utkarsh").longestWinStreak).toBe(0);
  });

  test("all losses -> 0", () => {
    expect(playerAnalytics(wl(["L", "L", "L"]), "Utkarsh").longestWinStreak).toBe(0);
  });

  test("finds the best run even when it is not the current one", () => {
    // newest-first: current run is 1, but there is a run of 3 further back
    const a = playerAnalytics(wl(["W", "L", "W", "W", "W", "L"]), "Utkarsh");
    expect(a.winStreak).toBe(1);
    expect(a.longestWinStreak).toBe(3);
  });

  test("equals winStreak when the best run is the current one", () => {
    const a = playerAnalytics(wl(["W", "W", "W", "W", "L", "W"]), "Utkarsh");
    expect(a.winStreak).toBe(4);
    expect(a.longestWinStreak).toBe(4);
  });

  test("ignores matches the player did not play in", () => {
    const mine = wl(["W", "W"]);
    const theirs = [match("o1", ["Soham"], ["Meera"], "A", [{ A: 21, B: 5 }], 500)];
    expect(playerAnalytics([...mine, ...theirs], "Utkarsh").longestWinStreak).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/player.test.ts -t longestWinStreak
```

Expected: FAIL — `longestWinStreak` is `undefined`, so every `toBe(...)` mismatches.

- [ ] **Step 3: Add the field to the interface**

In `src/analytics/player.ts`, directly below the existing `winStreak` line in `PlayerAnalytics`:

```ts
  winStreak: number; // current win streak over full history (form is capped at 8 for display)
  longestWinStreak: number; // best win run over full history, current or not
```

- [ ] **Step 4: Add the counters**

Next to the existing `let winStreak = 0;` / `let winStreakBroken = false;` declarations:

```ts
  let longestWinStreak = 0;
  let currentRun = 0;
```

- [ ] **Step 5: Update the match loop**

Inside the `if (m.winner)` block, extend the existing win/loss branches:

```ts
      if (won) {
        wins += 1;
        if (!winStreakBroken) winStreak += 1;
        currentRun += 1;
        if (currentRun > longestWinStreak) longestWinStreak = currentRun;
      } else {
        losses += 1;
        winStreakBroken = true;
        currentRun = 0;
      }
```

- [ ] **Step 6: Add it to the returned object**

In the `return { ... }` block, immediately after `winStreak,`:

```ts
    winStreak,
    longestWinStreak,
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx jest tests/player.test.ts
```

Expected: PASS, including the pre-existing `playerAnalytics` cases.

- [ ] **Step 8: Fix the achievements test fixture**

`tests/achievements.test.ts` builds a `base` object listing every
`PlayerAnalytics` field. Add `longestWinStreak: 0,` next to `winStreak: 0,` in
that fixture so the shape stays honest.

- [ ] **Step 9: Verify the whole suite and typecheck**

```bash
npx jest && npx tsc --noEmit
```

Expected: all tests PASS, tsc silent.

- [ ] **Step 10: Commit**

```bash
git add src/analytics/player.ts tests/player.test.ts tests/achievements.test.ts
git commit -m "feat(analytics): add longestWinStreak to player analytics"
```

---

### Task 2: Pure home-dashboard logic module

Everything the home screen needs to decide *what* to show, with no React and no
database access, so it can be tested.

**Files:**
- Create: `src/home/dashboard.ts`
- Test: `tests/homeDashboard.test.ts`

**Interfaces:**
- Consumes: `PlayerAnalytics.longestWinStreak` (Task 1); `ClubSession` from `src/repos/sessionRepo`; `Club` and `ClubPlayer` from `src/repos/clubRepo`.
- Produces, all imported by Tasks 3–5:
  - `MIN_MATCHES_FOR_RATES: 5`
  - `pickNextSession(sessions: ClubSession[], now: number): ClubSession | null`
  - `sessionDateLabel(startsAt: number, now: number): string`
  - `sessionMetaLabel(session: ClubSession, now: number): string`
  - `liveClubIds(sessions: ClubSession[]): Set<string>`
  - `resolveMyPlayerName(clubPlayers: ClubPlayer[], profileId: string | null, displayName: string | null): string | null`
  - `statTileValues(analytics: PlayerAnalytics | null): { matches: string; winRate: string; streak: string; hasRates: boolean }`
  - `shouldShowFeatureCopy(analytics: PlayerAnalytics | null): boolean`

- [ ] **Step 1: Write the failing tests**

Create `tests/homeDashboard.test.ts`:

```ts
import {
  MIN_MATCHES_FOR_RATES,
  pickNextSession,
  sessionDateLabel,
  sessionMetaLabel,
  liveClubIds,
  resolveMyPlayerName,
  statTileValues,
  shouldShowFeatureCopy,
} from "../src/home/dashboard";
import type { ClubSession, SessionStatus } from "../src/repos/sessionRepo";
import type { ClubPlayer } from "../src/repos/clubRepo";
import type { PlayerAnalytics } from "../src/analytics/player";

const NOW = new Date("2026-08-08T12:00:00").getTime();
const HOUR = 3600_000;

function session(
  id: string,
  startsAt: number,
  status: SessionStatus = "scheduled",
  overrides: Partial<ClubSession> = {}
): ClubSession {
  return {
    id,
    club_id: "club-1",
    starts_at: startsAt,
    ends_at: null,
    location: null,
    courts: 2,
    status,
    created_at: 0,
    created_by: null,
    ...overrides,
  };
}

describe("pickNextSession", () => {
  test("no sessions -> null", () => {
    expect(pickNextSession([], NOW)).toBeNull();
  });

  test("all in the past -> null", () => {
    expect(pickNextSession([session("a", NOW - HOUR)], NOW)).toBeNull();
  });

  test("picks the earliest upcoming, not the first in the array", () => {
    // listSessions() returns starts_at DESC, so the soonest is last
    const rows = [
      session("far", NOW + 5 * HOUR),
      session("mid", NOW + 3 * HOUR),
      session("soon", NOW + HOUR),
    ];
    expect(pickNextSession(rows, NOW)!.id).toBe("soon");
  });

  test("skips cancelled and done sessions", () => {
    const rows = [
      session("ok", NOW + 4 * HOUR),
      session("dead", NOW + HOUR, "cancelled"),
      session("over", NOW + 2 * HOUR, "done"),
    ];
    expect(pickNextSession(rows, NOW)!.id).toBe("ok");
  });

  test("includes a live session that has not started yet by clock", () => {
    const rows = [session("live", NOW + HOUR, "live")];
    expect(pickNextSession(rows, NOW)!.id).toBe("live");
  });
});

describe("sessionDateLabel", () => {
  test("same calendar day reads Today", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    expect(sessionDateLabel(at, NOW)).toMatch(/^Today · /);
  });

  test("a different day uses weekday, month and date", () => {
    const at = new Date("2026-08-11T18:30:00").getTime();
    const label = sessionDateLabel(at, NOW);
    expect(label).not.toMatch(/^Today/);
    expect(label).toContain("Aug");
  });
});

describe("sessionMetaLabel", () => {
  test("appends location when present", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: "City Badminton Hub" });
    expect(sessionMetaLabel(s, NOW)).toContain("· City Badminton Hub");
  });

  test("falls back to court count when location is null", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: null, courts: 3 });
    expect(sessionMetaLabel(s, NOW)).toContain("· 3 courts");
  });

  test("singular court reads '1 court'", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: null, courts: 1 });
    expect(sessionMetaLabel(s, NOW)).toContain("· 1 court");
  });

  test("blank location is treated as absent", () => {
    const at = new Date("2026-08-08T18:30:00").getTime();
    const s = session("a", at, "scheduled", { location: "   ", courts: 2 });
    expect(sessionMetaLabel(s, NOW)).toContain("· 2 courts");
  });
});

describe("liveClubIds", () => {
  test("collects club ids of live sessions only", () => {
    const rows = [
      session("a", NOW, "live", { club_id: "c1" }),
      session("b", NOW, "scheduled", { club_id: "c2" }),
      session("c", NOW, "live", { club_id: "c3" }),
    ];
    const ids = liveClubIds(rows);
    expect([...ids].sort()).toEqual(["c1", "c3"]);
  });

  test("no live sessions -> empty set", () => {
    expect(liveClubIds([session("a", NOW, "done")]).size).toBe(0);
  });
});

describe("resolveMyPlayerName", () => {
  const players: ClubPlayer[] = [
    { id: "p1", club_id: "c1", profile_id: "me", name: "Utkarsh" },
    { id: "p2", club_id: "c2", profile_id: "other", name: "Soham" },
  ];

  test("prefers the club-player name matching my profile", () => {
    expect(resolveMyPlayerName(players, "me", "Utkarsh A.")).toBe("Utkarsh");
  });

  test("falls back to display name when no club player matches", () => {
    expect(resolveMyPlayerName(players, "nobody", "Utkarsh A.")).toBe("Utkarsh A.");
  });

  test("falls back to display name when profile id is null", () => {
    expect(resolveMyPlayerName(players, null, "Utkarsh A.")).toBe("Utkarsh A.");
  });

  test("returns null when nothing identifies the user", () => {
    expect(resolveMyPlayerName([], null, null)).toBeNull();
  });

  test("ignores club players with a blank name", () => {
    const blank: ClubPlayer[] = [{ id: "p9", club_id: "c1", profile_id: "me", name: "  " }];
    expect(resolveMyPlayerName(blank, "me", "Fallback")).toBe("Fallback");
  });
});

describe("statTileValues", () => {
  const analytics = (played: number, winPct: number, longest: number) =>
    ({ played, winPct, longestWinStreak: longest } as PlayerAnalytics);

  test("null analytics -> zero matches and dashes", () => {
    expect(statTileValues(null)).toEqual({
      matches: "0", winRate: "—", streak: "—", hasRates: false,
    });
  });

  test("below the threshold -> true match count, dashed rates", () => {
    expect(statTileValues(analytics(4, 75, 3))).toEqual({
      matches: "4", winRate: "—", streak: "—", hasRates: false,
    });
  });

  test("at the threshold -> real values", () => {
    expect(statTileValues(analytics(MIN_MATCHES_FOR_RATES, 78, 5))).toEqual({
      matches: "5", winRate: "78%", streak: "5", hasRates: true,
    });
  });

  test("a zero win rate above the threshold still shows 0%, not a dash", () => {
    expect(statTileValues(analytics(9, 0, 0))).toEqual({
      matches: "9", winRate: "0%", streak: "0", hasRates: true,
    });
  });
});

describe("shouldShowFeatureCopy", () => {
  test("shown for a user with no analytics at all", () => {
    expect(shouldShowFeatureCopy(null)).toBe(true);
  });

  test("shown below the threshold", () => {
    expect(shouldShowFeatureCopy({ played: 4 } as PlayerAnalytics)).toBe(true);
  });

  test("hidden at and above the threshold", () => {
    expect(shouldShowFeatureCopy({ played: 5 } as PlayerAnalytics)).toBe(false);
    expect(shouldShowFeatureCopy({ played: 40 } as PlayerAnalytics)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/homeDashboard.test.ts
```

Expected: FAIL — `Cannot find module '../src/home/dashboard'`.

- [ ] **Step 3: Write the module**

Create `src/home/dashboard.ts`:

```ts
/**
 * Pure logic for the home dashboard. No React, no database — everything here
 * takes plain data and returns plain data so it can be unit-tested, since this
 * repo has no component-render test infrastructure.
 */
import type { ClubSession } from "../repos/sessionRepo";
import type { ClubPlayer } from "../repos/clubRepo";
import type { PlayerAnalytics } from "../analytics/player";

/**
 * Win rate and streak are meaningless on a handful of matches, and "0%" reads
 * as "you lose every game" rather than "not enough data". Below this many
 * completed matches those two tiles show an em dash, and the onboarding
 * feature copy under the CTA is still visible.
 */
export const MIN_MATCHES_FOR_RATES = 5;

/**
 * The soonest session that has not started yet. Note that listSessions()
 * returns rows ordered by starts_at DESC, so the next session is the *last*
 * candidate, not the first — this sorts ascending rather than taking [0].
 */
export function pickNextSession(sessions: ClubSession[], now: number): ClubSession | null {
  const upcoming = sessions
    .filter((s) => s.starts_at > now && s.status !== "cancelled" && s.status !== "done")
    .sort((a, b) => a.starts_at - b.starts_at);
  return upcoming[0] ?? null;
}

/** Matches the phrasing already used by the sessions list screen. */
export function sessionDateLabel(startsAt: number, now: number): string {
  const date = new Date(startsAt);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay
    ? `Today · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Date label plus venue, falling back to court count when there is no venue. */
export function sessionMetaLabel(session: ClubSession, now: number): string {
  const when = sessionDateLabel(session.starts_at, now);
  const venue = session.location?.trim();
  if (venue) return `${when} · ${venue}`;
  const courts = session.courts === 1 ? "1 court" : `${session.courts} courts`;
  return `${when} · ${courts}`;
}

/** Clubs with a session currently in progress, for the row's Live pill. */
export function liveClubIds(sessions: ClubSession[]): Set<string> {
  return new Set(sessions.filter((s) => s.status === "live").map((s) => s.club_id));
}

/**
 * Which name the user appears under in match records. Their club-player name is
 * the one match setup draws from, so it beats the profile display name; the
 * display name is only a fallback for someone with no club membership yet.
 */
export function resolveMyPlayerName(
  clubPlayers: ClubPlayer[],
  profileId: string | null,
  displayName: string | null
): string | null {
  if (profileId) {
    const mine = clubPlayers.find((p) => p.profile_id === profileId && p.name.trim());
    if (mine) return mine.name.trim();
  }
  const fallback = displayName?.trim();
  return fallback ? fallback : null;
}

export function statTileValues(analytics: PlayerAnalytics | null): {
  matches: string; winRate: string; streak: string; hasRates: boolean;
} {
  const played = analytics?.played ?? 0;
  const hasRates = played >= MIN_MATCHES_FOR_RATES;
  return {
    matches: String(played),
    winRate: hasRates ? `${analytics!.winPct}%` : "—",
    streak: hasRates ? String(analytics!.longestWinStreak) : "—",
    hasRates,
  };
}

/**
 * The feature copy under the CTA exists to tell a new player what the scoring
 * engine does. It retires itself at the same threshold as the rate tiles, so a
 * settled user is not paying permanent screen height for something they learned
 * in week one.
 */
export function shouldShowFeatureCopy(analytics: PlayerAnalytics | null): boolean {
  return (analytics?.played ?? 0) < MIN_MATCHES_FOR_RATES;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/homeDashboard.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent.

- [ ] **Step 6: Commit**

```bash
git add src/home/dashboard.ts tests/homeDashboard.test.ts
git commit -m "feat(home): pure dashboard selectors for session, stats and identity"
```

---

### Task 3: Presentational components — `StatTile` and `NextSessionCard`

Both are dumb. They receive already-formatted strings from Task 2 and render
them. No data fetching, no formatting, no conditionals beyond styling.

**Files:**
- Create: `src/components/StatTile.tsx`
- Create: `src/components/NextSessionCard.tsx`

**Interfaces:**
- Consumes: `sessionMetaLabel` output as a plain string (Task 2); `C`, `F`, `press` from `src/theme`; `Icon` from `src/components/Icon`.
- Produces:
  - `<StatTile label: string; value: string; valueColor?: string />`
  - `<NextSessionCard title: string; meta: string; onPress: () => void />`

- [ ] **Step 1: Write `StatTile`**

Create `src/components/StatTile.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { C, F } from "../theme";

/** One tile in the Recent Performance row. Value is pre-formatted by the caller. */
export default function StatTile({
  label, value, valueColor = C.text,
}: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={s.tile}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: C.card, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", gap: 6,
  },
  // C.text2, never C.text3 — #5C6472 on C.bg is ~2.9:1, below WCAG AA.
  label: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3 },
  value: { fontSize: 22, fontFamily: F.display },
});
```

- [ ] **Step 2: Write `NextSessionCard`**

Create `src/components/NextSessionCard.tsx`:

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "./Icon";
import { C, F, press } from "../theme";

/**
 * The upcoming-session card. Both strings are resolved by the caller — the club
 * name as title (ClubSession has no title field) and sessionMetaLabel() as meta.
 * The caller renders nothing at all when there is no upcoming session; this
 * component has no empty state of its own.
 */
export default function NextSessionCard({
  title, meta, onPress,
}: {
  title: string; meta: string; onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && press]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next session: ${title}, ${meta}`}
    >
      <View style={s.iconWrap}>
        <Icon name="calendar" color={C.accent} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <Icon name="chevron-forward" color={C.text2} size={20} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(34,211,238,0.12)", alignItems: "center", justifyContent: "center",
  },
  title: { color: C.text, fontSize: 16, fontFamily: F.bold },
  meta: { color: C.text2, fontSize: 13, fontFamily: F.body, marginTop: 2 },
});
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent. If `"calendar"` or `"chevron-forward"` is rejected, open
`src/components/Icon.tsx` and use the exact name from its union — both are
listed there today (`"calendar" | "calendar-outline"` at line 24, and
`chevron-forward` is already used by the club row in `app/(app)/index.tsx:153`).

- [ ] **Step 4: Run the suite to confirm nothing regressed**

```bash
npx jest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/StatTile.tsx src/components/NextSessionCard.tsx
git commit -m "feat(home): add StatTile and NextSessionCard components"
```

---

### Task 4: `ClubSheet` — create and join, moved off the home screen

The create/join forms currently live in the clubs-list footer specifically so
React Native scrolls the focused input into view — see the comment at
`app/(app)/index.tsx:69`, which notes a `KeyboardAvoidingView` was a no-op on
Android. Putting stats below the clubs list destroys that arrangement. A
`BottomPanel` sizes to its own content and handles the keyboard more directly.

The mutation bodies move over unchanged.

**Files:**
- Create: `src/components/ClubSheet.tsx`
- Reference (read, do not modify): `src/components/BottomPanel.tsx`, `app/(app)/index.tsx:40-66`

**Interfaces:**
- Consumes: `createClub`, `joinClub` from `src/repos/clubRepo`; `validateName` from `src/lib/validate`; `toast` from `src/lib/toast`; `BusyButton`, `Icon`, `BottomPanel`.
- Produces: `<ClubSheet visible: boolean; onClose: () => void; onChanged: () => void />` — `onChanged` fires after a successful create or join so the caller can reload.

- [ ] **Step 1: Write the component**

Create `src/components/ClubSheet.tsx`:

```tsx
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import BottomPanel from "./BottomPanel";
import BusyButton from "./BusyButton";
import Icon from "./Icon";
import { createClub, joinClub } from "../repos/clubRepo";
import { validateName } from "../lib/validate";
import { toast } from "../lib/toast";
import { C, F } from "../theme";

/**
 * Create-a-club and join-by-code, hosted in a BottomPanel. These forms used to
 * sit in the home screen's club-list footer for keyboard reasons; a panel sized
 * to its own content solves that more directly, and keeps home clean at every
 * club count.
 */
export default function ClubSheet({
  visible, onClose, onChanged,
}: {
  visible: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const nameError = validateName(name, "Club name");

  const onCreate = async () => {
    if (nameError) { toast(nameError, "error"); return; }
    setCreating(true);
    try {
      await createClub(name.trim());
      setName("");
      setNameTouched(false);
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message || "Could not create club", "error");
    } finally {
      setCreating(false);
    }
  };

  const onJoin = async () => {
    setJoining(true);
    try {
      await joinClub(inviteCode);
      setInviteCode("");
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message || "Could not join club", "error");
    } finally {
      setJoining(false);
    }
  };

  return (
    <BottomPanel visible={visible} title="Clubs" onClose={onClose}>
      <View style={s.group}>
        <Text style={s.groupLabel}>Create a club</Text>
        <View style={s.row}>
          <TextInput
            style={s.input} placeholder="New club name" placeholderTextColor={C.text2}
            value={name} onChangeText={setName} onBlur={() => setNameTouched(true)}
          />
          <BusyButton
            busy={creating} disabled={!!nameError}
            style={[s.btn, !!nameError && s.btnOff]} onPress={onCreate}
          >
            <Icon name="add" color={C.text} size={18} />
            <Text style={s.btnText}>Create</Text>
          </BusyButton>
        </View>
        {nameTouched && nameError ? <Text style={s.err}>{nameError}</Text> : null}
      </View>

      <View style={s.group}>
        <Text style={s.groupLabel}>Join with a code</Text>
        <View style={s.row}>
          <TextInput
            style={s.input} placeholder="Invite code" placeholderTextColor={C.text2}
            autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode}
          />
          <BusyButton
            busy={joining} disabled={!inviteCode.trim()}
            style={[s.btn, !inviteCode.trim() && s.btnOff]} onPress={onJoin}
          >
            <Text style={s.btnText}>Join</Text>
          </BusyButton>
        </View>
      </View>
    </BottomPanel>
  );
}

const s = StyleSheet.create({
  group: { gap: 8, marginBottom: 20 },
  groupLabel: { color: C.text2, fontSize: 13, fontFamily: F.medium, letterSpacing: 0.3 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 12,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, height: 48, fontSize: 16,
  },
  btn: {
    flexDirection: "row", gap: 4, backgroundColor: C.red, borderRadius: 12,
    paddingHorizontal: 16, height: 48, minWidth: 96, alignItems: "center", justifyContent: "center",
  },
  btnOff: { opacity: 0.5 },
  btnText: { color: C.text, fontSize: 16, fontWeight: "700" },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
});
```

- [ ] **Step 2: Confirm `BottomPanel`'s prop names before typechecking**

Open `src/components/BottomPanel.tsx` and confirm its signature is
`{ visible, title, onClose, children }`. If `title` is optional or named
differently, adjust the call above to match — do not change `BottomPanel`.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add src/components/ClubSheet.tsx
git commit -m "feat(home): add ClubSheet hosting create and join forms"
```

---

### Task 5: Rewrite the home screen

**Files:**
- Rewrite: `app/(app)/index.tsx`

**Interfaces:**
- Consumes everything produced by Tasks 1–4.
- Produces: nothing consumed downstream.

Section order, top to bottom: greeting, CTA, feature copy (conditional), next
session (conditional), clubs, recent performance. The clubs list is mapped
inline — it no longer owns the scroll, so `AnimatedList` is dropped from this
screen.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/(app)/index.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Club, ClubPlayer, listRealClubs, refreshClubs,
} from "../../src/repos/clubRepo";
import { ClubSession, listSessions, refreshSessions } from "../../src/repos/sessionRepo";
import { getMyProfile } from "../../src/repos/profileRepo";
import { getPlayerAnalytics, type PlayerAnalytics } from "../../src/repos/statsRepo";
import {
  liveClubIds, pickNextSession, resolveMyPlayerName, sessionMetaLabel,
  shouldShowFeatureCopy, statTileValues,
} from "../../src/home/dashboard";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import StatTile from "../../src/components/StatTile";
import NextSessionCard from "../../src/components/NextSessionCard";
import ClubSheet from "../../src/components/ClubSheet";
import { useSession } from "../../src/stores/session";
import { C, F, GRAD, glow, press } from "../../src/theme";

export default function Home() {
  const router = useRouter();
  const { session } = useSession();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [analytics, setAnalytics] = useState<PlayerAnalytics | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Stamped once per load rather than read during render, so the memos below
  // actually memoize and "Today" cannot flip mid-render.
  const [now, setNow] = useState(() => Date.now());

  const emailPrefix = session?.user.email?.split("@")[0] ?? null;
  const greetName = displayName || emailPrefix || "Player";

  const reload = useCallback(() => {
    setNow(Date.now());
    void refreshClubs().then(() => listRealClubs().then(setClubs));
    void listRealClubs().then(setClubs);
    void refreshSessions().then(() => listSessions().then(setSessions));
    void listSessions().then(setSessions);
    void getMyProfile().then(async (profile) => {
      setDisplayName(profile?.displayName ?? null);
      const players = await listMyClubPlayers();
      const name = resolveMyPlayerName(players, profile?.id ?? null, profile?.displayName ?? null);
      setAnalytics(name ? await getPlayerAnalytics(name) : null);
    });
  }, []);
  useFocusEffect(reload);

  const next = useMemo(() => pickNextSession(sessions, now), [sessions, now]);
  const live = useMemo(() => liveClubIds(sessions), [sessions]);
  const nextClubName = next
    ? clubs.find((c) => c.id === next.club_id)?.name ?? "Session"
    : null;
  const stats = statTileValues(analytics);
  const showCopy = shouldShowFeatureCopy(analytics);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.greetRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.greetEyebrow}>WELCOME BACK</Text>
            <Text style={s.greetName} numberOfLines={1}>{greetName}</Text>
          </View>
          <Logo size={34} showWordmark={false} />
        </View>

        <Pressable
          style={({ pressed }) => [s.ctaWrap, pressed && press]}
          onPress={() => router.push("/new-match")}
          accessibilityRole="button"
          accessibilityLabel="Start a match"
        >
          <LinearGradient
            colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}
          >
            <Icon name="play" color={C.text} size={26} />
            <Text style={s.ctaText}>START A MATCH</Text>
          </LinearGradient>
        </Pressable>

        {showCopy && (
          <Text style={s.featureCopy}>
            Track points, serve orientation, rally history, and set points — live.
          </Text>
        )}

        {next && nextClubName && (
          <NextSessionCard
            title={nextClubName}
            meta={sessionMetaLabel(next, now)}
            onPress={() => router.push(`/(app)/sessions/${next.id}`)}
          />
        )}

        <View style={s.sectionRow}>
          <Text style={s.h}>Your clubs</Text>
          {clubs.length > 0 && (
            <Pressable
              style={({ pressed }) => [s.plusBtn, pressed && press]}
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Create or join a club"
            >
              <Icon name="add" color={C.text} size={18} />
            </Pressable>
          )}
        </View>

        {clubs.length === 0 ? (
          <Pressable
            style={({ pressed }) => [s.emptyCta, pressed && press]}
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
          >
            <Icon name="add" color={C.text} size={18} />
            <Text style={s.emptyCtaText}>Create or join a club</Text>
          </Pressable>
        ) : (
          clubs.map((club) => (
            <Pressable
              key={club.id}
              style={({ pressed }) => [s.club, pressed && press]}
              onPress={() => router.push(`/(app)/clubs/${club.id}`)}
            >
              <View style={s.clubIcon}>
                <Icon name="account-group" color={C.red} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.clubName}>{club.name}</Text>
                <Text style={s.clubMeta}>
                  {club.role ?? "member"}
                  {club.invite_code ? ` · code ${club.invite_code}` : ""}
                </Text>
              </View>
              {live.has(club.id) && (
                <View style={s.livePill}><Text style={s.livePillText}>LIVE</Text></View>
              )}
              <Icon name="chevron-forward" color={C.text2} size={20} />
            </Pressable>
          ))
        )}

        <Text style={[s.h, s.perfHeading]}>Recent performance</Text>
        <View style={s.statRow}>
          <StatTile label="Matches" value={stats.matches} />
          <StatTile
            label="Win Rate" value={stats.winRate}
            valueColor={stats.hasRates ? C.green : C.text2}
          />
          <StatTile
            label="Longest Streak" value={stats.streak}
            valueColor={stats.hasRates ? C.amber : C.text2}
          />
        </View>
      </ScrollView>

      {sheetOpen && (
        <ClubSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onChanged={reload} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  greetRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },
  greetEyebrow: { color: C.text3, fontSize: 11, fontFamily: F.medium, letterSpacing: 1.5 },
  greetName: { color: C.text, fontSize: 24, fontFamily: F.display, letterSpacing: 0.5 },
  ctaWrap: { borderRadius: 16, ...glow(C.red, 18, 0.5) },
  cta: {
    flexDirection: "row", gap: 12, borderRadius: 16, minHeight: 96,
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: C.text, fontSize: 22, fontFamily: F.display, letterSpacing: 1 },
  featureCopy: {
    color: C.text2, fontSize: 13, fontFamily: F.body, lineHeight: 19,
    textAlign: "center", paddingHorizontal: 8, marginTop: -4,
  },
  h: { color: C.text, fontSize: 17, fontFamily: F.bold, letterSpacing: 0.4 },
  perfHeading: { marginTop: 6 },
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6,
  },
  plusBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.red, alignItems: "center", justifyContent: "center",
  },
  emptyCta: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, height: 56,
  },
  emptyCtaText: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  club: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  clubIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,59,48,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  clubName: { color: C.text, fontSize: 17, fontWeight: "700" },
  clubMeta: { color: C.text2, fontSize: 13, marginTop: 2 },
  livePill: {
    backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  livePillText: { color: C.green, fontSize: 11, fontFamily: F.bold, letterSpacing: 0.5 },
  statRow: { flexDirection: "row", gap: 8 },
});
```

- [ ] **Step 2: Add the club-players lookup the screen needs**

The code above calls `listMyClubPlayers()`, which does not exist yet.
`clubRepo` already caches club players in `club_players_cache` with a
`profile_id` column (see `src/repos/clubRepo.ts:84`). Add this export to
`src/repos/clubRepo.ts`, next to the other `list*` functions:

```ts
/** Every club-player row on this device, across all clubs — used to work out
 *  which name the signed-in user appears under in match records. */
export async function listMyClubPlayers(): Promise<ClubPlayer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<ClubPlayer>("select * from club_players_cache");
}
```

Then add it to the import in `app/(app)/index.tsx`:

```ts
import {
  Club, ClubPlayer, listMyClubPlayers, listRealClubs, refreshClubs,
} from "../../src/repos/clubRepo";
```

- [ ] **Step 3: Check the profile and session repo signatures**

Confirm three things and adjust the screen if any differ — do not change the repos:

1. `getMyProfile()` returns an object with `id` and `displayName`. If the id field is named differently, use the actual name in the `resolveMyPlayerName` call.
2. `refreshSessions()` exists and is exported from `src/repos/sessionRepo`. If it takes a required `clubId`, drop the `refreshSessions()` call and rely on `listSessions()` against the local cache.
3. `getPlayerAnalytics` and `PlayerAnalytics` are both exported from `src/repos/statsRepo` — they are, at `src/repos/statsRepo.ts:6` and `:17`.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent. `ClubPlayer` is imported for the repo function's return type;
if tsc flags it as unused in the screen, remove it from the screen's import
list only.

- [ ] **Step 5: Run the full suite**

```bash
npx jest
```

Expected: PASS. Nothing here should touch existing tests; if
`tests/guestMatches.test.ts` or any routing test fails, the screen has changed
an export it should not have.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/index.tsx" src/repos/clubRepo.ts
git commit -m "feat(home): rebuild home as a dashboard with stats and next session"
```

---

### Task 6: Device verification

No component render tests exist, so the visual and interaction behaviour is
verified by hand. Run through every state the spec names.

**Files:** none — verification only.

- [ ] **Step 1: Start the app**

```bash
npx expo start --clear
```

If it fails with `TypeError: Body is unusable: Body has already been read`, use:

```bash
EXPO_SKIP_DEPENDENCY_VALIDATION=1 npx expo start --clear
```

- [ ] **Step 2: Verify the steady state**

On an account with 5+ completed matches and at least one club:
- CTA is visibly taller than the club rows and reads at 22pt.
- No feature copy under the CTA.
- Three stat tiles show real numbers; Win Rate is green, Longest Streak is amber.
- Win Rate and Longest Streak match what the profile screen reports for the same player.

- [ ] **Step 3: Verify the new-user state**

On an account with 0 clubs and 0 matches:
- Feature copy is visible under the CTA.
- "Create or join a club" button appears where the club list would be.
- Tiles read `0`, `—`, `—`, with both dashes in `C.text2`.
- No session card and no `Your clubs` `+` button.

- [ ] **Step 4: Verify the session card**

Schedule a session for later today in one club:
- The card appears above `Your clubs`, titled with the club name.
- Meta reads `Today · <time> · <venue>`, or `Today · <time> · N courts` when the session has no venue.
- Tapping it opens that session's detail screen.
- Schedule a second, later session and confirm the card still shows the **sooner** one.
- Cancel the soonest session and confirm the card falls through to the next one.

- [ ] **Step 5: Verify the Live pill**

Start a session (status `live`) in one club:
- That club's row shows a green `LIVE` pill; other clubs do not.

- [ ] **Step 6: Verify the club sheet, including the keyboard**

- Tap `+` in the `Your clubs` header. The panel springs up.
- Focus "New club name". **The keyboard must not cover the input** — this is the behaviour the old footer placement existed to protect (`app/(app)/index.tsx:69` in the pre-rewrite file). Check on Android specifically, where `KeyboardAvoidingView` is a no-op.
- Create a club. The panel closes and the new club appears in the list without a manual refresh.
- Reopen, join with an invite code, confirm the same.
- Enter an invalid club name and confirm the inline error appears and Create stays disabled.
- Drag the panel down to dismiss; confirm no state is left behind when reopening.

- [ ] **Step 7: Verify layout at the extremes**

- Small phone (375pt wide): nothing clipped, no horizontal scroll, tiles fit three across.
- 5+ clubs: the screen scrolls and stats remain reachable at the bottom.
- Largest Dynamic Type setting: tile labels and values wrap or shrink rather than overlapping.

- [ ] **Step 8: Commit nothing, report findings**

This task produces no commit. Report anything that failed; fix-ups belong in a
follow-up commit against the specific file at fault.

---

## Notes carried from the spec

- **Player-name assumption.** `getPlayerAnalytics` matches on player *name*. `resolveMyPlayerName` prefers the user's club-player name over their profile display name, because club-player names are what match setup draws from. If a user records matches under a name matching neither, all three tiles read as no-data. This is a known, accepted limitation.
- **"Matches" semantics.** The tile counts matches where the user's name appears on a side, not every match they recorded. Someone who scores matches for other people will not see those in their count. Flagged in the spec as an open reading of the label; no behaviour change is planned here.
- **`WELCOME BACK` eyebrow contrast.** It uses `C.text3` and is below AA. It is left alone deliberately — out of scope for this change, and it is pre-existing.
