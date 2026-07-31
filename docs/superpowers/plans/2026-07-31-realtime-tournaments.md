# Realtime Tournaments & Live Match Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add club-gated live match spectating and single-elimination tournaments to CourtSide, built behind swappable Realtime/Auth backends with a working local (dummy) implementation.

**Architecture:** All cloud concerns sit behind two interfaces (`RealtimeBackend`, `AuthBackend`). Local in-process implementations run today with SQLite + dummy data; Supabase implementations drop in later with no UI change. A pure, deterministic bracket engine drives tournaments; the existing event-sourced scoring engine is reused untouched — a scored point is the realtime payload.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript, expo-router v6, expo-sqlite, Zustand, react-native-svg (already installed), Jest.

## Global Constraints

- Expo SDK 54 — read versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing native/config code.
- `src/engine/*` stays pure and unmodified. Reuse `replay(events)` and `MatchEvent`.
- Client-generated UUID PKs on all new tables (offline-safe). Use `expo-crypto` `randomUUID()`.
- All writes hit SQLite first (source of truth); backend publish is best-effort with `match_events.synced` queue.
- Tournament format: single elimination only. Sizes: 4, 8, 16, 32.
- Gate every task on `npx tsc --noEmit && npm test`.
- No new libraries beyond what is listed unless a task explicitly adds one.
- Keep files under 500 lines; follow existing theme tokens (`C`, `F`, `GRAD`, `glow`) and Icon component.

---

### Task 1: Pure bracket engine

**Files:**
- Create: `src/tournament/types.ts`
- Create: `src/tournament/bracket.ts`
- Test: `tests/bracket.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type Entrant = { id: string; clubPlayerId: string; name: string; seed: number }`
  - `type BracketMatch = { id: string; tournamentId: string; round: number; index: number; matchId: string | null; entrantA: string | null; entrantB: string | null; winnerEntrant: string | null }` (`entrant*`/`winnerEntrant` hold `Entrant.id`; `round` 1-based, `index` 0-based within round)
  - `buildBracket(entrants: Entrant[], size: 4|8|16|32, tournamentId: string, gen: () => string): BracketMatch[]`
  - `advanceWinner(bracket: BracketMatch[], bracketMatchId: string, winnerEntrant: string): BracketMatch[]` (pure, returns new array; idempotent)
  - `bracketStatus(bracket: BracketMatch[]): { status: 'pending' | 'live' | 'done'; champion: string | null }`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/bracket.test.ts
import { buildBracket, advanceWinner, bracketStatus } from "../src/tournament/bracket";
import type { Entrant } from "../src/tournament/types";

let n = 0;
const gen = () => `id${n++}`;
const ents = (count: number): Entrant[] =>
  Array.from({ length: count }, (_, i) => ({ id: `e${i + 1}`, clubPlayerId: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1 }));

beforeEach(() => { n = 0; });

test("size 4 builds 2 round-1 matches and 1 final", () => {
  const b = buildBracket(ents(4), 4, "t1", gen);
  expect(b.filter((m) => m.round === 1)).toHaveLength(2);
  expect(b.filter((m) => m.round === 2)).toHaveLength(1);
});

test("standard seeding puts seed 1 vs seed 4, seed 2 vs seed 3 (size 4)", () => {
  const b = buildBracket(ents(4), 4, "t1", gen).filter((m) => m.round === 1);
  const pair = (m: any) => [m.entrantA, m.entrantB].sort();
  expect(pair(b[0])).toEqual(["e1", "e4"].sort());
  expect(pair(b[1])).toEqual(["e2", "e3"].sort());
});

test("5 entrants into size 8 creates 3 byes that auto-advance to round 2", () => {
  const b = buildBracket(ents(5), 8, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  const byes = r1.filter((m) => m.entrantA === null || m.entrantB === null);
  expect(byes).toHaveLength(3);
  // a bye match already has a winner (the present entrant)
  byes.forEach((m) => expect(m.winnerEntrant).toBe(m.entrantA ?? m.entrantB));
});

test("advanceWinner fills the next-round slot by parity", () => {
  const b = buildBracket(ents(4), 4, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  const b2 = advanceWinner(b, r1[0].id, r1[0].entrantA!);
  const final = b2.find((m) => m.round === 2)!;
  expect(final.entrantA).toBe(r1[0].entrantA); // index 0 -> entrantA
  const b3 = advanceWinner(b2, r1[1].id, r1[1].entrantB!);
  expect(b3.find((m) => m.round === 2)!.entrantB).toBe(r1[1].entrantB); // index 1 -> entrantB
});

test("advanceWinner is idempotent", () => {
  const b = buildBracket(ents(4), 4, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  const once = advanceWinner(b, r1[0].id, r1[0].entrantA!);
  const twice = advanceWinner(once, r1[0].id, r1[0].entrantA!);
  expect(twice).toEqual(once);
});

test("bracketStatus reports champion when final resolved", () => {
  let b = buildBracket(ents(4), 4, "t1", gen);
  const r1 = b.filter((m) => m.round === 1);
  b = advanceWinner(b, r1[0].id, "e1");
  b = advanceWinner(b, r1[1].id, "e2");
  expect(bracketStatus(b).status).not.toBe("done");
  const final = b.find((m) => m.round === 2)!;
  b = advanceWinner(b, final.id, "e1");
  expect(bracketStatus(b)).toEqual({ status: "done", champion: "e1" });
});

test("deterministic: same inputs produce same ids and structure", () => {
  n = 0; const a = buildBracket(ents(8), 8, "t1", gen);
  n = 0; const c = buildBracket(ents(8), 8, "t1", gen);
  expect(a).toEqual(c);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- bracket.test.ts`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement `types.ts` and `bracket.ts`**

```typescript
// src/tournament/types.ts
export type BracketSize = 4 | 8 | 16 | 32;
export type Entrant = { id: string; clubPlayerId: string; name: string; seed: number };
export type BracketMatch = {
  id: string; tournamentId: string; round: number; index: number;
  matchId: string | null; entrantA: string | null; entrantB: string | null;
  winnerEntrant: string | null;
};
```

```typescript
// src/tournament/bracket.ts
import type { BracketMatch, BracketSize, Entrant } from "./types";

// Standard single-elim seed order for a bracket of `size` (1-based seeds).
// e.g. size 4 -> [1,4,2,3]; size 8 -> [1,8,4,5,2,7,3,6].
function seedOrder(size: number): number[] {
  let rounds = [1, 2];
  while (rounds.length < size) {
    const n = rounds.length * 2;
    const next: number[] = [];
    for (const s of rounds) { next.push(s); next.push(n + 1 - s); }
    rounds = next;
  }
  return rounds;
}

export function buildBracket(
  entrants: Entrant[], size: BracketSize, tournamentId: string, gen: () => string,
): BracketMatch[] {
  const bySeed = new Map(entrants.map((e) => [e.seed, e]));
  const order = seedOrder(size); // length === size, values are seed numbers
  const out: BracketMatch[] = [];

  // Round 1: pair adjacent slots in seed order. Missing seed => bye (null).
  const r1: BracketMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const a = bySeed.get(order[i * 2]) ?? null;
    const b = bySeed.get(order[i * 2 + 1]) ?? null;
    const present = a && b ? null : (a ?? b);
    r1.push({
      id: gen(), tournamentId, round: 1, index: i, matchId: null,
      entrantA: a ? a.id : null, entrantB: b ? b.id : null,
      winnerEntrant: present ? present.id : null, // bye auto-resolves
    });
  }
  out.push(...r1);

  // Empty later rounds.
  let count = size / 2;
  let round = 2;
  let prev = r1;
  while (count > 1) {
    count = count / 2;
    const cur: BracketMatch[] = [];
    for (let i = 0; i < count; i++) {
      cur.push({ id: gen(), tournamentId, round, index: i, matchId: null, entrantA: null, entrantB: null, winnerEntrant: null });
    }
    out.push(...cur);
    // Propagate byes already resolved in prev round into this round.
    for (const m of prev) {
      if (m.winnerEntrant) applyInto(cur, m.index, m.winnerEntrant);
    }
    prev = cur; round++;
  }
  return out;
}

function applyInto(round: BracketMatch[], childIndexFrom: number, winner: string): void {
  const target = round[Math.floor(childIndexFrom / 2)];
  if (!target) return;
  if (childIndexFrom % 2 === 0) target.entrantA = winner;
  else target.entrantB = winner;
}

export function advanceWinner(bracket: BracketMatch[], bracketMatchId: string, winnerEntrant: string): BracketMatch[] {
  const copy = bracket.map((m) => ({ ...m }));
  const m = copy.find((x) => x.id === bracketMatchId);
  if (!m) return bracket;
  m.winnerEntrant = winnerEntrant;
  const child = copy.find((x) => x.round === m.round + 1 && x.index === Math.floor(m.index / 2));
  if (child) {
    if (m.index % 2 === 0) child.entrantA = winnerEntrant;
    else child.entrantB = winnerEntrant;
  }
  return copy;
}

export function bracketStatus(bracket: BracketMatch[]): { status: "pending" | "live" | "done"; champion: string | null } {
  if (bracket.length === 0) return { status: "pending", champion: null };
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const final = bracket.find((m) => m.round === maxRound && m.index === 0)!;
  if (final.winnerEntrant) return { status: "done", champion: final.winnerEntrant };
  const anyPlayed = bracket.some((m) => m.matchId || (m.winnerEntrant && m.round === 1));
  return { status: anyPlayed ? "live" : "pending", champion: null };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- bracket.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/tournament/ tests/bracket.test.ts
git commit -m "feat(tournament): pure single-elim bracket engine"
```

---

### Task 2: Database schema for tournaments

**Files:**
- Modify: `src/db/schema.ts` (add CREATE TABLE statements + bump local migration)
- Test: `tests/schema.tournaments.test.ts` (run migration against in-memory/mock, assert tables)

**Interfaces:**
- Consumes: existing `getDb()` from `src/db/db.ts`, existing migration runner in `src/db/schema.ts`.
- Produces: tables `tournaments`, `tournament_entrants`, `bracket_matches` (columns per spec). No new TS exports beyond the DDL constant.

- [ ] **Step 1: Write failing test**

```typescript
// tests/schema.tournaments.test.ts
import { TOURNAMENT_DDL } from "../src/db/schema";
test("tournament DDL declares the three tables", () => {
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS tournaments/);
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS tournament_entrants/);
  expect(TOURNAMENT_DDL).toMatch(/CREATE TABLE IF NOT EXISTS bracket_matches/);
});
```

- [ ] **Step 2: Run → FAIL** (`TOURNAMENT_DDL` undefined).

- [ ] **Step 3: Add DDL and include it in the migration run**

```typescript
// src/db/schema.ts — add and export
export const TOURNAMENT_DDL = `
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY, club_id TEXT NOT NULL, name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single_elim', size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tournament_entrants (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, club_player_id TEXT NOT NULL,
  seed INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bracket_matches (
  id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, round INTEGER NOT NULL,
  idx INTEGER NOT NULL, match_id TEXT, entrant_a TEXT, entrant_b TEXT,
  winner_entrant TEXT
);
CREATE INDEX IF NOT EXISTS idx_bracket_tournament ON bracket_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_entrants_tournament ON tournament_entrants(tournament_id);
`;
```

Locate the existing `execAsync`/migration call in `schema.ts` and append `+ TOURNAMENT_DDL` (or a second `execAsync(TOURNAMENT_DDL)` after the base schema). Note: `index` is reserved-ish; column is named `idx` and mapped to `BracketMatch.index` in the repo (Task 5).

- [ ] **Step 4: Run → PASS**, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts tests/schema.tournaments.test.ts
git commit -m "feat(db): add tournaments, entrants, bracket_matches tables"
```

---

### Task 3: Realtime backend interface + LocalBackend

**Files:**
- Create: `src/realtime/backend.ts` (interface + types + tiny emitter + LocalBackend)
- Create: `src/realtime/index.ts` (singleton provider: `getRealtimeBackend()`)
- Test: `tests/realtime.local.test.ts`

**Interfaces:**
- Consumes: `MatchEvent` from `src/engine/types`.
- Produces:
  - `type LiveMatch = { matchId: string; clubId: string; teamA: string[]; teamB: string[]; scoreSummary: string }`
  - `type Unsubscribe = () => void`
  - `interface RealtimeBackend { publishEvent(matchId: string, event: MatchEvent): Promise<void>; subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe; listLiveMatches(clubId: string): Promise<LiveMatch[]>; onLiveMatchesChange(clubId: string, cb: (list: LiveMatch[]) => void): Unsubscribe; setLive(m: LiveMatch): void; clearLive(matchId: string): void }`
  - `class LocalBackend implements RealtimeBackend`
  - `getRealtimeBackend(): RealtimeBackend` (returns a module-level `LocalBackend` singleton)

- [ ] **Step 1: Write failing tests**

```typescript
// tests/realtime.local.test.ts
import { LocalBackend } from "../src/realtime/backend";
import type { MatchEvent } from "../src/engine/types";

const ev = (): MatchEvent => ({ type: "POINT_SCORED", side: "A", at: 1 } as any);

test("subscribe receives published events", async () => {
  const b = new LocalBackend();
  const got: MatchEvent[] = [];
  const off = b.subscribe("m1", (e) => got.push(e));
  await b.publishEvent("m1", ev());
  expect(got).toHaveLength(1);
  off();
  await b.publishEvent("m1", ev());
  expect(got).toHaveLength(1); // unsubscribed
});

test("events are scoped per match", async () => {
  const b = new LocalBackend();
  const got: MatchEvent[] = [];
  b.subscribe("m1", (e) => got.push(e));
  await b.publishEvent("m2", ev());
  expect(got).toHaveLength(0);
});

test("live-match list updates notify subscribers", async () => {
  const b = new LocalBackend();
  const seen: number[] = [];
  b.onLiveMatchesChange("c1", (list) => seen.push(list.length));
  b.setLive({ matchId: "m1", clubId: "c1", teamA: ["A"], teamB: ["B"], scoreSummary: "0-0" });
  expect(await b.listLiveMatches("c1")).toHaveLength(1);
  b.clearLive("m1");
  expect(await b.listLiveMatches("c1")).toHaveLength(0);
  expect(seen).toEqual([1, 0]);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/realtime/backend.ts
import type { MatchEvent } from "../engine/types";

export type LiveMatch = { matchId: string; clubId: string; teamA: string[]; teamB: string[]; scoreSummary: string };
export type Unsubscribe = () => void;

export interface RealtimeBackend {
  publishEvent(matchId: string, event: MatchEvent): Promise<void>;
  subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe;
  listLiveMatches(clubId: string): Promise<LiveMatch[]>;
  onLiveMatchesChange(clubId: string, cb: (list: LiveMatch[]) => void): Unsubscribe;
  setLive(m: LiveMatch): void;
  clearLive(matchId: string): void;
}

export class LocalBackend implements RealtimeBackend {
  private subs = new Map<string, Set<(e: MatchEvent) => void>>();
  private live = new Map<string, LiveMatch>();
  private liveSubs = new Map<string, Set<(l: LiveMatch[]) => void>>();

  async publishEvent(matchId: string, event: MatchEvent): Promise<void> {
    this.subs.get(matchId)?.forEach((cb) => cb(event));
  }
  subscribe(matchId: string, cb: (e: MatchEvent) => void): Unsubscribe {
    const set = this.subs.get(matchId) ?? new Set();
    set.add(cb); this.subs.set(matchId, set);
    return () => set.delete(cb);
  }
  async listLiveMatches(clubId: string): Promise<LiveMatch[]> {
    return [...this.live.values()].filter((m) => m.clubId === clubId);
  }
  onLiveMatchesChange(clubId: string, cb: (l: LiveMatch[]) => void): Unsubscribe {
    const set = this.liveSubs.get(clubId) ?? new Set();
    set.add(cb); this.liveSubs.set(clubId, set);
    return () => set.delete(cb);
  }
  setLive(m: LiveMatch): void { this.live.set(m.matchId, m); this.emitLive(m.clubId); }
  clearLive(matchId: string): void {
    const m = this.live.get(matchId); this.live.delete(matchId);
    if (m) this.emitLive(m.clubId);
  }
  private emitLive(clubId: string): void {
    const list = [...this.live.values()].filter((m) => m.clubId === clubId);
    this.liveSubs.get(clubId)?.forEach((cb) => cb(list));
  }
}
```

```typescript
// src/realtime/index.ts
import { LocalBackend, type RealtimeBackend } from "./backend";
let instance: RealtimeBackend | null = null;
export function getRealtimeBackend(): RealtimeBackend {
  if (!instance) instance = new LocalBackend(); // swap to SupabaseBackend later
  return instance;
}
```

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/realtime/ tests/realtime.local.test.ts
git commit -m "feat(realtime): RealtimeBackend interface + LocalBackend"
```

---

### Task 4: Auth backend + session context + sign-in gate

**Files:**
- Create: `src/auth/backend.ts` (interface + `LocalAuthBackend`)
- Create: `src/auth/index.ts` (`getAuthBackend()` singleton)
- Create: `src/stores/session.tsx` (React Context provider + `useSession()`)
- Create: `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`
- Modify: `app/_layout.tsx` (wrap in `SessionProvider`, redirect when signed out)
- Test: `tests/auth.local.test.ts`

**Interfaces:**
- Consumes: `getDb()` for dummy profile persistence; `randomUUID` from `expo-crypto`.
- Produces:
  - `type Profile = { id: string; displayName: string; avatarUrl: string | null }`
  - `interface AuthBackend { currentUser(): Profile | null; signInEmail(email: string, pw: string): Promise<Profile>; signUpEmail(email: string, pw: string, displayName: string): Promise<Profile>; signInGoogle(): Promise<Profile>; signOut(): Promise<void>; onAuthChange(cb: (p: Profile | null) => void): () => void }`
  - `class LocalAuthBackend implements AuthBackend` (no password check; creates/returns a dummy profile; `signInGoogle` returns a fixed demo profile)
  - `getAuthBackend(): AuthBackend`
  - `SessionProvider` component + `useSession(): { user: Profile | null; auth: AuthBackend }`

- [ ] **Step 1: Write failing test (backend only — Context tested via screens later)**

```typescript
// tests/auth.local.test.ts
import { LocalAuthBackend } from "../src/auth/backend";
test("sign in creates and returns a profile, then currentUser reflects it", async () => {
  const a = new LocalAuthBackend();
  expect(a.currentUser()).toBeNull();
  const p = await a.signInEmail("x@y.com", "whatever");
  expect(p.displayName).toBeTruthy();
  expect(a.currentUser()?.id).toBe(p.id);
  await a.signOut();
  expect(a.currentUser()).toBeNull();
});
test("onAuthChange fires on sign in and sign out", async () => {
  const a = new LocalAuthBackend();
  const seen: (string | null)[] = [];
  a.onAuthChange((p) => seen.push(p ? p.id : null));
  const p = await a.signInEmail("x@y.com", "pw");
  await a.signOut();
  expect(seen).toEqual([p.id, null]);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement backend (in-memory dummy; persistence optional)**

```typescript
// src/auth/backend.ts
export type Profile = { id: string; displayName: string; avatarUrl: string | null };
export interface AuthBackend {
  currentUser(): Profile | null;
  signInEmail(email: string, pw: string): Promise<Profile>;
  signUpEmail(email: string, pw: string, displayName: string): Promise<Profile>;
  signInGoogle(): Promise<Profile>;
  signOut(): Promise<void>;
  onAuthChange(cb: (p: Profile | null) => void): () => void;
}

let counter = 0;
const uid = () => `local-${++counter}`;

export class LocalAuthBackend implements AuthBackend {
  private user: Profile | null = null;
  private subs = new Set<(p: Profile | null) => void>();
  currentUser() { return this.user; }
  private set(p: Profile | null) { this.user = p; this.subs.forEach((cb) => cb(p)); }
  async signInEmail(email: string) {
    const p = { id: uid(), displayName: email.split("@")[0] || "Player", avatarUrl: null };
    this.set(p); return p;
  }
  async signUpEmail(_e: string, _pw: string, displayName: string) {
    const p = { id: uid(), displayName, avatarUrl: null }; this.set(p); return p;
  }
  async signInGoogle() {
    const p = { id: uid(), displayName: "Google Player", avatarUrl: null }; this.set(p); return p;
  }
  async signOut() { this.set(null); }
  onAuthChange(cb: (p: Profile | null) => void) { this.subs.add(cb); return () => this.subs.delete(cb); }
}
```

```typescript
// src/auth/index.ts
import { LocalAuthBackend, type AuthBackend } from "./backend";
let instance: AuthBackend | null = null;
export function getAuthBackend(): AuthBackend {
  if (!instance) instance = new LocalAuthBackend(); // swap to SupabaseAuthBackend later
  return instance;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Implement session context + gate (no unit test; verified by tsc + manual)**

```tsx
// src/stores/session.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { getAuthBackend } from "../auth";
import type { AuthBackend, Profile } from "../auth/backend";

const Ctx = createContext<{ user: Profile | null; auth: AuthBackend } | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const auth = getAuthBackend();
  const [user, setUser] = useState<Profile | null>(auth.currentUser());
  useEffect(() => auth.onAuthChange(setUser), [auth]);
  return <Ctx.Provider value={{ user, auth }}>{children}</Ctx.Provider>;
}
export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
```

```tsx
// app/(auth)/_layout.tsx
import { Stack } from "expo-router";
export default function AuthLayout() { return <Stack screenOptions={{ headerShown: false }} />; }
```

Sign-in screen — email + password fields, "Sign in", "Create account", "Continue with Google" (calls `auth.signInGoogle()`); on success `router.replace("/")`. Follow existing theme (`C`, `F`, `glow`) and `Icon`. Inline error text on rejected promise.

```tsx
// app/(auth)/sign-in.tsx  (skeleton — style to match existing screens)
import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../src/stores/session";
import { C, F } from "../../src/theme";

export default function SignIn() {
  const { auth } = useSession();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const go = (fn: () => Promise<unknown>) => fn().then(() => router.replace("/")).catch((e) => setErr(String(e?.message ?? e)));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ color: C.text, fontFamily: F.display, fontSize: 28 }}>Sign in</Text>
      <TextInput placeholder="Email" placeholderTextColor={C.textDim} autoCapitalize="none"
        value={email} onChangeText={setEmail} style={{ color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 12 }} />
      <TextInput placeholder="Password" placeholderTextColor={C.textDim} secureTextEntry
        value={pw} onChangeText={setPw} style={{ color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 12 }} />
      {err && <Text style={{ color: C.red }}>{err}</Text>}
      <TouchableOpacity onPress={() => go(() => auth.signInEmail(email, pw))} style={{ backgroundColor: C.red, borderRadius: 10, padding: 14, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontFamily: F.display }}>Sign in</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => go(() => auth.signUpEmail(email, pw, email.split("@")[0] || "Player"))}>
        <Text style={{ color: C.accent, textAlign: "center" }}>Create account</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => go(() => auth.signInGoogle())} style={{ borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 14, alignItems: "center" }}>
        <Text style={{ color: C.text }}>Continue with Google</Text>
      </TouchableOpacity>
    </View>
  );
}
```

Modify `app/_layout.tsx`: wrap the tree in `<SessionProvider>` and add a redirect — if `useSession().user` is null and the current segment is not `(auth)`, `router.replace("/(auth)/sign-in")`; if user exists and segment is `(auth)`, replace to `/`. Use the `useSegments()` + `useEffect` pattern from expo-router auth docs (SDK 54).

- [ ] **Step 6: `npx tsc --noEmit` clean; manual: launch → sign-in shows when signed out, app shows after sign-in, sign-out returns to sign-in.**

- [ ] **Step 7: Commit**

```bash
git add src/auth/ src/stores/session.tsx "app/(auth)" app/_layout.tsx tests/auth.local.test.ts
git commit -m "feat(auth): local auth backend, session context, sign-in gate"
```

---

### Task 5: Tournament repo (persistence + advance-on-finish)

**Files:**
- Create: `src/repos/tournamentRepo.ts`
- Test: `tests/tournamentRepo.test.ts` (mock `getDb` with an in-memory row store, OR test the pure mapping helpers)

**Interfaces:**
- Consumes: `getDb()`; `buildBracket`, `advanceWinner`, `bracketStatus` (Task 1); `randomUUID` from `expo-crypto`; DDL tables (Task 2).
- Produces:
  - `createTournament(clubId: string, name: string, size: BracketSize, entrants: { clubPlayerId: string; name: string; seed: number }[]): Promise<string>` (returns tournamentId; persists tournament + entrants + built bracket)
  - `getTournament(id: string): Promise<{ tournament: TournamentRow; entrants: Entrant[]; bracket: BracketMatch[] }>`
  - `listTournaments(clubId: string): Promise<TournamentRow[]>`
  - `startBracketMatch(bracketMatchId: string): Promise<string>` (creates a real match via existing `matchRepo.createMatch`, sets `bracket_matches.match_id`, returns matchId)
  - `finishBracketMatch(bracketMatchId: string, winnerEntrant: string): Promise<void>` (calls `advanceWinner`, persists changed rows, updates tournament.status via `bracketStatus`)
  - `type TournamentRow = { id: string; clubId: string; name: string; size: number; status: string; createdAt: number }`
  - Row↔object mappers: `rowToBracketMatch(r)` maps `idx`→`index`.

- [ ] **Step 1: Write failing test for the mapping + advance persistence logic**

Extract pure helpers so they are unit-testable without SQLite:

```typescript
// tests/tournamentRepo.test.ts
import { rowToBracketMatch, bracketMatchToRow, changedRows } from "../src/repos/tournamentRepo";
import type { BracketMatch } from "../src/tournament/types";

test("row<->object maps idx to index", () => {
  const row = { id: "b1", tournament_id: "t1", round: 1, idx: 2, match_id: null, entrant_a: "e1", entrant_b: "e2", winner_entrant: null };
  const obj = rowToBracketMatch(row);
  expect(obj.index).toBe(2);
  expect(bracketMatchToRow(obj)).toEqual(row);
});

test("changedRows returns only rows whose fields differ", () => {
  const a: BracketMatch[] = [{ id: "1", tournamentId: "t", round: 1, index: 0, matchId: null, entrantA: "e1", entrantB: "e2", winnerEntrant: null }];
  const b: BracketMatch[] = [{ ...a[0], winnerEntrant: "e1" }];
  expect(changedRows(a, b).map((m) => m.id)).toEqual(["1"]);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `tournamentRepo.ts`** with the exported pure helpers plus the async DB methods. Pure helpers:

```typescript
import type { BracketMatch } from "../tournament/types";
export type BracketRow = { id: string; tournament_id: string; round: number; idx: number; match_id: string | null; entrant_a: string | null; entrant_b: string | null; winner_entrant: string | null };
export const rowToBracketMatch = (r: BracketRow): BracketMatch => ({ id: r.id, tournamentId: r.tournament_id, round: r.round, index: r.idx, matchId: r.match_id, entrantA: r.entrant_a, entrantB: r.entrant_b, winnerEntrant: r.winner_entrant });
export const bracketMatchToRow = (m: BracketMatch): BracketRow => ({ id: m.id, tournament_id: m.tournamentId, round: m.round, idx: m.index, match_id: m.matchId, entrant_a: m.entrantA, entrant_b: m.entrantB, winner_entrant: m.winnerEntrant });
export function changedRows(before: BracketMatch[], after: BracketMatch[]): BracketMatch[] {
  const b = new Map(before.map((m) => [m.id, m]));
  return after.filter((m) => JSON.stringify(b.get(m.id)) !== JSON.stringify(m));
}
```

Async methods use `getDb()` and `randomUUID()`. `createTournament` builds entrants (assign `id` per entrant via `randomUUID`), calls `buildBracket(entrants, size, tid, randomUUID)`, INSERTs tournament, entrants, and bracket rows in a transaction. `finishBracketMatch` loads bracket, `advanceWinner`, UPDATE only `changedRows`, then recompute `bracketStatus` and UPDATE `tournaments.status`. `startBracketMatch` reads the two entrant names, calls existing `matchRepo.createMatch` (reuse its signature — read `src/repos/matchRepo.ts` first), stores `match_id`.

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/repos/tournamentRepo.ts tests/tournamentRepo.test.ts
git commit -m "feat(tournament): persistence repo with advance-on-finish"
```

---

### Task 6: Publish scoring events to the realtime backend

**Files:**
- Modify: `src/stores/matchStore.ts` (on event append, call `publishEvent`; on match start/finish, `setLive`/`clearLive`)
- Test: `tests/matchStore.publish.test.ts` (inject a fake backend, assert publish called)

**Interfaces:**
- Consumes: `getRealtimeBackend()` (Task 3). To keep it testable, add an optional injector: `__setRealtimeBackendForTest(b)` or read the singleton and mock the module.
- Produces: no new public API; side-effect wiring only.

- [ ] **Step 1: Read `src/stores/matchStore.ts`** to find where events are appended (the `apply`/dispatch path) and where a match is created/ended (`endEarly`).

- [ ] **Step 2: Write failing test** using `jest.mock("../src/realtime")` to supply a fake backend whose `publishEvent` is a `jest.fn()`; drive a point through the store; assert `publishEvent` called with the matchId and the appended event.

```typescript
// tests/matchStore.publish.test.ts
const publishEvent = jest.fn();
jest.mock("../src/realtime", () => ({
  getRealtimeBackend: () => ({ publishEvent, setLive: jest.fn(), clearLive: jest.fn(), subscribe: jest.fn(), listLiveMatches: jest.fn(), onLiveMatchesChange: jest.fn() }),
}));
import { /* store hook or factory */ } from "../src/stores/matchStore";
test("scoring a point publishes the event", async () => {
  // arrange a match in the store, score one point
  // assert publishEvent called once with (matchId, event)
  expect(publishEvent).toHaveBeenCalled();
});
```

(Adapt the arrange section to the store's actual API discovered in Step 1 — Zustand store: call `getState().score(...)` or equivalent.)

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Wire it** — after each successful event append, `getRealtimeBackend().publishEvent(matchId, event).catch(() => {})` (best-effort, non-blocking; the event is already in SQLite via existing persistence). On match create set `setLive({...})`; on `endEarly`/finish `clearLive(matchId)`.

- [ ] **Step 5: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/stores/matchStore.ts tests/matchStore.publish.test.ts
git commit -m "feat(realtime): publish scoring events + live-match presence"
```

---

### Task 7: Spectator watch screens

**Files:**
- Create: `app/(app)/watch/_layout.tsx` (Stack, `unstable_settings.initialRouteName = "index"`)
- Create: `app/(app)/watch/index.tsx` (live-match list)
- Create: `app/(app)/watch/[matchId].tsx` (read-only live view)
- Modify: `app/(app)/_layout.tsx` (add "Live" tab pointing at `watch`)
- Modify: `app/(app)/index.tsx` (Home entry to live list — optional)

**Interfaces:**
- Consumes: `getRealtimeBackend()`, existing `Court.tsx`, the score ribbon markup from `MatchScreen.tsx`, existing `matchRepo` to load initial events for replay, `replay(events)` from engine.
- Produces: no exports (route screens).

- [ ] **Step 1:** `watch/index.tsx` — on mount, `listLiveMatches(clubId)` and subscribe via `onLiveMatchesChange`; render list rows (teamA vs teamB, scoreSummary, live pill using existing color tokens); tap → `router.push(\`/watch/${matchId}\`)`. Empty state: "No live matches".

- [ ] **Step 2:** `watch/[matchId].tsx` — load persisted events (`matchRepo`), `replay` to initial state; `subscribe(matchId, e => setState(prev => applyOne(prev, e)))` (or re-`replay` accumulated events). Render `Court` + score ribbon read-only (no controls). Show server/rally/live badge. On subscribe error or no events: last-known score + "reconnecting…". Unsubscribe on unmount.

- [ ] **Step 3:** Add a "Live" tab in `app/(app)/_layout.tsx` (Ionicons `radio`/`pulse` via `Icon`). Keep bottom-nav ≤5 items — if already at 5, put Live as a Home header action instead.

- [ ] **Step 4:** `npx tsc --noEmit`; manual: start a match on-device, open Live → watch, confirm score updates in real time (same-device via LocalBackend).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/watch" "app/(app)/_layout.tsx" "app/(app)/index.tsx"
git commit -m "feat(watch): live match list + read-only spectator screen"
```

---

### Task 8: Tournament screens (list, create, bracket)

**Files:**
- Create: `app/(app)/tournaments/_layout.tsx` (Stack, `initialRouteName = "index"`)
- Create: `app/(app)/tournaments/index.tsx` (list)
- Create: `app/(app)/tournaments/new.tsx` (create)
- Create: `app/(app)/tournaments/[id].tsx` (bracket)
- Create: `src/components/BracketView.tsx` (SVG columns + connectors)
- Modify: `app/(app)/_layout.tsx` (nav entry to tournaments)

**Interfaces:**
- Consumes: `tournamentRepo` (Task 5), `getTournament`, `startBracketMatch`, `finishBracketMatch`; `bracketStatus`; existing club-player list source (`clubRepo.listAllPlayerNames` / club players); `react-native-svg`; theme tokens.
- Produces: `BracketView({ bracket, entrants, onCellPress })` component.

- [ ] **Step 1:** `tournaments/index.tsx` — `listTournaments(clubId)`, rows with name + size + status color (reuse session status-color pattern). "+ New" → `tournaments/new`.

- [ ] **Step 2:** `tournaments/new.tsx` — name input; size selector (4/8/16/32 segmented); multi-select club players as entrants (auto-seed by selection order, or by existing win stats if available); "Create" → `createTournament(...)` → `router.replace(\`/tournaments/${id}\`)`. Disable Create if selected entrants > size or < 2.

- [ ] **Step 3:** `BracketView.tsx` — render rounds as horizontally-scrolling columns; each cell shows entrant A/B names (resolve id→name via entrants map) and score/winner highlight; `react-native-svg` `<Line>` connectors between a cell and its parent. Live cell: pulsing border (reuse `glow`). Champion: crown Icon on final winner.

- [ ] **Step 4:** `tournaments/[id].tsx` — `getTournament(id)`; render `BracketView`. Cell press logic: if cell has `matchId` and match live → `router.push(\`/watch/${matchId}\`)`; if both entrants present and no match → confirm "Start match" → `startBracketMatch(cellId)` → open scorer (`/score/${matchId}` or existing match route). On scorer finish, the match-finish path must call `finishBracketMatch(cellId, winnerEntrant)` — wire via a return param or a post-match check that maps `matchId`→bracket cell. Disabled (no-op) when a cell is missing an entrant.

- [ ] **Step 5:** Add nav entry (tab or Home card) to tournaments in `app/(app)/_layout.tsx`, respecting the ≤5 bottom-nav rule.

- [ ] **Step 6:** `npx tsc --noEmit`; manual end-to-end: create 4-player tournament → start R1 match → score to completion → winner auto-advances in bracket → finish final → champion crown shows.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/tournaments" src/components/BracketView.tsx "app/(app)/_layout.tsx"
git commit -m "feat(tournament): list, create, and live bracket screens"
```

---

## Self-Review

**Spec coverage:**
- Live spectator view (A) → Tasks 3, 6, 7. ✅
- Single-elim tournaments (B) → Tasks 1, 2, 5, 8. ✅
- Club-gated auth (email+Google, dummy now) → Task 4. ✅
- Swappable backends → Tasks 3, 4 (interface + Local impl + singleton provider). ✅
- Data model (3 tables) → Task 2. ✅
- Offline queue / best-effort publish → Task 6 (`.catch`, SQLite-first). ✅
- Testing gate → every task ends on `tsc + jest`; pure engines fully unit-tested. ✅
- YAGNI cuts (no drag-seed, double-elim, public links, push) → not present in any task. ✅

**Type consistency:** `BracketMatch.index` (object) ↔ `idx` (DB column) mapped explicitly in Tasks 2/5. `Entrant.id` used as `entrantA/entrantB/winnerEntrant` throughout Tasks 1/5/8. `RealtimeBackend`/`AuthBackend` method names identical across definition (Tasks 3/4) and consumers (Tasks 6/7/8).

**Deferred/user dependencies:** Supabase project + Google OAuth client IDs — non-blocking; Local implementations run today. Documented in spec.

---

## Notes for the implementer

- Read `src/repos/matchRepo.ts`, `src/stores/matchStore.ts`, `src/screens/MatchScreen.tsx`, `src/components/Court.tsx`, and `app/(app)/_layout.tsx` before Tasks 5–8 — reuse their exact signatures and styling; do not restyle.
- Expo Router auth-gate pattern (SDK 54): use `useSegments()` + `useRouter()` in `app/_layout.tsx` inside `SessionProvider`.
- `clubId`: reuse whatever the app currently uses to scope the active club (check `clubRepo`/session). If none is threaded yet, pass the current club id from the active club context.
