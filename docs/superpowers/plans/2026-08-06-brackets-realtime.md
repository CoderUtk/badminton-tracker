# Brackets Screen Realtime Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bracket cells (in-app tournament screen and the public spectator link) show court assignment, near-live current-game score for in-progress matches, and final per-game score for finished matches — refreshed every 15s plus an on-demand manual refresh button.

**Architecture:** A new 15s timer in `matchStore` periodically writes the scoring device's current score into the local `matches.score_summary` column and pushes it via the existing sync pipeline (no new network primitives). The in-app bracket screen and the public spectator RPC both poll on the same 15s cadence and feed an enhanced `BracketView` component that renders court/score per cell. All three surfaces (matchStore tick, in-app poll, spectator poll) are plain polling — no push/realtime channels (see spec's Non-Goals).

**Tech Stack:** Expo/React Native, Zustand (`matchStore`), Supabase (Postgres + RLS + a security-definer RPC), expo-sqlite (local cache), Jest/ts-jest (node test env — this project only unit-tests pure logic, not RN components; see `jest.config.js`).

## Global Constraints

- Poll/tick interval is 15 seconds everywhere (matchStore live tick, in-app bracket poll, spectator poll) — per user's explicit choice to favor fewer network calls over sub-15s freshness.
- No push/realtime channels for this feature (spec Non-Goals) — plain polling only.
- `bracket_matches.court` and `BracketMatch.court` already exist (Task 5 of the earlier tournament-ops plan) — this plan only renders it, never writes it.
- This codebase has no RN component test harness (`jest.config.js`: `testEnvironment: "node"`, comment "Tests cover the pure engine only; UI is exercised in the app"). UI-only changes are verified via `npx tsc --noEmit` and the manual walkthrough in the final task, not new component tests. Pure, RN-independent logic extracted for a screen still gets a unit test.

---

### Task 1: `matchRepo.updateLiveScore` + widen `score_summary` type

**Files:**
- Modify: `src/repos/matchRepo.ts`

**Interfaces:**
- Produces: `updateLiveScore(matchId: string, state: MatchState): Promise<void>` — writes a live snapshot to the local `matches` row (`score_summary` gains an optional `current` field) and marks it unsynced. Does **not** touch `status` or `winner`.
- Produces: widened `MatchRecord["score_summary"]` type: `{ games: { A: number; B: number }[]; current?: { A: number; B: number } } | null`.

No isolated unit test for this step: this codebase has no mocked-SQLite test harness for `matchRepo` (its sibling functions `finalizeMatch`/`endMatchEarly` also have none — verified via `npx tsc --noEmit` and exercised indirectly through Task 2's mocked-`matchRepo` tests and the Task 9 manual walkthrough).

- [ ] **Step 1: Widen the `score_summary` type**

In `src/repos/matchRepo.ts`, change line 20:

```ts
  score_summary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
```

- [ ] **Step 2: Add `updateLiveScore`**

Add this function after `finalizeMatch` (after line 84):

```ts
/**
 * Periodic live-score snapshot written while a match is in progress — not a
 * status change. Called every ~15s by matchStore's live tick so other
 * devices' next sync sees the current score without waiting for the match
 * to finish. The `status = 'live'` guard makes a stray tick that races a
 * just-finished match's finalizeMatch() a silent no-op instead of
 * resurrecting score_summary after completion.
 */
export async function updateLiveScore(matchId: string, state: MatchState) {
  const db = await getDb();
  const summary = {
    games: state.gameHistory.map((g) => g.score),
    current: { A: state.score.A, B: state.score.B },
  };
  await db?.runAsync(
    "update matches set score_summary = ?, synced = 0 where id = ? and status = 'live'",
    JSON.stringify(summary), matchId
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/repos/matchRepo.ts
git commit -m "feat(matchRepo): add updateLiveScore for periodic live-score sync"
```

---

### Task 2: `matchStore` 15s live-score tick

**Files:**
- Modify: `src/stores/matchStore.ts`
- Test: `tests/matchStore.liveTick.test.ts` (new)

**Interfaces:**
- Consumes: `repo.updateLiveScore(matchId, state)` from Task 1.
- Produces: no new public API — `useMatchStore` behavior only. A live match now ticks `updateLiveScore` + `syncNow()` every 15s starting from `open()` (if resuming a live match) or the first `dispatch()` that leaves the match in progress; the timer stops on `close()`, `endEarly()`, or reaching `match_over`.

- [ ] **Step 1: Write the failing test**

Create `tests/matchStore.liveTick.test.ts`:

```ts
const updateLiveScore = jest.fn().mockResolvedValue(undefined);
const syncNow = jest.fn().mockResolvedValue(undefined);
jest.mock("../src/realtime", () => ({
  getRealtimeBackend: () => ({
    publishEvent: jest.fn().mockResolvedValue(undefined),
    setLive: jest.fn(), clearLive: jest.fn(),
    subscribe: jest.fn(), listLiveMatches: jest.fn(), onLiveMatchesChange: jest.fn(),
  }),
}));
jest.mock("../src/repos/matchRepo", () => ({
  loadEvents: jest.fn().mockResolvedValue([]),
  appendEvent: jest.fn().mockResolvedValue(undefined),
  removeEventsAfter: jest.fn().mockResolvedValue(undefined),
  finalizeMatch: jest.fn().mockResolvedValue(undefined),
  endMatchEarly: jest.fn().mockResolvedValue(undefined),
  getMatch: jest.fn().mockResolvedValue(null),
  updateLiveScore,
}));
jest.mock("../src/sync/runner", () => ({ syncNow, startSyncListener: jest.fn() }));

import { useMatchStore } from "../src/stores/matchStore";
import { defaultConfig, replay } from "../src/engine";
import type { MatchEvent } from "../src/engine";

const started: MatchEvent = {
  type: "MATCH_STARTED",
  config: defaultConfig({ matchType: "singles", teams: { A: [{ id: "a", name: "A" }], B: [{ id: "b", name: "B" }] } }),
  at: 0,
};

beforeEach(() => {
  jest.useFakeTimers();
  updateLiveScore.mockClear();
  syncNow.mockClear();
  useMatchStore.setState({ matchId: null, events: [], redoStack: [], state: null, liveTimer: null });
});
afterEach(() => jest.useRealTimers());

test("ticks a live-score update every 15s while a match is in progress", () => {
  useMatchStore.setState({ matchId: "m1", events: [started], state: replay([started]), redoStack: [] });
  useMatchStore.getState().dispatch({ type: "RALLY_WON", by: "A", at: 1 });

  jest.advanceTimersByTime(15000);
  expect(updateLiveScore).toHaveBeenCalledTimes(1);
  expect(updateLiveScore.mock.calls[0][0]).toBe("m1");

  jest.advanceTimersByTime(15000);
  expect(updateLiveScore).toHaveBeenCalledTimes(2);
});

test("stops ticking once the store is closed", () => {
  useMatchStore.setState({ matchId: "m1", events: [started], state: replay([started]), redoStack: [] });
  useMatchStore.getState().dispatch({ type: "RALLY_WON", by: "A", at: 1 });
  useMatchStore.getState().close();

  jest.advanceTimersByTime(30000);
  expect(updateLiveScore).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/matchStore.liveTick.test.ts`
Expected: FAIL — `liveTimer` doesn't exist on state yet / `updateLiveScore` never called.

- [ ] **Step 3: Implement the live tick in `matchStore.ts`**

Replace the full contents of `src/stores/matchStore.ts`:

```ts
import { create } from "zustand";
import type { MatchEvent, MatchState } from "../engine";
import { replay, undo as undoLog } from "../engine";
import * as repo from "../repos/matchRepo";
import { syncNow } from "../sync/runner";
import { getRealtimeBackend } from "../realtime";

const summarize = (s: MatchState) => `${s.gamesWon.A}-${s.gamesWon.B} (${s.score.A}-${s.score.B})`;
const LIVE_TICK_MS = 15000;

interface MatchStore {
  matchId: string | null;
  events: MatchEvent[];
  redoStack: MatchEvent[];
  state: MatchState | null;
  liveTimer: ReturnType<typeof setInterval> | null;
  /** Load an existing match's log (resume) or start tracking a fresh one. */
  open: (matchId: string) => Promise<void>;
  dispatch: (event: MatchEvent) => void;
  undo: () => void;
  redo: () => void;
  /** End the match early, saving the current score to history. */
  endEarly: () => Promise<void>;
  close: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => {
  const startLiveTimer = (matchId: string) => {
    if (get().liveTimer) return;
    const timer = setInterval(() => {
      const s = get();
      if (s.matchId !== matchId || !s.state || s.state.phase === "match_over") return;
      void repo.updateLiveScore(matchId, s.state).then(() => syncNow()).catch(() => {});
    }, LIVE_TICK_MS);
    set({ liveTimer: timer });
  };
  const stopLiveTimer = () => {
    const { liveTimer } = get();
    if (liveTimer) clearInterval(liveTimer);
    set({ liveTimer: null });
  };

  return {
    matchId: null,
    events: [],
    redoStack: [],
    state: null,
    liveTimer: null,

    open: async (matchId) => {
      const events = await repo.loadEvents(matchId);
      const state = events.length ? replay(events) : null;
      set({ matchId, events, redoStack: [], state });
      // Mark the match live for spectators (best-effort; presence only).
      if (state && state.phase !== "match_over") {
        const record = await repo.getMatch(matchId);
        if (record) {
          getRealtimeBackend().setLive({
            matchId,
            clubId: record.club_id ?? "",
            teamA: record.side_a.map((p) => p.name),
            teamB: record.side_b.map((p) => p.name),
            scoreSummary: summarize(state),
          });
        }
        startLiveTimer(matchId);
      }
    },

    dispatch: (event) => {
      const { matchId, events } = get();
      const next = [...events, event];
      const state = replay(next);
      set({ events: next, state, redoStack: [] });
      if (matchId) {
        // seq is the event's index in the log — deterministic across devices
        void repo.appendEvent(matchId, next.length - 1, event);
        // Publish to spectators — best-effort, never blocks scoring (already in SQLite).
        void getRealtimeBackend().publishEvent(matchId, event).catch(() => {});
        if (state.phase === "match_over") {
          getRealtimeBackend().clearLive(matchId);
          stopLiveTimer();
          void repo.finalizeMatch(matchId, state).then(() => syncNow());
        } else {
          startLiveTimer(matchId);
        }
      }
    },

    undo: () => {
      const { matchId, events, redoStack } = get();
      if (events.length < 2) return;
      const undone = events[events.length - 1];
      const next = undoLog(events);
      set({ events: next, state: replay(next), redoStack: [...redoStack, undone] });
      if (matchId) void repo.removeEventsAfter(matchId, next.length - 1);
    },

    redo: () => {
      const { matchId, events, redoStack } = get();
      if (!redoStack.length) return;
      const event = redoStack[redoStack.length - 1];
      const next = [...events, event];
      set({ events: next, state: replay(next), redoStack: redoStack.slice(0, -1) });
      if (matchId) void repo.appendEvent(matchId, next.length - 1, event);
    },

    endEarly: async () => {
      const { matchId, state } = get();
      if (!matchId || !state) return;
      await repo.endMatchEarly(matchId, state);
      getRealtimeBackend().clearLive(matchId);
      stopLiveTimer();
      void syncNow();
    },

    close: () => {
      stopLiveTimer();
      set({ matchId: null, events: [], redoStack: [], state: null });
    },
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/matchStore.liveTick.test.ts tests/matchStore.publish.test.ts`
Expected: PASS (both files — the existing publish test must still pass unmodified).

- [ ] **Step 5: Commit**

```bash
git add src/stores/matchStore.ts tests/matchStore.liveTick.test.ts
git commit -m "feat(matchStore): tick a live-score sync every 15s while a match is in progress"
```

---

### Task 3: `BracketView` renders court + score

**Files:**
- Modify: `src/components/BracketView.tsx`
- Test: `tests/bracketGamesWon.test.ts` (new)

**Interfaces:**
- Produces: exported type `BracketLiveScore = { status: string; scoreSummary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null }`.
- Produces: exported pure helper `gamesWonBy(games: { A: number; B: number }[], side: "A" | "B"): number`.
- `BracketView` gains an optional prop `liveScores?: Map<string, BracketLiveScore>`, keyed by `matchId`. This is the interface Tasks 4 and 6/7 build their maps against — deliberately independent of `matchRepo`/Supabase types so the same component serves both the in-app screen (built from `MatchRecord`) and the spectator screen (built from the RPC response).
- Consumes: `BracketMatch.court` (already exists — `src/tournament/types.ts:10`).

- [ ] **Step 1: Write the failing test for the pure helper**

Create `tests/bracketGamesWon.test.ts`:

```ts
import { gamesWonBy } from "../src/components/BracketView";

test("counts games won by a side", () => {
  const games = [{ A: 21, B: 15 }, { A: 18, B: 21 }, { A: 21, B: 12 }];
  expect(gamesWonBy(games, "A")).toBe(2);
  expect(gamesWonBy(games, "B")).toBe(1);
});

test("returns 0 for no games", () => {
  expect(gamesWonBy([], "A")).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/bracketGamesWon.test.ts`
Expected: FAIL — `gamesWonBy` is not exported yet.

- [ ] **Step 3: Rewrite `BracketView.tsx`**

Replace the full contents of `src/components/BracketView.tsx`:

```tsx
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import type { BracketMatch, Entrant } from "../tournament/types";
import Icon from "./Icon";
import { C, F } from "../theme";

const CELL_W = 150;
const CELL_H = 84;
const GAP_Y = 20;
const COL_GAP = 44;
const SLOT = CELL_H + GAP_Y;

type Centers = Map<string, number>; // `${round}:${index}` -> centerY

export type BracketLiveScore = {
  status: string;
  scoreSummary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
};

export const gamesWonBy = (games: { A: number; B: number }[], side: "A" | "B"): number =>
  games.filter((g) => (side === "A" ? g.A > g.B : g.B > g.A)).length;

function computeCenters(bracket: BracketMatch[], maxRound: number): Centers {
  const centers: Centers = new Map();
  const r1 = bracket.filter((m) => m.round === 1).sort((a, b) => a.index - b.index);
  r1.forEach((m, i) => centers.set(`1:${m.index}`, SLOT * i + CELL_H / 2));
  for (let r = 2; r <= maxRound; r++) {
    const cells = bracket.filter((m) => m.round === r);
    for (const m of cells) {
      const a = centers.get(`${r - 1}:${m.index * 2}`);
      const b = centers.get(`${r - 1}:${m.index * 2 + 1}`);
      const y = a != null && b != null ? (a + b) / 2 : a ?? b ?? SLOT / 2;
      centers.set(`${r}:${m.index}`, y);
    }
  }
  return centers;
}

export default function BracketView({
  bracket,
  entrants,
  onCellPress,
  liveScores,
}: {
  bracket: BracketMatch[];
  entrants: Entrant[];
  onCellPress?: (cell: BracketMatch) => void;
  liveScores?: Map<string, BracketLiveScore>;
}) {
  if (bracket.length === 0) return null;
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const centers = computeCenters(bracket, maxRound);
  const r1Count = bracket.filter((m) => m.round === 1).length;
  const totalW = maxRound * CELL_W + (maxRound - 1) * COL_GAP;
  const totalH = Math.max(1, r1Count) * SLOT;
  const nameOf = new Map(entrants.map((e) => [e.id, e.name]));
  const colX = (round: number) => (round - 1) * (CELL_W + COL_GAP);

  const champion =
    bracket.find((m) => m.round === maxRound && m.index === 0)?.winnerEntrant ?? null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <ScrollView showsVerticalScrollIndicator style={{ maxHeight: totalH + 8 }}>
        <View style={{ width: totalW, height: totalH }}>
          <Svg width={totalW} height={totalH} style={{ position: "absolute", left: 0, top: 0 }}>
            {bracket
              .filter((m) => m.round < maxRound)
              .map((m) => {
                const y1 = centers.get(`${m.round}:${m.index}`)!;
                const childIndex = Math.floor(m.index / 2);
                const y2 = centers.get(`${m.round + 1}:${childIndex}`)!;
                const x1 = colX(m.round) + CELL_W;
                const x2 = colX(m.round + 1);
                return (
                  <Line key={`l${m.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.line} strokeWidth={1.5} />
                );
              })}
          </Svg>
          {bracket.map((m) => {
            const cy = centers.get(`${m.round}:${m.index}`)!;
            const nameA = m.entrantA ? nameOf.get(m.entrantA) ?? "?" : "—";
            const nameB = m.entrantB ? nameOf.get(m.entrantB) ?? "?" : "—";
            const live = !!m.matchId && !m.winnerEntrant;
            const isChampCell = m.round === maxRound && !!m.winnerEntrant;
            const liveInfo = m.matchId ? liveScores?.get(m.matchId) : undefined;
            const games = liveInfo?.scoreSummary?.games ?? [];
            const current = liveInfo?.scoreSummary?.current;
            return (
              <TouchableOpacity
                key={m.id}
                disabled={!onCellPress || (!m.entrantA && !m.entrantB)}
                onPress={() => onCellPress?.(m)}
                style={{
                  position: "absolute",
                  left: colX(m.round),
                  top: cy - CELL_H / 2,
                  width: CELL_W,
                  height: CELL_H,
                  backgroundColor: C.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: live ? C.accent : isChampCell ? C.red : C.line,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  gap: 2,
                }}
              >
                {m.court ? (
                  <View style={{ position: "absolute", left: 8, top: 6, backgroundColor: C.cardHi, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: C.text2, fontSize: 9, fontFamily: F.semibold }}>C{m.court}</Text>
                  </View>
                ) : null}
                {(["A", "B"] as const).map((side) => {
                  const eid = side === "A" ? m.entrantA : m.entrantB;
                  const label = side === "A" ? nameA : nameB;
                  const won = m.winnerEntrant && m.winnerEntrant === eid;
                  const wonGames = games.length ? gamesWonBy(games, side) : 0;
                  return (
                    <View key={side} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {won && isChampCell ? <Icon name="trophy" color={C.red} size={12} /> : null}
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, color: won ? C.text : C.text2, fontFamily: won ? F.semibold : F.body, fontSize: 13 }}
                      >
                        {label}
                      </Text>
                      {wonGames > 0 ? (
                        <Text style={{ color: C.bg, backgroundColor: won ? C.red : C.text2, fontSize: 9, fontFamily: F.semibold, minWidth: 14, textAlign: "center", borderRadius: 7, paddingHorizontal: 3 }}>
                          {wonGames}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {live && current ? (
                  <Text style={{ color: C.accent, fontSize: 12, fontFamily: F.semibold, marginTop: 2 }}>
                    {current.A}-{current.B}
                  </Text>
                ) : null}
                {!live && m.winnerEntrant && games.length ? (
                  <Text numberOfLines={1} style={{ color: C.text2, fontSize: 10, marginTop: 2 }}>
                    {games.map((g) => `${g.A}-${g.B}`).join("  ")}
                  </Text>
                ) : null}
                {live ? (
                  <View style={{ position: "absolute", right: 8, top: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: C.red }} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/bracketGamesWon.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (note: this only confirms `BracketView.tsx` itself compiles — its two callers aren't updated to pass `liveScores` until Tasks 4 and 6/7, but the prop is optional, so both existing call sites keep compiling unchanged in the meantime).

- [ ] **Step 6: Commit**

```bash
git add src/components/BracketView.tsx tests/bracketGamesWon.test.ts
git commit -m "feat(bracket): render court, live score, and final score per cell"
```

---

### Task 4: In-app bracket screen — polling, live-score map, refresh button

**Files:**
- Modify: `app/(app)/tournaments/[id].tsx`

**Interfaces:**
- Consumes: `BracketView`'s `liveScores` prop and `BracketLiveScore` type from Task 3; `matchRepo.getMatch`/`MatchRecord` (already imported).
- Produces: no new exports — screen-level behavior only.

No test: this is a screen component (no RN component test harness in this repo — see Global Constraints). Verified via `npx tsc --noEmit` and the Task 9 manual walkthrough.

- [ ] **Step 1: Replace the full contents of `app/(app)/tournaments/[id].tsx`**

```tsx
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteTournament, finishBracketMatch, getTournament, startBracketMatch, startTournament,
  type MatchType, type TournamentRow,
} from "../../../src/repos/tournamentRepo";
import { getMatch, type MatchRecord } from "../../../src/repos/matchRepo";
import { getClub } from "../../../src/repos/clubRepo";
import {
  getTournamentStaff, listPendingTournamentRequests, myStaffRole,
  type TournamentJoinRequest, type TournamentStaff,
} from "../../../src/repos/tournamentStaffRepo";
import { bracketStatus } from "../../../src/tournament/bracket";
import { startBlocker } from "../../../src/tournament/draw";
import type { BracketMatch, Entrant } from "../../../src/tournament/types";
import BracketView, { type BracketLiveScore } from "../../../src/components/BracketView";
import Sheet from "../../../src/components/Sheet";
import BottomPanel from "../../../src/components/BottomPanel";
import MenuButton from "../../../src/components/MenuButton";
import Icon from "../../../src/components/Icon";
import PressableScale from "../../../src/components/PressableScale";
import TournamentConfigTab from "../../../src/components/TournamentConfigTab";
import TournamentPlayersTab from "../../../src/components/TournamentPlayersTab";
import TournamentScorersTab from "../../../src/components/TournamentScorersTab";
import { toast } from "../../../src/lib/toast";
import { C, F, press } from "../../../src/theme";

type Tab = "config" | "players" | "scorers";
const POLL_MS = 15000;

export default function TournamentBracket() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("config");
  // Only meaningful once the bracket is showing: the tab row stays pinned
  // below the bracket, and tapping a tab opens its panel as a bottom-sheet
  // overlay instead of squeezing the bracket for space.
  const [panelOpen, setPanelOpen] = useState(false);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [staff, setStaff] = useState<TournamentStaff[]>([]);
  const [requests, setRequests] = useState<TournamentJoinRequest[]>([]);
  const [pending, setPending] = useState<BracketMatch | null>(null); // cell awaiting start confirm
  const [clubRole, setClubRole] = useState<string | null>(null);
  const [isTournamentAdmin, setIsTournamentAdmin] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Cache of live/finished matches keyed by matchId, used to render bracket
  // cell scores. A ref (not just state) so reload() can check "have we
  // already fetched this finished match's score?" without reload itself
  // depending on — and being torn down/recreated by — the state it writes.
  const liveMatchesRef = useRef<Map<string, MatchRecord>>(new Map());
  const [liveMatches, setLiveMatches] = useState<Map<string, MatchRecord>>(new Map());

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const { tournament: t, entrants: ents, bracket: b0 } = await getTournament(id);

      // Fetch every cell that either (a) is still unresolved — it might have
      // just finished, or its live score changed — or (b) just finished and
      // we haven't fetched its final score yet. A finished cell's score
      // never changes again, so once cached it's never re-fetched. Checked
      // in parallel rather than one cell at a time — a sequential
      // await-per-cell loop turns a bracket with several unresolved matches
      // into that many stacked network round trips.
      const toFetch = b0.filter(
        (cell) => cell.matchId && (!cell.winnerEntrant || !liveMatchesRef.current.has(cell.matchId))
      );
      const fetched = await Promise.all(toFetch.map((cell) => getMatch(cell.matchId!)));
      const toReconcile: { cell: BracketMatch; match: MatchRecord }[] = [];
      toFetch.forEach((cell, i) => {
        const m = fetched[i];
        if (!m) return;
        liveMatchesRef.current.set(cell.matchId!, m);
        if (!cell.winnerEntrant) toReconcile.push({ cell, match: m });
      });
      setLiveMatches(new Map(liveMatchesRef.current));

      // Reconcile: any cell whose linked match has completed advances the winner.
      let changed = false;
      await Promise.all(toReconcile.map(async ({ cell, match: m }) => {
        if (m.status !== "live" && m.winner) {
          const winnerEntrant = m.winner === "A" ? cell.entrantA : cell.entrantB;
          if (winnerEntrant) {
            await finishBracketMatch(cell.id, winnerEntrant);
            changed = true;
          }
        }
      }));

      // Only re-fetch the full tournament if reconciliation actually
      // changed something — the common case (nothing to advance) skips a
      // second redundant getTournament call entirely.
      if (changed) {
        const fresh = await getTournament(id);
        setTournament(fresh.tournament);
        setEntrants(fresh.entrants);
        setBracket(fresh.bracket);
      } else {
        setTournament(t);
        setEntrants(ents);
        setBracket(b0);
      }

      const [club, staffRole] = await Promise.all([getClub(t.clubId), myStaffRole(id)]);
      setClubRole(club?.role ?? null);
      setIsTournamentAdmin(staffRole === "admin");
      const isAdmin = club?.role === "owner" || club?.role === "admin" || staffRole === "admin";
      const [staffList, reqs] = await Promise.all([
        getTournamentStaff(id),
        isAdmin ? listPendingTournamentRequests(id) : Promise.resolve([]),
      ]);
      setStaff(staffList);
      setRequests(reqs);
    } catch (e) {
      toast((e as Error).message || "Could not load the tournament", "error");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const interval = setInterval(() => { void reload(); }, POLL_MS);
      return () => clearInterval(interval);
    }, [reload])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const liveScores = useMemo(
    () => new Map<string, BracketLiveScore>(
      [...liveMatches].map(([mid, m]) => [mid, { status: m.status, scoreSummary: m.score_summary }])
    ),
    [liveMatches]
  );

  const onCellPress = (cell: BracketMatch) => {
    if (cell.matchId && !cell.winnerEntrant) {
      router.push(`/watch/${cell.matchId}`);
      return;
    }
    if (cell.winnerEntrant) return; // already decided
    if (!cell.entrantA || !cell.entrantB) return; // waiting on a feeder
    setPending(cell);
  };

  const doStart = async () => {
    const cell = pending;
    setPending(null);
    if (!cell) return;
    try {
      const matchId = await startBracketMatch(cell.id);
      router.push(`/score/${matchId}`);
    } catch (e) {
      toast((e as Error).message || "Could not start", "error");
    }
  };

  const champ = bracketStatus(bracket).champion;
  const champName = champ ? entrants.find((e) => e.id === champ)?.name : null;
  const isAdmin = clubRole === "owner" || clubRole === "admin" || isTournamentAdmin;
  // A legacy draft created before the two-phase split can already hold a
  // full bracket (status flipped to "live" only on the first finished
  // match). Such a tournament must render its bracket, not the Start flow.
  const isDraft = tournament?.status === "draft" && bracket.length === 0;
  const players = entrants.length * ((tournament?.matchType ?? "singles" as MatchType) === "doubles" ? 2 : 1);
  const blocker = startBlocker(players, tournament?.matchType ?? "singles");

  const onStart = async () => {
    if (!id) return;
    setStarting(true);
    try {
      await startTournament(id);
      reload();
    } catch (e) {
      toast((e as Error).message || "Could not start the tournament", "error");
    } finally {
      setStarting(false);
    }
  };

  const onDeleteTournament = async () => {
    if (!id) return;
    setConfirmingDelete(false);
    try {
      await deleteTournament(id);
      router.back();
    } catch (e) {
      toast((e as Error).message || "Could not delete tournament", "error");
    }
  };

  if (!tournament) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const tabContent =
    tab === "config" ? (
      <TournamentConfigTab
        tournament={tournament}
        isAdmin={isAdmin}
        isDraft={!!isDraft}
        blocker={blocker}
        starting={starting}
        onStart={onStart}
        onChanged={reload}
      />
    ) : tab === "players" ? (
      <TournamentPlayersTab
        tournamentId={tournament.id}
        clubId={tournament.clubId}
        entrants={entrants}
        matchType={tournament.matchType}
        isAdmin={isAdmin}
        isDraft={!!isDraft}
        requests={requests}
        onChanged={reload}
      />
    ) : (
      <TournamentScorersTab
        tournamentId={tournament.id}
        tournamentName={tournament.name}
        isAdmin={isAdmin}
        staff={staff}
        requests={requests}
        onChanged={reload}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
      <Stack.Screen
        options={{
          // Trigger only. The menu Sheet is mounted in the body below: a Sheet
          // rendered here would position against the header and be clipped.
          headerRight: isAdmin ? () => <MenuButton onPress={() => setMenuOpen(true)} /> : undefined,
        }}
      />
      <View style={s.titleRow}>
        <Text style={s.titleText}>{tournament.name}</Text>
        {!isDraft ? (
          <PressableScale style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color={C.text2} />
              : <Icon name="sync-outline" color={C.text2} size={16} />}
          </PressableScale>
        ) : null}
      </View>
      {champName ? (
        <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
      ) : null}

      {!isDraft ? (
        <>
          <View style={{ flex: 1, marginBottom: 8 }}>
            <BracketView bracket={bracket} entrants={entrants} onCellPress={onCellPress} liveScores={liveScores} />
          </View>

          <View style={s.tabRow}>
            {(["config", "players", "scorers"] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => { setTab(t); setPanelOpen(true); }}
                style={({ pressed }) => [s.tabBtn, pressed && press]}
              >
                <Text style={s.tabText}>{t[0].toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
            {isAdmin ? (
              <Pressable
                onPress={() => router.push(`/tournaments/ops/${id}`)}
                style={({ pressed }) => [s.tabBtn, pressed && press]}
              >
                <Icon name="cog" color={C.text2} size={16} />
                <Text style={s.tabText}>Ops</Text>
              </Pressable>
            ) : null}
          </View>

          <BottomPanel
            visible={panelOpen}
            title={tab[0].toUpperCase() + tab.slice(1)}
            onClose={() => setPanelOpen(false)}
          >
            {tabContent}
          </BottomPanel>
        </>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={s.tabRow}>
            {(["config", "players", "scorers"] as Tab[]).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={({ pressed }) => [s.tabBtn, pressed && press, tab === t && s.tabOn]}>
                <Text style={[s.tabText, tab === t && s.tabTextOn]}>{t[0].toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          {tabContent}
        </ScrollView>
      )}

      <Sheet
        visible={!!pending}
        title="Start match"
        message="Create and score this match now?"
        actions={[
          { label: "Start", onPress: doStart, primary: true },
          { label: "Cancel", onPress: () => setPending(null) },
        ]}
        onClose={() => setPending(null)}
      />
      <Sheet
        visible={menuOpen}
        title="Actions"
        actions={[
          { label: "Delete tournament", destructive: true, onPress: () => { setMenuOpen(false); setConfirmingDelete(true); } },
          { label: "Cancel", onPress: () => setMenuOpen(false) },
        ]}
        onClose={() => setMenuOpen(false)}
      />
      <Sheet
        visible={confirmingDelete}
        title="Delete tournament?"
        message={`This permanently deletes "${tournament.name}". Matches already played stay in history.`}
        actions={[
          { label: "Delete", onPress: onDeleteTournament, destructive: true },
          { label: "Cancel", onPress: () => setConfirmingDelete(false) },
        ]}
        onClose={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  titleText: { color: C.text, fontFamily: F.bold, fontSize: 18 },
  refreshBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.card },
  tabRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  tabOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
  tabText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  tabTextOn: { color: C.text },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/tournaments/[id].tsx"
git commit -m "feat(tournaments): poll bracket every 15s, add manual refresh, wire live scores"
```

---

### Task 5: Migration — extend `tournament_spectator_view` with court + score

**Files:**
- Create: `supabase/migrations/0021_tournament_spectator_live_score.sql`

**Interfaces:**
- Produces: `tournament_spectator_view(p_tournament_id uuid)` now also returns `court text`, `match_status text`, `score_summary jsonb` per row.

No automated test (no local Postgres test harness in this project — prior migrations 0018-0020 were verified the same way). Verified via `supabase db push` + the Task 9 manual walkthrough.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0021_tournament_spectator_live_score.sql`:

```sql
-- Extend the spectator RPC with what the redesigned bracket screen needs:
-- court assignment and a near-live score (matches.score_summary, refreshed
-- every ~15s by the scoring device — see src/stores/matchStore.ts). The
-- function's return signature is changing, so it must be dropped first;
-- create-or-replace alone rejects a changed return type.
drop function if exists public.tournament_spectator_view(uuid);

create function public.tournament_spectator_view(p_tournament_id uuid)
returns table (
  name text,
  status text,
  round int,
  idx int,
  match_id uuid,
  entrant_a uuid,
  entrant_b uuid,
  winner_entrant uuid,
  entrant_a_name text,
  entrant_b_name text,
  court text,
  match_status text,
  score_summary jsonb
)
language sql security definer stable set search_path = public as $$
  select
    t.name,
    t.status,
    b.round,
    b.idx,
    b.match_id,
    b.entrant_a,
    b.entrant_b,
    b.winner_entrant,
    pa.name as entrant_a_name,
    pb.name as entrant_b_name,
    b.court,
    m.status as match_status,
    m.score_summary
  from tournaments t
  left join bracket_matches b on b.tournament_id = t.id
  left join tournament_entrants ea on ea.id = b.entrant_a
  left join club_players pa on pa.id = ea.club_player_id
  left join tournament_entrants eb on eb.id = b.entrant_b
  left join club_players pb on pb.id = eb.club_player_id
  left join matches m on m.id = b.match_id
  where t.id = p_tournament_id
  order by b.round, b.idx;
$$;

grant execute on function public.tournament_spectator_view(uuid) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0021_tournament_spectator_live_score.sql
git commit -m "feat(db): add court + live score to tournament_spectator_view"
```

Note: this migration is **not applied automatically** — flag to the user at the end of this plan that `supabase db push` (or the project's equivalent deploy step) is required before Tasks 6-7 are testable end-to-end against the live database, consistent with how migrations 0018-0020 were handled earlier in this project.

---

### Task 6: `tournamentStaffRepo` — parse court + score from the RPC

**Files:**
- Modify: `src/repos/tournamentStaffRepo.ts`
- Modify: `tests/tournamentSpectator.test.ts`

**Interfaces:**
- Consumes: the widened `tournament_spectator_view` RPC response from Task 5.
- Produces: widened `SpectatorBracketCell` type — adds `court: string | null`, `matchStatus: string | null`, `scoreSummary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null`.

- [ ] **Step 1: Update the failing tests**

Replace the full contents of `tests/tournamentSpectator.test.ts`:

```ts
const rpc = jest.fn();
jest.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getTournamentSpectatorView } from "../src/repos/tournamentStaffRepo";

beforeEach(() => rpc.mockReset());

test("maps bracket cells from the RPC response", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: null, match_status: null, score_summary: null,
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(rpc).toHaveBeenCalledWith("tournament_spectator_view", { p_tournament_id: "t-1" });
  expect(view).toEqual({
    name: "Smash Cup",
    status: "live",
    cells: [
      {
        round: 1, idx: 0, matchId: "m-1",
        entrantA: "e1", entrantB: "e2", winnerEntrant: null,
        entrantAName: "Ann", entrantBName: "Bo",
        court: null, matchStatus: null, scoreSummary: null,
      },
    ],
  });
});

test("carries court and live score through for a match in progress", async () => {
  rpc.mockResolvedValue({
    data: [
      {
        name: "Smash Cup", status: "live", round: 1, idx: 0, match_id: "m-1",
        entrant_a: "e1", entrant_b: "e2", winner_entrant: null,
        entrant_a_name: "Ann", entrant_b_name: "Bo",
        court: "2", match_status: "live",
        score_summary: { games: [], current: { A: 11, B: 7 } },
      },
    ],
    error: null,
  });

  const view = await getTournamentSpectatorView("t-1");

  expect(view?.cells[0]).toEqual({
    round: 1, idx: 0, matchId: "m-1",
    entrantA: "e1", entrantB: "e2", winnerEntrant: null,
    entrantAName: "Ann", entrantBName: "Bo",
    court: "2", matchStatus: "live",
    scoreSummary: { games: [], current: { A: 11, B: 7 } },
  });
});

test("returns an empty cell list for a tournament with no bracket yet", async () => {
  rpc.mockResolvedValue({
    data: [{
      name: "Smash Cup", status: "draft", round: null, idx: null, match_id: null,
      entrant_a: null, entrant_b: null, winner_entrant: null,
      entrant_a_name: null, entrant_b_name: null,
      court: null, match_status: null, score_summary: null,
    }],
    error: null,
  });

  expect(await getTournamentSpectatorView("t-1")).toEqual({ name: "Smash Cup", status: "draft", cells: [] });
});

test("returns null when the tournament doesn't exist", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await getTournamentSpectatorView("nope")).toBeNull();
});

test("throws instead of swallowing an RPC error", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
  await expect(getTournamentSpectatorView("t-1")).rejects.toThrow("permission denied");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/tournamentSpectator.test.ts`
Expected: FAIL — `court`/`matchStatus`/`scoreSummary` missing from the actual output.

- [ ] **Step 3: Update `tournamentStaffRepo.ts`**

Replace lines 47-76 of `src/repos/tournamentStaffRepo.ts` (the `SpectatorBracketCell`/`SpectatorView` types and `getTournamentSpectatorView`):

```ts
export type SpectatorBracketCell = {
  round: number; idx: number; matchId: string | null;
  entrantA: string | null; entrantB: string | null; winnerEntrant: string | null;
  entrantAName: string | null; entrantBName: string | null;
  court: string | null; matchStatus: string | null;
  scoreSummary: { games: { A: number; B: number }[]; current?: { A: number; B: number } } | null;
};
export type SpectatorView = { name: string; status: string; cells: SpectatorBracketCell[] };

/** Read-only bracket for the spectator join link. No membership required. */
export async function getTournamentSpectatorView(tournamentId: string): Promise<SpectatorView | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("tournament_spectator_view", { p_tournament_id: tournamentId });
  if (error) throw new Error(error.message);
  const rows = (data as {
    name: string; status: string; round: number | null; idx: number | null; match_id: string | null;
    entrant_a: string | null; entrant_b: string | null; winner_entrant: string | null;
    entrant_a_name: string | null; entrant_b_name: string | null;
    court: string | null; match_status: string | null;
    score_summary: SpectatorBracketCell["scoreSummary"];
  }[] | null) ?? [];
  if (rows.length === 0) return null;
  return {
    name: rows[0].name,
    status: rows[0].status,
    // A tournament with no bracket yet still returns one row (left join),
    // with round/idx null — that's "not started", not "not found".
    cells: rows[0].round == null ? [] : rows.map((r) => ({
      round: r.round as number, idx: r.idx as number, matchId: r.match_id,
      entrantA: r.entrant_a, entrantB: r.entrant_b, winnerEntrant: r.winner_entrant,
      entrantAName: r.entrant_a_name, entrantBName: r.entrant_b_name,
      court: r.court, matchStatus: r.match_status, scoreSummary: r.score_summary,
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/tournamentSpectator.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/repos/tournamentStaffRepo.ts tests/tournamentSpectator.test.ts
git commit -m "feat(spectator): parse court and live score from the spectator RPC"
```

---

### Task 7: Spectator screen — polling, live scores, refresh button

**Files:**
- Modify: `app/join/tournament/[id]/spectator.tsx`

**Interfaces:**
- Consumes: `SpectatorView`/`SpectatorBracketCell` from Task 6, `BracketView`'s `liveScores` prop and `BracketLiveScore` type from Task 3.
- Produces: no new exports — screen-level behavior only.

No test: screen component, no RN test harness (see Global Constraints). Verified via `npx tsc --noEmit` and the Task 9 manual walkthrough.

- [ ] **Step 1: Replace the full contents of `app/join/tournament/[id]/spectator.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getTournamentSpectatorView, type SpectatorView } from "../../../../src/repos/tournamentStaffRepo";
import type { BracketMatch, Entrant } from "../../../../src/tournament/types";
import BracketView, { type BracketLiveScore } from "../../../../src/components/BracketView";
import { toast } from "../../../../src/lib/toast";
import Logo from "../../../../src/components/Logo";
import PressableScale from "../../../../src/components/PressableScale";
import Icon from "../../../../src/components/Icon";
import { C, F } from "../../../../src/theme";

const POLL_MS = 15000;

export default function JoinTournamentSpectator() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<SpectatorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setView(await getTournamentSpectatorView(id));
    } catch (e) {
      toast((e as Error).message || "Could not load that tournament", "error");
    }
  }, [id]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    load().finally(() => setLoading(false));
    const interval = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(interval);
  }, [id, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.red} /></View>;
  }
  if (!view) {
    return (
      <View style={s.center}>
        <Logo size={44} />
        <Text style={s.title}>Tournament not found</Text>
        <Text style={s.sub}>This link may be out of date. Ask for a fresh one.</Text>
        <PressableScale style={s.ghost} onPress={() => router.replace("/")}>
          <Text style={s.ghostText}>Back to CourtSide</Text>
        </PressableScale>
      </View>
    );
  }

  const bracket: BracketMatch[] = view.cells.map((c) => ({
    id: `${c.round}:${c.idx}`, tournamentId: id!, round: c.round, index: c.idx,
    matchId: c.matchId, entrantA: c.entrantA, entrantB: c.entrantB,
    winnerEntrant: c.winnerEntrant, court: c.court, scoredBy: null,
  }));

  const liveScores = new Map<string, BracketLiveScore>();
  for (const c of view.cells) {
    if (c.matchId && c.matchStatus) {
      liveScores.set(c.matchId, { status: c.matchStatus, scoreSummary: c.scoreSummary });
    }
  }

  const entrantMap = new Map<string, Entrant>();
  for (const c of view.cells) {
    if (c.entrantA && c.entrantAName) {
      entrantMap.set(c.entrantA, { id: c.entrantA, clubPlayerId: "", name: c.entrantAName, seed: 0, partnerClubPlayerId: null });
    }
    if (c.entrantB && c.entrantBName) {
      entrantMap.set(c.entrantB, { id: c.entrantB, clubPlayerId: "", name: c.entrantBName, seed: 0, partnerClubPlayerId: null });
    }
  }

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Logo size={40} />
        <Text style={s.eyebrow}>SPECTATING</Text>
        <View style={s.titleRow}>
          <Text style={s.title}>{view.name}</Text>
          <PressableScale style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color={C.text2} />
              : <Icon name="sync-outline" color={C.text2} size={16} />}
          </PressableScale>
        </View>
      </View>
      {bracket.length === 0 ? (
        <Text style={s.sub}>This tournament hasn't started yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.bracketWrap}>
          <BracketView bracket={bracket} entrants={[...entrantMap.values()]} liveScores={liveScores} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: C.bg },
  hero: { alignItems: "center", gap: 8 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: C.text, fontFamily: F.display, fontSize: 22, textAlign: "center" },
  refreshBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.card },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  bracketWrap: { paddingVertical: 8 },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { color: C.accent, fontFamily: F.medium, fontSize: 15 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "app/join/tournament/[id]/spectator.tsx"
git commit -m "feat(spectator): poll every 15s, show court/live score, add manual refresh"
```

---

### Task 8: Full test suite + type-check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: all suites pass, including the new `tests/matchStore.liveTick.test.ts` and `tests/bracketGamesWon.test.ts`, and the updated `tests/tournamentSpectator.test.ts`.

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit (only if either step required fixes)**

```bash
git add -A
git commit -m "fix: address test/type-check fallout from bracket realtime redesign"
```

If nothing needed fixing, skip this commit — there's nothing to commit.

---

### Task 9: Manual verification (requires `supabase db push`)

**Files:** none — this is a walkthrough, not a code task.

Before this task, apply migration `0021_tournament_spectator_live_score.sql` (`supabase db push` or the project's equivalent deploy step) — Tasks 6-7 read columns that don't exist in the live database until this runs.

- [ ] **Step 1:** Start (or resume) a bracket match from the in-app tournament screen on device A. Confirm the scoring screen behaves exactly as before (no visible change while actively scoring).
- [ ] **Step 2:** On device B (or a second session), open the same tournament's bracket tab. Score a few points on device A, then wait up to 15s. Confirm device B's cell for that match shows the court chip (if a court was assigned) and the current game score, updating within ~15s.
- [ ] **Step 3:** Tap the manual refresh button on device B immediately after scoring a point on device A. Confirm the score updates immediately, without waiting for the next 15s tick.
- [ ] **Step 4:** Finish the match. Confirm the cell switches to the winner/trophy display with the final per-game score line beneath it, and the live dot/court chip/current-score line disappear.
- [ ] **Step 5:** Open the tournament's spectator link (as an anonymous/guest session, in a separate browser or device with no club membership). Confirm the same court + live score + final score behavior appears there, polling on its own 15s cycle, with its own manual refresh button working.
- [ ] **Step 6:** Turn off network connectivity on the scoring device mid-match, score a couple of points, then restore connectivity. Confirm the score eventually reaches other devices/spectators once connectivity returns (via the existing `syncNow()`-on-reconnect path) and nothing crashes or shows a stuck/error state in the meantime.
