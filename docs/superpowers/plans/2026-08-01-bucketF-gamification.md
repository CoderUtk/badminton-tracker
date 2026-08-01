# Bucket F — Gamification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add achievement badges (a pure rules engine over existing player stats) shown on Profile, plus local inactivity reminder notifications — both fully on-device, no backend.

**Architecture:** A pure `src/achievements/rules.ts` maps a player's `PlayerAnalytics` (from the existing `statsRepo`) to earned/locked badges — deterministic and unit-tested. A badges grid renders on Profile. Local `expo-notifications` schedule an inactivity nudge, controlled by a Profile toggle stored via `settingsRepo`.

**Tech Stack:** Expo SDK 54, `expo-notifications` (new dep), Jest.

## Global Constraints

- `src/engine/*` untouched; achievements derive from `statsRepo` output only.
- Achievement rules are **pure** (no I/O) and fully unit-tested.
- Notifications are **local-scheduled** (no server); opt-in via a Profile toggle; respect denied permission gracefully.
- Reuse `settingsRepo` (Phase 1) for the toggle + "seen badges" state.
- Follow theme tokens; use `PressableScale`/`toast` where relevant.
- Gate on `npx tsc --noEmit && npm test`.

**Consumes (existing):** `getPlayerAnalytics(name): Promise<PlayerAnalytics>` from `src/repos/statsRepo.ts`, with fields `played, wins, losses, winPct, gamesWon, gamesLost, pointsFor, pointsAgainst, form: ("W"|"L")[], recent[]`. (Read `statsRepo.ts` first to confirm the exact field names before writing rules.)

---

## Task 1: Achievements rules engine (pure)

**Files:**
- Create: `src/achievements/types.ts`, `src/achievements/rules.ts`
- Test: `tests/achievements.test.ts`

**Interfaces:**
- Produces:
  - `type Badge = { id: string; title: string; description: string; icon: string }`
  - `type EarnedBadge = Badge & { earned: boolean; progress: number }` (`progress` 0..1)
  - `evaluateBadges(a: PlayerAnalytics): EarnedBadge[]` — deterministic, ordered.

- [ ] **Step 1: Write failing test**

```typescript
// tests/achievements.test.ts
import { evaluateBadges } from "../src/achievements/rules";

const base = { played: 0, wins: 0, losses: 0, winPct: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0, form: [] as ("W" | "L")[], recent: [] as unknown[] };

test("no play -> nothing earned, first-win at 0 progress", () => {
  const b = evaluateBadges(base as any);
  expect(b.every((x) => !x.earned)).toBe(true);
  expect(b.find((x) => x.id === "first_win")!.progress).toBe(0);
});

test("first win earns first_win and shows partial toward 10-win badge", () => {
  const b = evaluateBadges({ ...base, played: 1, wins: 1, winPct: 100, form: ["W"] } as any);
  expect(b.find((x) => x.id === "first_win")!.earned).toBe(true);
  expect(b.find((x) => x.id === "wins_10")!.earned).toBe(false);
  expect(b.find((x) => x.id === "wins_10")!.progress).toBeCloseTo(0.1, 5);
});

test("five-win streak earns the streak badge", () => {
  const b = evaluateBadges({ ...base, played: 6, wins: 5, form: ["W", "W", "W", "W", "W"] } as any);
  expect(b.find((x) => x.id === "streak_5")!.earned).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/achievements/types.ts
export type Badge = { id: string; title: string; description: string; icon: string };
export type EarnedBadge = Badge & { earned: boolean; progress: number };
```

```typescript
// src/achievements/rules.ts
import type { EarnedBadge } from "./types";

type Analytics = {
  played: number; wins: number; losses: number; winPct: number;
  gamesWon: number; gamesLost: number; pointsFor: number; pointsAgainst: number;
  form: ("W" | "L")[];
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const currentStreak = (form: ("W" | "L")[]) => {
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === "W"; i--) n++;
  return n;
};

export function evaluateBadges(a: Analytics): EarnedBadge[] {
  const streak = currentStreak(a.form);
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
      earned: a.played >= 10 && a.winPct >= 60, progress: clamp01(a.winPct / 60) },
  ];
}
```

(Use only `Icon` names that already exist in `src/components/Icon.tsx`.)

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/achievements/ tests/achievements.test.ts
git commit -m "feat(gamification): pure achievements rules engine"
```

---

## Task 2: Badges grid on Profile

**Files:**
- Create: `src/components/BadgeGrid.tsx`
- Modify: `app/(app)/profile.tsx` (render the grid from the current player's analytics)

**Interfaces:** Consumes `evaluateBadges` (Task 1); the Profile already loads `PlayerAnalytics` into `a`.

- [ ] **Step 1: Build `BadgeGrid.tsx`** — a wrap grid of badge chips: earned = colored (`C.red`/`C.accent`) icon + title; locked = dim with a thin progress ring/bar (`progress`). Props: `badges: EarnedBadge[]`.

- [ ] **Step 2: Wire Profile.** In `app/(app)/profile.tsx`, when `a` is loaded, compute `evaluateBadges(a)` and render `<BadgeGrid badges={...}/>` in a new "Achievements" card. (Optional: compare against `getSetting("seen_badges")` and `toast("New badge!")` on newly earned — only if Bucket A's toast is present.)

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: a player with wins shows earned badges; a new player shows locked with progress.**

- [ ] **Step 4: Commit**

```bash
git add src/components/BadgeGrid.tsx "app/(app)/profile.tsx"
git commit -m "feat(gamification): achievements grid on Profile"
```

---

## Task 3: Local inactivity reminders

**Files:**
- Create: `src/lib/reminders.ts`
- Modify: `app/(app)/profile.tsx` (a "Play reminders" toggle), `app/_layout.tsx` (reschedule on app open), `package.json`
- Uses: `settingsRepo` (`REMINDERS_KEY = "reminders_on"`)

**Interfaces:**
- Produces:
  - `REMINDERS_KEY` (add to `settingsRepo`)
  - `scheduleInactivityReminder(): Promise<void>` — cancels existing, schedules a local notification ~7 days out ("Haven't played in a while? Start a match.") if enabled + permitted.
  - `cancelReminders(): Promise<void>`

- [ ] **Step 1: Install**

```bash
npx expo install expo-notifications
```

- [ ] **Step 2: Implement `reminders.ts`** — request permission on first enable; `Notifications.scheduleNotificationAsync` with a ~7-day trigger; store nothing sensitive; guard all calls behind the `REMINDERS_KEY` setting and permission status. No-op on web.

```typescript
// shape (fill body per expo-notifications SDK 54 docs)
import * as Notifications from "expo-notifications";
export async function scheduleInactivityReminder(): Promise<void> { /* cancel, check setting+perm, schedule 7d */ }
export async function cancelReminders(): Promise<void> { await Notifications.cancelAllScheduledNotificationsAsync(); }
```

- [ ] **Step 3: Toggle + reschedule.** Add a "Play reminders" switch to Profile writing `REMINDERS_KEY`; on toggle call `scheduleInactivityReminder()` / `cancelReminders()`. In `app/_layout.tsx`, on app foreground call `scheduleInactivityReminder()` (pushes the 7-day clock forward each open; playing a match also reschedules). Cancel/rescore is fine to keep simple: always reschedule from "now".

- [ ] **Step 4: `npx tsc --noEmit` clean; manual (device): enable reminders → permission prompt → a scheduled notification exists; disable → cleared.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminders.ts "app/(app)/profile.tsx" app/_layout.tsx src/repos/settingsRepo.ts package.json package-lock.json
git commit -m "feat(gamification): local inactivity reminders"
```

---

## Self-Review

**Spec coverage (Bucket F):** achievements engine (Task 1), badges on Profile (Task 2), local inactivity notifications (Task 3). ✅

**Type consistency:** `Badge`/`EarnedBadge` identical across `types.ts`, `rules.ts`, `BadgeGrid.tsx`. `evaluateBadges` signature consistent between Task 1 and Task 2. `REMINDERS_KEY` defined once in `settingsRepo` and consumed in Profile + `_layout`.

**Placeholder scan:** rules engine fully coded + tested. `reminders.ts` body references the exact SDK calls with the trigger described; the Icon names must be validated against `Icon.tsx` (noted). No vague requirements.

**Out of scope:** server push, leaderboards, XP/levels — not included.
