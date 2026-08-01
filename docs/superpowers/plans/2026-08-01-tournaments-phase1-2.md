# Tournaments Phase 1+2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the local, no-backend tournament improvements — three UX fixes (tournaments tab, player name on Home, fullscreen scoring) and three format upgrades (up to 64 players, doubles, games-per-match with semifinal escalation).

**Architecture:** Extends the existing pure bracket engine (`src/tournament`), `tournamentRepo`, and the `app/(app)` route tree. The event-sourced scoring engine is reused unchanged — it already scores doubles and honors `bestOf`. One SQLite migration adds the new tournament columns and a settings table.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript, expo-router v6, expo-sqlite, Jest, `expo-navigation-bar` (new).

## Global Constraints

- `src/engine/*` stays pure and unmodified. Reuse `defaultConfig`, `replay`, `MatchConfig`.
- Single elimination only. Doubles is a per-tournament flag, not a new bracket type.
- Bracket sizes: `4 | 8 | 16 | 32 | 64`.
- "Semifinals onward" = the last two rounds use `finalsBestOf`.
- Local SQLite is the source of truth; no backend in these phases.
- DB column stays `idx` (not `index`) for bracket cells.
- Follow existing theme tokens (`C`, `F`, `glow`, `press`), `Icon`, and `PressableScale` where a tap wants spring feedback.
- Gate every task on `npx tsc --noEmit && npm test`.

---

## Phase 1 — UX fixes

### Task 1: Local settings store + player name on Home + Profile edit

**Files:**
- Create: `src/db/settings.ts` (DDL constant)
- Modify: `src/db/db.ts` (append migration)
- Create: `src/repos/settingsRepo.ts`
- Modify: `app/(app)/index.tsx` (greeting), `app/(app)/profile.tsx` (edit field)
- Test: `tests/settings.schema.test.ts`

**Interfaces:**
- Consumes: `getDb()`.
- Produces:
  - `SETTINGS_DDL` (string) — `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  - `getSetting(key: string): Promise<string | null>`
  - `setSetting(key: string, value: string): Promise<void>`
  - `DISPLAY_NAME_KEY = "display_name"` constant.

- [ ] **Step 1: Write failing test**

```typescript
// tests/settings.schema.test.ts
import { SETTINGS_DDL } from "../src/db/settings";
test("settings DDL declares app_settings", () => {
  expect(SETTINGS_DDL).toMatch(/CREATE TABLE IF NOT EXISTS app_settings/);
  expect(SETTINGS_DDL).toMatch(/key TEXT PRIMARY KEY/);
});
```

- [ ] **Step 2: Run → FAIL** (`SETTINGS_DDL` undefined). `npm test -- settings.schema.test.ts`

- [ ] **Step 3: Add DDL + migration + repo**

```typescript
// src/db/settings.ts
export const SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
```

In `src/db/db.ts`: `import { SETTINGS_DDL } from "./settings";` and append `SETTINGS_DDL` as a new element of the `MIGRATIONS` array (after `TOURNAMENT_DDL`), which bumps `user_version` automatically.

```typescript
// src/repos/settingsRepo.ts
import { getDb } from "../db/db";
export const DISPLAY_NAME_KEY = "display_name";
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ value: string }>("select value from app_settings where key = ?", key);
  return row?.value ?? null;
}
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db?.runAsync(
    "insert into app_settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
    key, value,
  );
}
```

- [ ] **Step 4: Run → PASS**, then `npx tsc --noEmit`.

- [ ] **Step 5: Home greeting.** In `app/(app)/index.tsx`, add state `const [name, setName] = useState<string | null>(null);`, load in the existing `reload` (`getSetting(DISPLAY_NAME_KEY).then(setName)`), and render above `<Logo>` a greeting row: `Hi, {name ?? session-name ?? "Player"}`. Prefer the signed-in name (`useSession().session?.user.user_metadata?.full_name ?? email`) when present, else the local setting, else "Player". Style with `C.text2` eyebrow + `C.text` display name.

- [ ] **Step 6: Profile edit.** In `app/(app)/profile.tsx`, add (offline or always) a "Display name" `TextInput` seeded from `getSetting(DISPLAY_NAME_KEY)`; on submit call `setSetting(DISPLAY_NAME_KEY, value)` and update local state. Keep the existing "Viewing as" picker.

- [ ] **Step 7: `npx tsc --noEmit` clean; manual: set a name in Profile → Home greets by it.**

- [ ] **Step 8: Commit**

```bash
git add src/db/settings.ts src/db/db.ts src/repos/settingsRepo.ts "app/(app)/index.tsx" "app/(app)/profile.tsx" tests/settings.schema.test.ts
git commit -m "feat(ui): local display name — Home greeting + Profile edit"
```

---

### Task 2: Promote Tournaments to a bottom tab

**Files:**
- Modify: `app/(app)/_layout.tsx` (add tab, was hidden route)
- Modify: `app/(app)/index.tsx` (remove the now-redundant Tournaments Home pill; keep the Live pill)

**Interfaces:** none (nav config only).

- [ ] **Step 1: Add the tab.** In `app/(app)/_layout.tsx` replace the hidden `<Tabs.Screen name="tournaments" options={{ href: null, headerShown: false }} />` with a visible tab:

```tsx
<Tabs.Screen name="tournaments" options={{ title: "Cups", tabBarIcon: icon("trophy"), headerShown: false }} />
```

Keep `watch` hidden (`href: null`). Order the tabs: index, sessions, matches, tournaments, profile (five total — within the ≤5 rule). Keep `clubs` hidden.

- [ ] **Step 2: Trim the Home pill.** In `app/(app)/index.tsx`, remove the Tournaments `navPill` (it's a tab now); keep the **Live** pill. If only one pill remains, let it sit full-width or center it.

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: Tournaments tab appears and routes to the list.**

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/_layout.tsx" "app/(app)/index.tsx"
git commit -m "feat(nav): tournaments as its own tab"
```

---

### Task 3: Fullscreen (immersive) scoring screen

**Files:**
- Modify: `app/score/[matchId].tsx` (enter/exit immersive on focus)
- Modify: `package.json` (add `expo-navigation-bar`)

**Interfaces:** none.

- [ ] **Step 1: Install the dep**

```bash
npx expo install expo-navigation-bar
```

- [ ] **Step 2: Enter immersive on mount, restore on unmount.** In `app/score/[matchId].tsx`, add an effect:

```tsx
import { useEffect } from "react";
import { Platform } from "react-native";
import { setStatusBarHidden } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";

useEffect(() => {
  setStatusBarHidden(true, "fade");
  if (Platform.OS === "android") {
    void NavigationBar.setVisibilityAsync("hidden");
    void NavigationBar.setBehaviorAsync("overlay-swipe"); // sticky immersive; swipe reveals temporarily
  }
  return () => {
    setStatusBarHidden(false, "fade");
    if (Platform.OS === "android") void NavigationBar.setVisibilityAsync("visible");
  };
}, []);
```

(If `score/[matchId].tsx` currently only renders `<MatchScreen>`, wrap it so this effect lives in the route component; do not move the logic into `MatchScreen` — the screen is also embeddable.)

- [ ] **Step 3: `npx tsc --noEmit` clean; manual (device): open a match → status/nav bars hidden, `+1` rails reach the edges; leave → bars return.**

- [ ] **Step 4: Commit**

```bash
git add "app/score/[matchId].tsx" package.json package-lock.json
git commit -m "feat(score): force fullscreen immersive scoring"
```

---

## Phase 2 — Tournament format

### Task 4: Support 64-player brackets

**Files:**
- Modify: `src/tournament/types.ts` (widen `BracketSize`)
- Modify: `app/(app)/tournaments/new.tsx` (add 64 to size picker)
- Test: `tests/bracket.test.ts` (add a size-64 case)

**Interfaces:**
- Produces: `BracketSize = 4 | 8 | 16 | 32 | 64`.

- [ ] **Step 1: Write failing test** (append to `tests/bracket.test.ts`)

```typescript
test("size 64 builds 32 round-1 matches and a 6-round bracket", () => {
  const b = buildBracket(ents(64), 64, "t1", gen);
  expect(b.filter((m) => m.round === 1)).toHaveLength(32);
  expect(Math.max(...b.map((m) => m.round))).toBe(6);
});
```

- [ ] **Step 2: Run → FAIL** (type error: `64` not assignable to `BracketSize`). `npm test -- bracket.test.ts`

- [ ] **Step 3: Widen the type**

```typescript
// src/tournament/types.ts
export type BracketSize = 4 | 8 | 16 | 32 | 64;
```

Add `64` to the `SIZES` array in `app/(app)/tournaments/new.tsx`.

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/tournament/types.ts "app/(app)/tournaments/new.tsx" tests/bracket.test.ts
git commit -m "feat(tournament): support 64-player brackets"
```

---

### Task 5: Schema additions for doubles + games config

**Files:**
- Modify: `src/db/schema.ts` (`TOURNAMENT_DDL`: add columns) — new migration so existing installs upgrade
- Modify: `src/db/db.ts` (append an ALTER migration)
- Test: `tests/schema.tournaments.test.ts` (assert new columns present in DDL)

**Interfaces:**
- Produces: `tournaments` gains `match_type TEXT DEFAULT 'singles'`, `bestof INTEGER DEFAULT 3`, `finals_bestof INTEGER DEFAULT 3`; `tournament_entrants` gains `club_player_id_2 TEXT` (nullable, second player for doubles).

- [ ] **Step 1: Write failing test** (append)

```typescript
test("tournament DDL includes match_type, bestof, finals_bestof, club_player_id_2", () => {
  expect(TOURNAMENT_DDL).toMatch(/match_type/);
  expect(TOURNAMENT_DDL).toMatch(/finals_bestof/);
  expect(TOURNAMENT_DDL).toMatch(/club_player_id_2/);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Update `TOURNAMENT_DDL`** (for fresh installs) so `tournaments` includes `match_type TEXT NOT NULL DEFAULT 'singles'`, `bestof INTEGER NOT NULL DEFAULT 3`, `finals_bestof INTEGER NOT NULL DEFAULT 3`, and `tournament_entrants` includes `club_player_id_2 TEXT`.

For **existing** installs, append a new migration string to `MIGRATIONS` in `db.ts` with idempotent ALTERs (SQLite has no `ADD COLUMN IF NOT EXISTS`, so this migration only runs once via `user_version`, which is safe):

```sql
ALTER TABLE tournaments ADD COLUMN match_type TEXT NOT NULL DEFAULT 'singles';
ALTER TABLE tournaments ADD COLUMN bestof INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournaments ADD COLUMN finals_bestof INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournament_entrants ADD COLUMN club_player_id_2 TEXT;
```

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/db.ts tests/schema.tournaments.test.ts
git commit -m "feat(db): tournament doubles + games-config columns"
```

---

### Task 6: bestOf-by-round selector (pure)

**Files:**
- Create: `src/tournament/format.ts`
- Test: `tests/format.test.ts`

**Interfaces:**
- Produces: `pickBestOf(round: number, maxRound: number, bestOf: number, finalsBestOf: number): number` — returns `finalsBestOf` for the last two rounds (semifinal + final), else `bestOf`.

- [ ] **Step 1: Write failing test**

```typescript
// tests/format.test.ts
import { pickBestOf } from "../src/tournament/format";
test("finals bestOf applies from the semifinal (last two rounds)", () => {
  // size 16 => maxRound 4; semifinal = round 3, final = round 4
  expect(pickBestOf(1, 4, 3, 5)).toBe(3);
  expect(pickBestOf(2, 4, 3, 5)).toBe(3);
  expect(pickBestOf(3, 4, 3, 5)).toBe(5); // semifinal
  expect(pickBestOf(4, 4, 3, 5)).toBe(5); // final
});
test("brackets with <2 rounds use default only where no semifinal exists", () => {
  expect(pickBestOf(1, 1, 3, 5)).toBe(5); // single match is the final
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/tournament/format.ts
/** finalsBestOf applies to the final and semifinal (the last two rounds); default elsewhere. */
export function pickBestOf(round: number, maxRound: number, bestOf: number, finalsBestOf: number): number {
  return round >= maxRound - 1 ? finalsBestOf : bestOf;
}
```

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/tournament/format.ts tests/format.test.ts
git commit -m "feat(tournament): per-round bestOf selector"
```

---

### Task 7: Doubles config builder + repo wiring

**Files:**
- Create: `src/tournament/matchConfig.ts` (pure builder)
- Modify: `src/repos/tournamentRepo.ts` (`createTournament` accepts pairs + games config; `startBracketMatch` uses builder + `pickBestOf`; entrant loading resolves second name)
- Test: `tests/matchConfig.test.ts`

**Interfaces:**
- Consumes: `defaultConfig` from `src/engine`, `pickBestOf` (Task 6).
- Produces:
  - `type SidePlayers = { id: string; name: string }[]`
  - `buildTournamentConfig(a: SidePlayers, b: SidePlayers, matchType: 'singles' | 'doubles', bestOf: 1 | 3 | 5): MatchConfig`
  - `createTournament(clubId, name, size, matchType, bestOf, finalsBestOf, entrants: { clubPlayerId: string; clubPlayerId2?: string | null; name: string; seed: number }[]): Promise<string>` (extended signature)

- [ ] **Step 1: Write failing test**

```typescript
// tests/matchConfig.test.ts
import { buildTournamentConfig } from "../src/tournament/matchConfig";
test("doubles config puts two players on each side", () => {
  const cfg = buildTournamentConfig(
    [{ id: "a1", name: "A1" }, { id: "a2", name: "A2" }],
    [{ id: "b1", name: "B1" }, { id: "b2", name: "B2" }],
    "doubles", 3,
  );
  expect(cfg.matchType).toBe("doubles");
  expect(cfg.teams.A).toHaveLength(2);
  expect(cfg.teams.B).toHaveLength(2);
  expect(cfg.bestOf).toBe(3);
});
test("singles config puts one player on each side", () => {
  const cfg = buildTournamentConfig([{ id: "a", name: "A" }], [{ id: "b", name: "B" }], "singles", 5);
  expect(cfg.matchType).toBe("singles");
  expect(cfg.teams.A).toHaveLength(1);
  expect(cfg.bestOf).toBe(5);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the builder**

```typescript
// src/tournament/matchConfig.ts
import { defaultConfig } from "../engine";
import type { MatchConfig } from "../engine";

export type SidePlayers = { id: string; name: string }[];

export function buildTournamentConfig(
  a: SidePlayers, b: SidePlayers, matchType: "singles" | "doubles", bestOf: 1 | 3 | 5,
): MatchConfig {
  return defaultConfig({
    matchType,
    bestOf,
    teams: {
      A: a.map((p, i) => ({ id: `a${i}`, name: p.name })),
      B: b.map((p, i) => ({ id: `b${i}`, name: p.name })),
    },
  });
}
```

- [ ] **Step 4: Wire `tournamentRepo`.**
  - `createTournament` gains `matchType`, `bestOf`, `finalsBestOf` params and persists them on the `tournaments` row; entrants persist `club_player_id_2` when present; the entrant display `name` is the combined "P1 / P2" for doubles.
  - `loadEntrants` resolves both player names (join `club_players_cache` twice, or resolve names from the stored entrant name).
  - `startBracketMatch`: load tournament (`match_type`, `bestof`, `finals_bestof`), compute `maxRound` from the bracket, call `pickBestOf(cell.round, maxRound, bestof, finals_bestof)`, build sides from the two entrants (each 1 or 2 players by `match_type`), call `buildTournamentConfig`, then `createMatch` with the correct `SidePlayer[]` per side (`club_player_id` + `name`; for doubles include both players in `side_a`/`side_b`).

- [ ] **Step 5: Run → PASS** (`tests/matchConfig.test.ts` + existing `tournamentRepo` tests), `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/tournament/matchConfig.ts src/repos/tournamentRepo.ts tests/matchConfig.test.ts
git commit -m "feat(tournament): doubles config builder + games-per-round wiring"
```

---

### Task 8: New-tournament screen — format controls

**Files:**
- Modify: `app/(app)/tournaments/new.tsx`

**Interfaces:**
- Consumes: extended `createTournament` (Task 7), `listPlayers`.

- [ ] **Step 1: Add controls.** In `app/(app)/tournaments/new.tsx`:
  - A **Singles / Doubles** segmented toggle (`matchType` state).
  - Size selector already includes 64 (Task 4).
  - **Default games** selector (Best of 1 / 3 / 5) and a **Finals games** selector (Best of 1 / 3 / 5, applied from semifinals) — two rows of segmented buttons, mirroring the existing size selector styling. Use `PressableScale` for the buttons.
  - **Entrant picking:** singles unchanged (tap a player = one entrant). Doubles: tapping selects players two-at-a-time into a pair; show pairs as "P1 / P2" chips with their seed. Enforce `pairs >= 2` and `pairs <= size`.

- [ ] **Step 2: Wire create.** Build the entrants array with `clubPlayerId` (+ `clubPlayerId2` for doubles) and `seed` by pair order; call `createTournament(clubId, name, size, matchType, bestOf, finalsBestOf, entrants)` → `router.replace(\`/tournaments/${id}\`)`.

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: create a doubles, 8-player, Bo3→Bo5-finals tournament; start the final → scorer opens best-of-5 doubles.**

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/tournaments/new.tsx"
git commit -m "feat(tournament): singles/doubles + games-config on create screen"
```

---

## Self-Review

**Spec coverage (Phase 1+2 of the roadmap):**
- Tournaments tab → Task 2. ✅
- Player name on Home → Task 1. ✅
- Fullscreen scoring → Task 3. ✅
- Up to 64 → Task 4. ✅
- Doubles → Tasks 5, 7, 8. ✅
- Games-per-match + semifinal escalation → Tasks 5, 6, 7, 8. ✅

**Type consistency:** `BracketSize` includes 64 across Tasks 4/8. `matchType: 'singles' | 'doubles'` and `bestOf: 1 | 3 | 5` identical in `matchConfig.ts`, `tournamentRepo`, and `new.tsx`. `pickBestOf` signature identical in Tasks 6 and 7. DB column `club_player_id_2` / `match_type` / `bestof` / `finals_bestof` named identically in schema (Task 5) and repo (Task 7).

**Placeholder scan:** none — every code step carries real code; UI steps that are screen-shaped reference exact controls and existing styling patterns.

**Out of scope (correctly absent):** join-by-link, approval, multi-scorer, courts (Phases 3–4, separate plans; require Supabase).
