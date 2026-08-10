# New Match Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `app/new-match.tsx` so the whole match setup fits one page, with player names edited inside the court, the first server picked by tapping a court zone, in-court swap buttons, a compact club picker, and the last lineup remembered locally.

**Architecture:** The court preview becomes the input surface. Zone maths moves out of `Court.tsx` into a pure, unit-testable module (`src/lib/courtZones.ts`); a single service box becomes its own component (`src/components/CourtBox.tsx`) that can render a name, an inline `TextInput`, the serve dot, and an error pulse; `Court.tsx` composes two halves plus the in-court swap buttons and stays read-only unless an optional `edit` prop is supplied. Lineup persistence is a small module over the same storage shim `src/lib/guestMatches.ts` already uses.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router 6, TypeScript 5.9, Jest 29 + ts-jest (node environment), expo-secure-store.

## Global Constraints

- Read the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo-specific code (per `AGENTS.md`).
- Jest runs with `testEnvironment: "node"` and `roots: ["<rootDir>/tests"]`. It **cannot** parse React Native components. Only pure modules get unit tests; component work is verified with `npx tsc --noEmit` plus the manual checklist in Task 6.
- Keep every file under 500 lines.
- Commit with an explicit pathspec. Never `git add -A`, `git add .`, or `git commit -a`.
- Never add a `Co-Authored-By` trailer.
- No new npm dependencies. No database, Supabase, or migration changes.
- The word "None" must not appear as a club option anywhere in the new UI. The no-club option is labelled **Personal**.
- Existing consumers of `<Court state={...} />` (`app/score/[matchId].tsx`, `app/(app)/watch/[matchId].tsx` and any other) must keep working unchanged — every new `Court` prop is optional.
- Design source of truth: `docs/superpowers/specs/2026-08-10-new-match-screen-design.md`.

---

### Task 1: Pure court-zone maths

Lift the "which player stands in which box" rule out of `Court.tsx` into a pure module so both the court renderer and the new-match screen use one implementation, and so it can be tested under the node test environment.

**Files:**
- Create: `src/lib/courtZones.ts`
- Modify: `src/components/Court.tsx` (replace the inline `rightRow` / `Half` index maths with the helper)
- Test: `tests/courtZones.test.ts`

**Interfaces:**
- Consumes: `MatchState`, `TeamId`, `serviceCourt` from `src/engine`.
- Produces:
  ```ts
  export type CourtRow = "top" | "bottom";
  export type CourtZone = {
    team: TeamId;
    row: CourtRow;
    playerIdx: number | null;
    isRightCourt: boolean;
  };
  export function rightRow(team: TeamId): CourtRow;
  export function courtZones(state: MatchState): CourtZone[]; // 4 zones: A-top, A-bottom, B-top, B-bottom
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/courtZones.test.ts`:

```ts
import { defaultConfig, MatchEvent, replay, TeamId } from "../src/engine";
import { courtZones, rightRow } from "../src/lib/courtZones";

const start = (overrides = {}): MatchEvent[] => [
  { type: "MATCH_STARTED", config: defaultConfig(overrides), at: 0 },
];

const rally = (events: MatchEvent[], by: TeamId): MatchEvent[] => [
  ...events,
  { type: "RALLY_WON", by, at: 0 },
];

const zone = (state: ReturnType<typeof replay>, team: TeamId, row: "top" | "bottom") =>
  courtZones(state).find((z) => z.team === team && z.row === row)!;

test("team A's right service court is the bottom box, team B's is the top box", () => {
  expect(rightRow("A")).toBe("bottom");
  expect(rightRow("B")).toBe("top");
});

test("returns four zones in reading order", () => {
  const zones = courtZones(replay(start()));
  expect(zones.map((z) => `${z.team}-${z.row}`)).toEqual([
    "A-top", "A-bottom", "B-top", "B-bottom",
  ]);
});

test("doubles: the first server stands in their team's right court", () => {
  const s = replay(start({ firstServer: { team: "A", playerIndex: 1 } }));
  expect(zone(s, "A", "bottom")).toMatchObject({ playerIdx: 1, isRightCourt: true });
  expect(zone(s, "A", "top")).toMatchObject({ playerIdx: 0, isRightCourt: false });
});

test("doubles: the receiving team starts with player 0 in their right court", () => {
  const s = replay(start({ firstServer: { team: "A", playerIndex: 1 } }));
  expect(zone(s, "B", "top")).toMatchObject({ playerIdx: 0, isRightCourt: true });
  expect(zone(s, "B", "bottom")).toMatchObject({ playerIdx: 1, isRightCourt: false });
});

test("doubles: serving from team B puts its first server in the top box", () => {
  const s = replay(start({ firstServer: { team: "B", playerIndex: 1 } }));
  expect(zone(s, "B", "top")).toMatchObject({ playerIdx: 1, isRightCourt: true });
  expect(zone(s, "A", "bottom")).toMatchObject({ playerIdx: 0, isRightCourt: true });
});

test("singles: at 0-0 both players stand in their right court, left boxes are empty", () => {
  const s = replay(start({ matchType: "singles" }));
  expect(zone(s, "A", "bottom").playerIdx).toBe(0);
  expect(zone(s, "A", "top").playerIdx).toBeNull();
  expect(zone(s, "B", "top").playerIdx).toBe(0);
  expect(zone(s, "B", "bottom").playerIdx).toBeNull();
});

test("singles: an odd server score moves both players to their left court", () => {
  const s = replay(rally(start({ matchType: "singles" }), "A"));
  expect(zone(s, "A", "top").playerIdx).toBe(0);
  expect(zone(s, "A", "bottom").playerIdx).toBeNull();
  expect(zone(s, "B", "bottom").playerIdx).toBe(0);
  expect(zone(s, "B", "top").playerIdx).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/courtZones.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/courtZones'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/courtZones.ts`:

```ts
import type { MatchState, TeamId } from "../engine";
import { serviceCourt } from "../engine";

export type CourtRow = "top" | "bottom";

/** One of the four service boxes drawn by <Court />. */
export type CourtZone = {
  team: TeamId;
  row: CourtRow;
  /** Index into state.config.teams[team], or null when nobody stands here. */
  playerIdx: number | null;
  /** True when this box is that team's RIGHT service court. */
  isRightCourt: boolean;
};

const other = (row: CourtRow): CourtRow => (row === "top" ? "bottom" : "top");

/**
 * Which stacked row is a team's right service court. Team A occupies the left
 * half and faces right, so its right court is the BOTTOM box; team B faces
 * left, so its right court is the TOP box.
 */
export function rightRow(team: TeamId): CourtRow {
  return team === "A" ? "bottom" : "top";
}

/** The four boxes, in reading order: A-top, A-bottom, B-top, B-bottom. */
export function courtZones(state: MatchState): CourtZone[] {
  const singles = state.config.matchType === "singles";

  return (["A", "B"] as const).flatMap((team) => {
    const right = rightRow(team);
    let topIdx: number | null;
    let bottomIdx: number | null;

    if (singles) {
      // Both players' courts are governed by the SERVER's score parity: the
      // server serves from the right when even, and the receiver stands
      // diagonally opposite, which carries the same left/right label. So each
      // half has exactly one occupied box and they switch together.
      const row = serviceCourt(state) === "right" ? right : other(right);
      topIdx = row === "top" ? 0 : null;
      bottomIdx = row === "bottom" ? 0 : null;
    } else {
      const pos = state.positions[team];
      topIdx = team === "A" ? pos.left : pos.right;
      bottomIdx = team === "A" ? pos.right : pos.left;
    }

    return (["top", "bottom"] as const).map<CourtZone>((row) => ({
      team,
      row,
      playerIdx: row === "top" ? topIdx : bottomIdx,
      isRightCourt: row === right,
    }));
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/courtZones.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Make `Court.tsx` use the helper**

In `src/components/Court.tsx`, delete the local `rightRow` function and the index maths inside `Half`, and drive the rendering from `courtZones`. Replace the whole `Half` function and the default export with:

```tsx
import { courtZones, type CourtZone } from "../lib/courtZones";

function Half({ state, team, zones }: { state: MatchState; team: TeamId; zones: CourtZone[] }) {
  const serving = state.servingTeam === team;
  const left = team === "A";
  const color = left ? C.red : C.blue;
  // Use the SERVING team's color for serve highlights so neither team has a visual advantage.
  const servingColor = state.servingTeam === "A" ? C.red : C.blue;

  // Server's occupied row (only the serving team draws a highlighted box).
  const serveRow = serving
    ? zones.find((z) => z.isRightCourt === (serviceCourt(state) === "right"))!.row
    : null;

  return (
    <View style={s.half}>
      {zones.map((zone) => {
        const isServer = serveRow === zone.row;
        return (
          <View
            key={zone.row}
            style={[
              s.box,
              zone.row === "top" && s.boxDivider,
              isServer && [
                s.boxServing,
                {
                  borderColor: servingColor,
                  backgroundColor: servingColor === C.red
                    ? "rgba(255,59,48,0.12)"
                    : "rgba(59,130,246,0.12)",
                },
              ],
            ]}
          >
            {isServer && <View style={[s.dot, { backgroundColor: servingColor, shadowColor: servingColor }]} />}
            {zone.playerIdx !== null && (
              <View style={s.player}>
                <Icon name="person" color={color} size={15} />
                <Text style={[s.name, { color }]} numberOfLines={1}>
                  {state.config.teams[team][zone.playerIdx].name}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function Court({ state }: { state: MatchState }) {
  const zones = courtZones(state);
  const half = (team: TeamId) => zones.filter((z) => z.team === team);
  return (
    <View style={s.court}>
      <Half state={state} team="A" zones={half("A")} />
      <NetDivider />
      <Half state={state} team="B" zones={half("B")} />
    </View>
  );
}
```

Keep the `LINE` constant and the `StyleSheet` block as they are. `serviceCourt` stays imported from `../engine`; the file no longer needs its own `rightRow`.

- [ ] **Step 6: Type-check and run the full suite**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/courtZones.ts tests/courtZones.test.ts src/components/Court.tsx
git commit -m "refactor(court): extract pure courtZones helper"
```

---

### Task 2: Remembered lineup storage

Persist the last used names and match settings locally, and resolve what the new-match screen should open with.

**Files:**
- Create: `src/lib/lastLineup.ts`
- Modify: `app/guest.tsx:21` (clear the lineup alongside the guest match ids)
- Test: `tests/lastLineup.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type LastLineup = {
    doubles: boolean;
    namesDoubles: string[]; // length 4
    namesSingles: string[]; // length 2
    points: 11 | 15 | 21;
    bestOf: 1 | 3 | 5;
    clubId: string | null;
  };
  export const EMPTY_LINEUP: LastLineup;
  export function saveLastLineup(lineup: LastLineup): Promise<void>;
  export function loadLastLineup(): Promise<LastLineup | null>;
  export function clearLastLineup(): Promise<void>;
  export function resolveInitialLineup(
    params: { clubId?: string; teamA?: string; teamB?: string },
    persisted: LastLineup | null,
    isGuest: boolean,
  ): LastLineup;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lastLineup.test.ts`. The `jest.mock` calls mirror `tests/guestMatches.test.ts`, which is the existing pattern for testing this storage shim under the node environment:

```ts
// node test env can't parse the real react-native package (Flow/ESM syntax);
// stub just enough for the Platform.OS check to take the native branch.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const store = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  deleteItemAsync: (key: string) => { store.delete(key); return Promise.resolve(); },
}));

import {
  EMPTY_LINEUP, LastLineup, clearLastLineup, loadLastLineup,
  resolveInitialLineup, saveLastLineup,
} from "../src/lib/lastLineup";

const lineup = (over: Partial<LastLineup> = {}): LastLineup => ({
  doubles: true,
  namesDoubles: ["Ana", "Bo", "Cy", "Dee"],
  namesSingles: ["Ana", "Bo"],
  points: 21,
  bestOf: 3,
  clubId: "club-1",
  ...over,
});

beforeEach(() => store.clear());

test("returns null when nothing has been saved", async () => {
  expect(await loadLastLineup()).toBeNull();
});

test("round-trips a saved lineup", async () => {
  await saveLastLineup(lineup());
  expect(await loadLastLineup()).toEqual(lineup());
});

test("clear removes the saved lineup", async () => {
  await saveLastLineup(lineup());
  await clearLastLineup();
  expect(await loadLastLineup()).toBeNull();
});

test("a corrupt stored value reads as null instead of throwing", async () => {
  store.set("last_lineup_v1", "{not json");
  expect(await loadLastLineup()).toBeNull();
});

test("a stored value of the wrong shape reads as null", async () => {
  store.set("last_lineup_v1", JSON.stringify({ doubles: true }));
  expect(await loadLastLineup()).toBeNull();
});

test("falls back to empty defaults with no params and nothing persisted", () => {
  expect(resolveInitialLineup({}, null, false)).toEqual(EMPTY_LINEUP);
});

test("uses the persisted lineup when there are no route params", () => {
  expect(resolveInitialLineup({}, lineup(), false)).toEqual(lineup());
});

test("guests never restore a persisted club", () => {
  expect(resolveInitialLineup({}, lineup(), true).clubId).toBeNull();
});

test("route params win over the persisted lineup", () => {
  const out = resolveInitialLineup(
    { teamA: "Kim,Lee", teamB: "Mia,Nia", clubId: "club-2" },
    lineup(),
    false,
  );
  expect(out.doubles).toBe(true);
  expect(out.namesDoubles).toEqual(["Kim", "Lee", "Mia", "Nia"]);
  expect(out.clubId).toBe("club-2");
});

test("two route names select singles and fill only the singles slots", () => {
  const out = resolveInitialLineup({ teamA: "Kim", teamB: "Lee" }, lineup(), false);
  expect(out.doubles).toBe(false);
  expect(out.namesSingles).toEqual(["Kim", "Lee"]);
  // the persisted doubles group is untouched, so toggling back restores it
  expect(out.namesDoubles).toEqual(["Ana", "Bo", "Cy", "Dee"]);
});

test("route names are trimmed and blanks dropped", () => {
  const out = resolveInitialLineup({ teamA: " Kim , ", teamB: "Lee" }, null, false);
  expect(out.doubles).toBe(false);
  expect(out.namesSingles).toEqual(["Kim", "Lee"]);
});

test("points and games come from the persisted lineup when params are present", () => {
  const out = resolveInitialLineup({ teamA: "Kim", teamB: "Lee" }, lineup({ points: 15, bestOf: 1 }), false);
  expect(out.points).toBe(15);
  expect(out.bestOf).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/lastLineup.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/lastLineup'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/lastLineup.ts`:

```ts
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "last_lineup_v1";

/**
 * The player names and match settings used for the most recent match, so the
 * same group can start again with one or two edits. Singles and doubles names
 * are kept apart, so toggling the format restores the right group.
 */
export type LastLineup = {
  doubles: boolean;
  /** Length 4: team A players 1-2, then team B players 1-2. */
  namesDoubles: string[];
  /** Length 2: player A, then player B. */
  namesSingles: string[];
  points: 11 | 15 | 21;
  bestOf: 1 | 3 | 5;
  clubId: string | null;
};

export const EMPTY_LINEUP: LastLineup = {
  doubles: true,
  namesDoubles: ["", "", "", ""],
  namesSingles: ["", ""],
  points: 21,
  bestOf: 3,
  clubId: null,
};

// expo-secure-store has no native module on web, and the web build runs every
// visitor as a guest, so mirror the fallback used by guestMatches.ts. Player
// names are not secrets, but they are device-local either way.
const store = {
  async get(key: string): Promise<string | null> {
    return Platform.OS === "web" ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

function isLineup(x: unknown): x is LastLineup {
  const l = x as LastLineup | null;
  return (
    !!l &&
    typeof l.doubles === "boolean" &&
    Array.isArray(l.namesDoubles) && l.namesDoubles.length === 4 &&
    Array.isArray(l.namesSingles) && l.namesSingles.length === 2 &&
    [11, 15, 21].includes(l.points) &&
    [1, 3, 5].includes(l.bestOf) &&
    (l.clubId === null || typeof l.clubId === "string")
  );
}

/** Remember this lineup for the next match. Never throws — storage is best effort. */
export async function saveLastLineup(lineup: LastLineup): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(lineup));
  } catch {
    // A storage failure must never block starting a match.
  }
}

/** The lineup from the last match, or null when absent or unreadable. */
export async function loadLastLineup(): Promise<LastLineup | null> {
  try {
    const raw = await store.get(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLineup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Called when leaving guest mode so names don't leak across accounts on a shared device. */
export async function clearLastLineup(): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    // Nothing useful to do; the next read simply returns whatever is there.
  }
}

const namesFromParams = (params: { teamA?: string; teamB?: string }): string[] =>
  [...(params.teamA?.split(",") ?? []), ...(params.teamB?.split(",") ?? [])]
    .map((name) => name.trim())
    .filter(Boolean);

/**
 * What the new-match screen opens with. Route params (a session or tournament
 * deep link) win outright, then the persisted lineup, then empty defaults.
 * Guests never restore a club, because they cannot save a match to one.
 */
export function resolveInitialLineup(
  params: { clubId?: string; teamA?: string; teamB?: string },
  persisted: LastLineup | null,
  isGuest: boolean,
): LastLineup {
  const base = persisted ?? EMPTY_LINEUP;
  const fromParams = namesFromParams(params);
  const pad = (names: string[], size: number) =>
    Array.from({ length: size }, (_, i) => names[i] ?? "");

  const doubles = fromParams.length ? fromParams.length > 2 : base.doubles;

  return {
    doubles,
    namesDoubles:
      fromParams.length && doubles ? pad(fromParams, 4) : pad(base.namesDoubles, 4),
    namesSingles:
      fromParams.length && !doubles ? pad(fromParams, 2) : pad(base.namesSingles, 2),
    points: base.points,
    bestOf: base.bestOf,
    clubId: isGuest ? null : params.clubId ?? base.clubId,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest tests/lastLineup.test.ts
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Clear the lineup when leaving guest mode**

In `app/guest.tsx`, add the import next to the existing one and the call next to `clearGuestMatchIds()` inside `signIn`:

```tsx
import { clearGuestMatchIds } from "../src/lib/guestMatches";
import { clearLastLineup } from "../src/lib/lastLineup";
```

```tsx
    await clearGuestMatchIds();
    await clearLastLineup();
    await supabase?.auth.signOut();
```

- [ ] **Step 6: Type-check and run the full suite**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lastLineup.ts tests/lastLineup.test.ts app/guest.tsx
git commit -m "feat(new-match): remember the last lineup locally"
```

---

### Task 3: Interactive court box

A single service box that can display a name, become an inline text field, show the serve dot, and flash when the user picks an invalid serve zone. No unit test — Jest cannot render React Native here — so verification is `npx tsc --noEmit` plus the manual pass in Task 6.

**Files:**
- Create: `src/components/CourtBox.tsx`

**Interfaces:**
- Consumes: `CourtZone` from `src/lib/courtZones` (Task 1).
- Produces:
  ```ts
  export type CourtBoxEdit = {
    value: string;
    placeholder: string;
    editing: boolean;
    onNamePress: () => void;
    onChangeText: (text: string) => void;
    /** Enter/next: commit and move to the following slot. */
    onSubmit: () => void;
    /** Focus lost: stop editing this box if it is still the active one. */
    onEndEdit: () => void;
    onZonePress: () => void;
    /** Increments each time a serve pick is rejected and this box is the valid one. */
    pulseKey: number;
  };
  export default function CourtBox(props: {
    zone: CourtZone;
    name: string | null;
    color: string;
    isServer: boolean;
    servingColor: string;
    showDivider: boolean;
    edit?: CourtBoxEdit;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the component**

Create `src/components/CourtBox.tsx`:

```tsx
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { CourtZone } from "../lib/courtZones";
import Icon from "./Icon";
import { C } from "../theme";

const LINE = "rgba(255,255,255,0.45)";

/** Everything the new-match screen needs to make a box editable. Omit to render read-only. */
export type CourtBoxEdit = {
  value: string;
  placeholder: string;
  editing: boolean;
  onNamePress: () => void;
  onChangeText: (text: string) => void;
  /** Enter/next: commit and move to the following slot. */
  onSubmit: () => void;
  /** Focus lost: stop editing this box if it is still the active one. */
  onEndEdit: () => void;
  onZonePress: () => void;
  /** Increments each time a serve pick is rejected and this box is the valid one. */
  pulseKey: number;
};

/**
 * One service box. Read-only by default (score and watch screens); with `edit`
 * supplied the name becomes tappable, the box can host an inline field, and a
 * rejected serve pick flashes an outline here.
 */
export default function CourtBox({
  zone, name, color, isServer, servingColor, showDivider, edit,
}: {
  zone: CourtZone;
  name: string | null;
  color: string;
  isServer: boolean;
  servingColor: string;
  showDivider: boolean;
  edit?: CourtBoxEdit;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseKey = edit?.pulseKey ?? 0;

  useEffect(() => {
    if (!pulseKey) return;
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [pulseKey, pulse]);

  const usesPlaceholder = !!edit && !edit.value.trim();
  const label = edit ? edit.value.trim() || edit.placeholder : name;

  return (
    <Pressable
      style={[
        s.box,
        showDivider && s.boxDivider,
        isServer && [
          s.boxServing,
          {
            borderColor: servingColor,
            backgroundColor: servingColor === C.red
              ? "rgba(255,59,48,0.12)"
              : "rgba(59,130,246,0.12)",
          },
        ],
      ]}
      onPress={edit?.onZonePress}
      disabled={!edit}
    >
      {isServer && <View style={[s.dot, { backgroundColor: servingColor, shadowColor: servingColor }]} />}

      <Animated.View pointerEvents="none" style={[s.pulse, { opacity: pulse }]} />

      {edit?.editing ? (
        <TextInput
          autoFocus
          selectTextOnFocus
          style={[s.input, { color }]}
          value={edit.value}
          placeholder={edit.placeholder}
          placeholderTextColor={C.text2}
          onChangeText={edit.onChangeText}
          onSubmitEditing={edit.onSubmit}
          onBlur={edit.onEndEdit}
          returnKeyType="next"
          autoCapitalize="words"
          autoCorrect={false}
        />
      ) : zone.playerIdx !== null && label !== null ? (
        <Pressable style={s.player} onPress={edit?.onNamePress} disabled={!edit} hitSlop={8}>
          <Icon name="person" color={color} size={15} />
          <Text
            style={[s.name, { color: usesPlaceholder ? C.text2 : color }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center" },
  boxDivider: { borderBottomWidth: 1, borderColor: LINE },
  boxServing: {
    borderWidth: 1.5,
    // borderColor and backgroundColor are overridden dynamically per serving team
  },
  dot: {
    position: "absolute", top: 10, right: 10,
    width: 14, height: 14, borderRadius: 7,
    shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
  },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2.5,
    borderColor: C.text,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  player: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6 },
  name: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  input: {
    alignSelf: "stretch", marginHorizontal: 10, paddingVertical: 4,
    fontSize: 16, fontWeight: "700", textAlign: "center",
    borderBottomWidth: 1, borderColor: LINE,
  },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CourtBox.tsx
git commit -m "feat(court): editable service box component"
```

---

### Task 4: Court composes editable boxes and in-court swap buttons

Rewire `Court.tsx` to render `CourtBox` and, when an `edit` prop is supplied, the `⇄` button on the net and a `⇅` button on each half's mid-line. Every consumer that passes only `state` keeps today's appearance.

**Files:**
- Modify: `src/components/Court.tsx` (full rewrite of the component body; styles trimmed to what remains here)

**Interfaces:**
- Consumes: `courtZones`, `CourtZone` (Task 1); `CourtBox`, `CourtBoxEdit` (Task 3).
- Produces:
  ```ts
  export type CourtEdit = {
    /** Per-box interaction bundle; called once per zone on every render. */
    zoneEdit: (zone: CourtZone) => CourtBoxEdit;
    onSwapSides: () => void;
    /** Doubles only — omit the per-team buttons by passing showTeamSwap: false. */
    onSwapTeam: (team: TeamId) => void;
    showTeamSwap: boolean;
  };
  export default function Court(props: { state: MatchState; edit?: CourtEdit }): JSX.Element;
  ```

- [ ] **Step 1: Rewrite the component**

Replace the contents of `src/components/Court.tsx` with:

```tsx
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { MatchState, TeamId } from "../engine";
import { serviceCourt } from "../engine";
import { courtZones, type CourtZone } from "../lib/courtZones";
import CourtBox, { type CourtBoxEdit } from "./CourtBox";
import Icon from "./Icon";
import NetDivider from "./NetDivider";
import { C } from "../theme";

/**
 * Horizontal court: team A occupies the left half, team B the right, with a
 * vertical net divider. Each half is always two stacked service boxes (right +
 * left court) so the layout reads like a real court in both singles and doubles.
 *
 * Orientation: the left team faces right, so their right service court is the
 * BOTTOM box; the right team faces left, so their right court is the TOP box.
 * That rule lives in src/lib/courtZones.ts.
 *
 * Read-only by default. The new-match screen passes `edit` to turn the court
 * into the setup surface: names edit in place, tapping a box picks the first
 * server, and the swap buttons sit on the court's own dividers.
 */
const LINE = "rgba(255,255,255,0.45)";

export type CourtEdit = {
  /** Per-box interaction bundle; called once per zone on every render. */
  zoneEdit: (zone: CourtZone) => CourtBoxEdit;
  onSwapSides: () => void;
  onSwapTeam: (team: TeamId) => void;
  /** False in singles, where a team has only one player. */
  showTeamSwap: boolean;
};

function Half({
  state, team, zones, edit,
}: {
  state: MatchState;
  team: TeamId;
  zones: CourtZone[];
  edit?: CourtEdit;
}) {
  const serving = state.servingTeam === team;
  const color = team === "A" ? C.red : C.blue;
  // Use the SERVING team's color for serve highlights so neither team has a visual advantage.
  const servingColor = state.servingTeam === "A" ? C.red : C.blue;

  // Server's occupied row (only the serving team draws a highlighted box).
  const serveRow = serving
    ? zones.find((z) => z.isRightCourt === (serviceCourt(state) === "right"))!.row
    : null;

  return (
    <View style={s.half}>
      {zones.map((zone) => (
        <CourtBox
          key={zone.row}
          zone={zone}
          name={zone.playerIdx !== null ? state.config.teams[team][zone.playerIdx].name : null}
          color={color}
          isServer={serveRow === zone.row}
          servingColor={servingColor}
          showDivider={zone.row === "top"}
          edit={edit?.zoneEdit(zone)}
        />
      ))}

      {edit?.showTeamSwap && (
        <Pressable
          style={s.teamSwap}
          onPress={() => edit.onSwapTeam(team)}
          hitSlop={8}
          accessibilityLabel={`Swap team ${team} players`}
        >
          <Icon name="swap-vertical" color={C.text} size={16} />
        </Pressable>
      )}
    </View>
  );
}

export default function Court({ state, edit }: { state: MatchState; edit?: CourtEdit }) {
  const zones = courtZones(state);
  const half = (team: TeamId) => zones.filter((z) => z.team === team);

  return (
    <View style={s.court}>
      <Half state={state} team="A" zones={half("A")} edit={edit} />
      <View style={s.net}>
        <NetDivider />
        {edit && (
          <Pressable
            style={s.sideSwap}
            onPress={edit.onSwapSides}
            hitSlop={8}
            accessibilityLabel="Swap sides"
          >
            <Icon name="swap-horizontal" color={C.text} size={18} />
          </Pressable>
        )}
      </View>
      <Half state={state} team="B" zones={half("B")} edit={edit} />
    </View>
  );
}

const s = StyleSheet.create({
  court: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#20262B",
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 10,
    overflow: "hidden",
  },
  half: { flex: 1 },
  net: { justifyContent: "center", zIndex: 2 },
  sideSwap: {
    position: "absolute", alignSelf: "center",
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(20,24,28,0.92)",
    borderWidth: 1, borderColor: LINE,
  },
  teamSwap: {
    position: "absolute", top: "50%", marginTop: -16, alignSelf: "center",
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(20,24,28,0.92)",
    borderWidth: 1, borderColor: LINE,
    zIndex: 2,
  },
});
```

The `dot`, `player`, `name`, `box`, `boxDivider`, and `boxServing` styles have moved into `CourtBox.tsx` and must not be duplicated here.

- [ ] **Step 2: Type-check and run the full suite**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors, all tests pass — `courtZones` is unchanged, and the read-only consumers only pass `state`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Court.tsx
git commit -m "feat(court): optional in-court editing and swap buttons"
```

---

### Task 5: Club picker

A compact button plus a selection sheet, replacing the bottom "Save to club" chip row. The no-club option is labelled **Personal**, never "None".

**Files:**
- Create: `src/components/ClubPicker.tsx`
- Modify: `src/components/Icon.tsx` (add `"chevron-down"` to `IconName`)

**Interfaces:**
- Consumes: `Club` from `src/repos/clubRepo`.
- Produces:
  ```ts
  export default function ClubPicker(props: {
    clubs: Club[];
    clubId: string | null;
    onChange: (clubId: string | null) => void;
  }): JSX.Element | null; // null when there are no clubs
  ```

- [ ] **Step 1: Add the icon name**

In `src/components/Icon.tsx`, extend the Ionicons part of the `IconName` union. `chevron-down` is an Ionicon, so it must **not** be added to the `MCI` set:

```ts
  | "chevron-forward" | "chevron-back" | "chevron-down" | "add" | "close"
```

- [ ] **Step 2: Write the component**

Create `src/components/ClubPicker.tsx`:

```tsx
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Club } from "../repos/clubRepo";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import { C } from "../theme";

/**
 * Where a finished match gets saved. "Personal" means no club — the old label
 * for this was "None", which read like the name of a club.
 */
export default function ClubPicker({
  clubs, clubId, onChange,
}: {
  clubs: Club[];
  clubId: string | null;
  onChange: (clubId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (clubs.length === 0) return null;

  const current = clubs.find((c) => c.id === clubId);
  const pick = (id: string | null) => { onChange(id); setOpen(false); };

  return (
    <>
      <PressableScale style={s.button} onPress={() => setOpen(true)} scaleTo={0.96}>
        <Icon name={current ? "account-group" : "person-outline"} color={C.text2} size={16} />
        <Text style={s.buttonText} numberOfLines={1}>{current?.name ?? "Personal"}</Text>
        <Icon name="chevron-down" color={C.text2} size={14} />
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.title}>Save this match to</Text>

            <Pressable style={[s.row, clubId === null && s.rowOn]} onPress={() => pick(null)}>
              <Icon name="person-outline" color={C.text} size={18} />
              <View style={s.rowText}>
                <Text style={s.rowTitle}>Personal</Text>
                <Text style={s.rowHint}>Not saved to a club</Text>
              </View>
              {clubId === null && <Icon name="checkmark-circle" color={C.red} size={18} />}
            </Pressable>

            {clubs.map((c) => (
              <Pressable
                key={c.id}
                style={[s.row, clubId === c.id && s.rowOn]}
                onPress={() => pick(c.id)}
              >
                <Icon name="account-group" color={C.text} size={18} />
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text>
                </View>
                {clubId === c.id && <Icon name="checkmark-circle" color={C.red} size={18} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  button: {
    flexDirection: "row", alignItems: "center", gap: 6,
    maxWidth: 170, minHeight: 44, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.line,
  },
  buttonText: { color: C.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 16, gap: 8,
  },
  title: { color: C.text2, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    minHeight: 52, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: C.bg,
  },
  rowOn: { borderWidth: 1, borderColor: C.red },
  rowText: { flex: 1 },
  rowTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  rowHint: { color: C.text2, fontSize: 12 },
});
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. `Club` is an exported interface in `src/repos/clubRepo.ts:6` (`id`, `name`, `invite_code`, `role`, `personal`).

- [ ] **Step 4: Commit**

```bash
git add src/components/ClubPicker.tsx src/components/Icon.tsx
git commit -m "feat(new-match): compact club picker with a Personal option"
```

---

### Task 6: Rebuild the new-match screen

Wire everything together into a single page: one top row, a flexible court, one format row, one hint, one CTA.

**Files:**
- Modify: `app/new-match.tsx` (full rewrite)

**Interfaces:**
- Consumes: `courtZones`, `rightRow`, `CourtZone` (Task 1); `LastLineup`, `loadLastLineup`, `saveLastLineup`, `resolveInitialLineup` (Task 2); `CourtBoxEdit` (Task 3); `CourtEdit` (Task 4); `ClubPicker` (Task 5).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite the screen**

Replace the contents of `app/new-match.tsx` with:

```tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { defaultConfig, GAME_FORMATS, MatchConfig, replay } from "../src/engine";
import { createMatch } from "../src/repos/matchRepo";
import { Club, listRealClubs, listPlayers, ClubPlayer } from "../src/repos/clubRepo";
import Court, { type CourtEdit } from "../src/components/Court";
import type { CourtBoxEdit } from "../src/components/CourtBox";
import ClubPicker from "../src/components/ClubPicker";
import PressableScale from "../src/components/PressableScale";
import BusyButton from "../src/components/BusyButton";
import { courtZones, rightRow, type CourtRow, type CourtZone } from "../src/lib/courtZones";
import { loadLastLineup, resolveInitialLineup, saveLastLineup } from "../src/lib/lastLineup";
import { toast } from "../src/lib/toast";
import { useSession } from "../src/stores/session";
import { recordGuestMatch } from "../src/lib/guestMatches";
import { C } from "../src/theme";

type ZoneKey = { team: "A" | "B"; row: CourtRow };
const sameZone = (a: ZoneKey | null, b: ZoneKey) => !!a && a.team === b.team && a.row === b.row;

const DOUBLES_LABELS = ["Player 1", "Player 2", "Player 3", "Player 4"];
const SINGLES_LABELS = ["Player A", "Player B"];

export default function NewMatch() {
  const router = useRouter();
  const { session } = useSession();
  const isGuest = !!session?.user.is_anonymous;
  const params = useLocalSearchParams<{ clubId?: string; sessionId?: string; teamA?: string; teamB?: string }>();

  const [doubles, setDoubles] = useState(true);
  const [namesDoubles, setNamesDoubles] = useState<string[]>(["", "", "", ""]);
  const [namesSingles, setNamesSingles] = useState<string[]>(["", ""]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [points, setPoints] = useState<11 | 15 | 21>(21);
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [firstServerIdx, setFirstServerIdx] = useState(0); // index into the active names array
  const [editing, setEditing] = useState<ZoneKey | null>(null);
  const [pulse, setPulse] = useState<{ zone: ZoneKey; key: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const pulseSeq = useRef(0);

  const names = doubles ? namesDoubles : namesSingles;
  const setNames = doubles ? setNamesDoubles : setNamesSingles;
  const labels = doubles ? DOUBLES_LABELS : SINGLES_LABELS;
  const filled = names.every((n) => n.trim());

  // Restore the previous lineup once on mount. Route params (a session or
  // tournament deep link) win over anything remembered.
  useEffect(() => {
    let cancelled = false;
    loadLastLineup().then((persisted) => {
      if (cancelled) return;
      const init = resolveInitialLineup(params, persisted, isGuest);
      setDoubles(init.doubles);
      setNamesDoubles(init.namesDoubles);
      setNamesSingles(init.namesSingles);
      setPoints(init.points);
      setBestOf(init.bestOf);
      setClubId(init.clubId);
    });
    return () => { cancelled = true; };
    // Mount only: later param changes would fight the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Guests never save to a club — skip the fetch so a stale local clubs_cache
    // from a previous signed-in account on this device can't leak through.
    if (isGuest) return;
    listRealClubs().then((cs) => {
      setClubs(cs);
      if (cs.length === 1) setClubId((prev) => prev ?? cs[0].id);
    });
  }, [isGuest]);

  // Roster for the selected club: powers the suggestion strip and fills any
  // name slot still empty.
  useEffect(() => {
    if (!clubId) { setRoster([]); return; }
    listPlayers(clubId).then((players) => {
      setRoster(players);
      setNames((prev) => prev.map((n, i) => (n.trim() ? n : players[i]?.name ?? "")));
    });
    // setNames is derived from `doubles`; the roster prefill only ever targets
    // the arrangement visible when the club was chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const buildConfig = (): MatchConfig => {
    const n = names.map((x, i) => x.trim() || labels[i]);
    const teams = doubles
      ? { A: [{ id: "a0", name: n[0] }, { id: "a1", name: n[1] }], B: [{ id: "b0", name: n[2] }, { id: "b1", name: n[3] }] }
      : { A: [{ id: "a0", name: n[0] }], B: [{ id: "b0", name: n[1] }] };
    const serverTeam = firstServerIdx < names.length / 2 ? "A" : "B";
    const serverPlayer = doubles ? firstServerIdx % 2 : 0;
    return defaultConfig({
      matchType: doubles ? "doubles" : "singles",
      teams,
      pointsToWin: points,
      cap: GAME_FORMATS[points].maxScore, // 11->15, 15->20, 21->30
      intervalAt: points === 21 ? 11 : 0,
      bestOf,
      firstServer: { team: serverTeam, playerIndex: serverPlayer },
    });
  };

  // Live preview of the starting arrangement (score 0–0). It is also the input
  // surface: every zone/name interaction below is resolved against this state.
  const preview = useMemo(() => {
    try {
      return replay([{ type: "MATCH_STARTED", config: buildConfig(), at: 0 }]);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesDoubles, namesSingles, doubles, points, bestOf, firstServerIdx]);

  /** Slot in the active names array for the player standing in a zone. */
  const nameIndexOf = (zone: CourtZone): number | null => {
    if (zone.playerIdx === null) return null;
    return doubles ? (zone.team === "A" ? 0 : 2) + zone.playerIdx : zone.team === "A" ? 0 : 1;
  };

  const setNameAt = (index: number, text: string) =>
    setNames((prev) => prev.map((n, i) => (i === index ? text : n)));

  /** Swap left/right halves (team A ↔ team B). */
  const swapSides = () => {
    if (doubles) {
      setNamesDoubles((p) => [p[2], p[3], p[0], p[1]]);
      setFirstServerIdx((i) => (i + 2) % 4);
    } else {
      setNamesSingles((p) => [p[1], p[0]]);
      setFirstServerIdx((i) => (i === 0 ? 1 : 0));
    }
    setEditing(null);
  };

  /**
   * Swap the two players within a team (top ↔ bottom court). We swap the name
   * slots but keep firstServerIdx pointing at the same slot: for the serving
   * team the right-court player is the first server, so this correctly moves
   * the other player into the right court (and into the serving role).
   */
  const swapTeam = (team: "A" | "B") => {
    const [x, y] = team === "A" ? [0, 1] : [2, 3];
    setNamesDoubles((p) => p.map((n, i) => (i === x ? p[y] : i === y ? p[x] : n)));
    setEditing(null);
  };

  const rejectServe = (team: "A" | "B") => {
    pulseSeq.current += 1;
    setPulse({ zone: { team, row: rightRow(team) }, key: pulseSeq.current });
    toast("Service must start from the right service court.", "error");
  };

  const pickServer = (zone: CourtZone) => {
    const index = nameIndexOf(zone);
    if (!zone.isRightCourt || index === null) {
      rejectServe(zone.team);
      return;
    }
    setEditing(null);
    setFirstServerIdx(index);
  };

  /** Move editing to the next occupied slot, or stop when this was the last. */
  const editNext = (zone: CourtZone) => {
    const index = nameIndexOf(zone);
    if (index === null || !preview) { setEditing(null); return; }
    const next = courtZones(preview).find((z) => nameIndexOf(z) === index + 1);
    setEditing(next ? { team: next.team, row: next.row } : null);
  };

  const zoneEdit = (zone: CourtZone): CourtBoxEdit => {
    const index = nameIndexOf(zone);
    const key: ZoneKey = { team: zone.team, row: zone.row };
    return {
      value: index === null ? "" : names[index],
      placeholder: index === null ? "" : labels[index],
      editing: sameZone(editing, key),
      onNamePress: () => index !== null && setEditing(key),
      onChangeText: (text) => index !== null && setNameAt(index, text),
      onSubmit: () => editNext(zone),
      // Only clear if this box is still the active one: onSubmitEditing runs
      // first and may already have moved editing to the next slot.
      onEndEdit: () => setEditing((e) => (sameZone(e, key) ? null : e)),
      onZonePress: () => pickServer(zone),
      pulseKey: pulse && sameZone(pulse.zone, key) ? pulse.key : 0,
    };
  };

  const edit: CourtEdit = {
    zoneEdit,
    onSwapSides: swapSides,
    onSwapTeam: swapTeam,
    showTeamSwap: doubles,
  };

  const suggestions = useMemo(() => {
    if (!editing || !preview || roster.length === 0) return [];
    const zone = courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }));
    const index = zone ? nameIndexOf(zone) : null;
    const typed = index === null ? "" : names[index].trim().toLowerCase();
    const taken = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
    return roster
      .filter((p) => !typed || p.name.toLowerCase().includes(typed))
      .filter((p) => !taken.has(p.name.toLowerCase()) || p.name.toLowerCase() === typed)
      .slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, preview, roster, namesDoubles, namesSingles, doubles]);

  const applySuggestion = (name: string) => {
    if (!editing || !preview) return;
    const zone = courtZones(preview).find((z) => sameZone(editing, { team: z.team, row: z.row }));
    const index = zone ? nameIndexOf(zone) : null;
    if (index === null || !zone) return;
    setNameAt(index, name);
    editNext(zone);
  };

  const toggleFormat = (next: boolean) => {
    setDoubles(next);
    setFirstServerIdx(0);
    setEditing(null);
  };

  const start = async () => {
    setStarting(true);
    try {
      const config = buildConfig();
      const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
      const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
      await saveLastLineup({ doubles, namesDoubles, namesSingles, points, bestOf, clubId });
      if (isGuest) await recordGuestMatch(id);
      router.replace(`/score/${id}`);
    } catch (e) {
      toast((e as Error).message || "Could not start the match", "error");
      setStarting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={s.topRow}>
        <View style={s.seg}>
          {[true, false].map((d) => (
            <PressableScale
              key={String(d)}
              style={[s.segBtn, doubles === d && s.segOn]}
              onPress={() => toggleFormat(d)}
              scaleTo={0.96}
            >
              <Text style={[s.segText, doubles === d && s.segTextOn]}>{d ? "Doubles" : "Singles"}</Text>
            </PressableScale>
          ))}
        </View>
        {!isGuest && <ClubPicker clubs={clubs} clubId={clubId} onChange={setClubId} />}
      </View>

      <View style={s.courtWrap}>{preview && <Court state={preview} edit={edit} />}</View>

      {/* One row, swapped for roster suggestions while a name is being edited,
          so the page height never changes. */}
      <View style={s.swapRow}>
        {editing && suggestions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.chipRow}>
              {suggestions.map((p) => (
                <Pressable key={p.id} style={s.chip} onPress={() => applySuggestion(p.name)}>
                  <Text style={s.chipText} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={s.formatRow}>
            <View style={s.formatGroup}>
              <Text style={s.caption}>Points</Text>
              <View style={s.seg}>
                {([11, 15, 21] as const).map((p) => (
                  <Pressable key={p} style={[s.segBtn, points === p && s.segOn]} onPress={() => setPoints(p)}>
                    <Text style={[s.segText, points === p && s.segTextOn]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={s.formatGroup}>
              <Text style={s.caption}>Games</Text>
              <View style={s.seg}>
                {([[1, 1], [2, 3], [3, 5]] as const).map(([win, bo]) => (
                  <Pressable key={bo} style={[s.segBtn, bestOf === bo && s.segOn]} onPress={() => setBestOf(bo)}>
                    <Text style={[s.segText, bestOf === bo && s.segTextOn]}>{win}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>

      <Text style={s.hint}>
        First to {Math.floor(bestOf / 2) + 1} {bestOf === 1 ? "game" : "games"} · best of {bestOf} ·
        tap a right-hand court to set the first serve
      </Text>

      <BusyButton busy={starting} disabled={!filled} style={[s.cta, !filled && { opacity: 0.5 }]} onPress={start}>
        <Text style={s.ctaText}>Start scoring</Text>
      </BusyButton>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  topRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  seg: { flexDirection: "row", backgroundColor: C.card, borderRadius: 12, padding: 4, gap: 4, flex: 1 },
  segBtn: { flex: 1, borderRadius: 9, minHeight: 40, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.red },
  segText: { color: C.text2, fontSize: 15, fontWeight: "600" },
  segTextOn: { color: C.text },
  courtWrap: { flex: 1, minHeight: 200 },
  swapRow: { minHeight: 62, justifyContent: "center" },
  formatRow: { flexDirection: "row", gap: 12 },
  formatGroup: { flex: 1, gap: 2 },
  caption: { color: C.text2, fontSize: 12, fontWeight: "700" },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: {
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 14,
    minHeight: 40, justifyContent: "center",
    borderWidth: 1, borderColor: C.line, maxWidth: 160,
  },
  chipText: { color: C.text, fontSize: 14, fontWeight: "600" },
  hint: { color: C.text2, fontSize: 12 },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontSize: 18, fontWeight: "800" },
});
```

`ClubPlayer` is an exported interface in `src/repos/clubRepo.ts:14` (`id`, `club_id`, `profile_id`, `name`), and `listPlayers(clubId)` returns `Promise<ClubPlayer[]>`.

- [ ] **Step 2: Type-check and run the full suite**

```bash
npx tsc --noEmit && npm test
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Manual verification**

Start the app (`npm start`, then open on a device or emulator) and walk the checklist:

1. Open New Match on a small phone. The whole screen fits with **no scrolling**, in both Doubles and Singles.
2. Tap each player name — the box becomes a text field, typing updates the court immediately, and the return key moves to the next player.
3. Doubles: tap team A's **bottom** box background → the serve dot moves there. Tap team A's **top** box → toast "Service must start from the right service court." and the bottom box flashes. Repeat for team B (top valid, bottom rejected).
4. Singles: tapping either empty box shows the same toast and flashes the occupied box.
5. Tap `⇄` on the net — the two halves swap, names and serve follow. Tap `⇅` on a half — that team's two players swap and the right-court player becomes the server.
6. With a club selected, tapping a name shows roster chips under the court; tapping a chip fills the slot and advances. Typing a name not on the roster is accepted.
7. The club button reads **Personal** by default; the word "None" appears nowhere.
8. Start a match, finish or abandon it, then open New Match again — the same names, format, points, games, and club come back.
9. In guest mode there is no club button at all.

- [ ] **Step 4: Commit**

```bash
git add app/new-match.tsx
git commit -m "feat(new-match): one-page court-first match setup"
```

---

## Self-Review Notes

Spec coverage check, section by section:

| Spec section | Task |
| --- | --- |
| Target layout, one page | 6 |
| Zone model / `courtZones` | 1 |
| Tap name → inline edit | 3, 6 |
| Tap zone → first serve + right-court rule | 1 (rule), 3 (pulse), 6 (toast + wiring) |
| Swap controls in court | 4, 6 |
| Club picker, "Personal" label | 5, 6 |
| Roster suggestions, free text still allowed | 6 |
| Remembered lineup + precedence | 2, 6 |
| Clear on leaving guest mode | 2 |
| States and failure modes | 2 (storage), 5 (no clubs), 6 (empty names, roster fetch) |
| Verification | 1, 2 (unit), 6 (manual) |

Deviation from the spec, deliberate: `courtZones` lives in `src/lib/` rather than being exported from `Court.tsx`, because the Jest `node` environment cannot import a file that pulls in React Native. The spec has been updated to match.
