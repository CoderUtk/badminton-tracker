# Guest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person use the app without an account: play/score a quick match (stored locally only) and spectate a tournament via a pasted link or id, with nothing else reachable.

**Architecture:** Guest = a Supabase anonymous session (`supabase.auth.signInAnonymously()`). `Gate` in `app/_layout.tsx` gains an anonymous branch that skips the display-name step and confines routing to an allowlist, redirecting anywhere else to a new `/guest` shell. Quick match reuses the existing `new-match` → `score/[matchId]` flow untouched (it's already local-only for `club_id = null`). Spectate reuses the existing `join/tournament/[id]/spectator` screen untouched, fed by a new paste-a-link screen.

**Tech Stack:** React Native / Expo Router (TypeScript), Supabase JS client, `expo-secure-store` for local persistence (already a project dependency — no new dependency added), `ts-jest` for tests.

## Global Constraints

- Guest mode adds **zero backend/RLS changes** — the spectator RPC (`tournament_spectator_view`) is already granted to `authenticated`, and an anonymous Supabase session satisfies that.
- No new npm dependency: guest match-id persistence uses `expo-secure-store` (already used by `src/lib/supabase.ts`), not `AsyncStorage` (not currently a project dependency).
- Guest is restricted to exactly these route prefixes: `/guest`, `/guest/spectate`, `/guest/matches`, `/new-match`, `/score/[matchId]`, `/join/tournament/[id]/spectator`. Everything else redirects an anonymous session to `/guest`.
- No account-upgrade path, no post-match upsell prompt, no short tournament join code — all explicitly out of scope per `docs/superpowers/specs/2026-08-05-guest-mode-design.md`.

---

### Task 1: Gate routing for anonymous sessions

**Files:**
- Create: `src/lib/gateRedirect.ts`
- Test: `tests/gateRedirect.test.ts`
- Modify: `app/_layout.tsx:48-99` (the `Gate` function) and `app/_layout.tsx:148-159` (the `Stack` screen list)

**Interfaces:**
- Produces: `isGuestAllowedSegments(segments: string[]): boolean` — pure predicate used by `Gate` to decide whether an anonymous session may stay on its current route.

- [ ] **Step 1: Write the failing test**

Create `tests/gateRedirect.test.ts`:

```ts
import { isGuestAllowedSegments } from "../src/lib/gateRedirect";

test("guest shell and its sub-routes are allowed", () => {
  expect(isGuestAllowedSegments(["guest"])).toBe(true);
  expect(isGuestAllowedSegments(["guest", "spectate"])).toBe(true);
  expect(isGuestAllowedSegments(["guest", "matches"])).toBe(true);
});

test("quick match screens are allowed", () => {
  expect(isGuestAllowedSegments(["new-match"])).toBe(true);
  expect(isGuestAllowedSegments(["score", "[matchId]"])).toBe(true);
});

test("only the spectator join route is allowed, not player or scorer", () => {
  expect(isGuestAllowedSegments(["join", "tournament", "t-1", "spectator"])).toBe(true);
  expect(isGuestAllowedSegments(["join", "tournament", "t-1"])).toBe(false);
  expect(isGuestAllowedSegments(["join", "tournament", "t-1", "scorer"])).toBe(false);
  expect(isGuestAllowedSegments(["join", "club", "c-1"])).toBe(false);
});

test("app tabs and auth screens are not allowed", () => {
  expect(isGuestAllowedSegments(["(app)"])).toBe(false);
  expect(isGuestAllowedSegments(["(auth)"])).toBe(false);
  expect(isGuestAllowedSegments(["welcome"])).toBe(false);
  expect(isGuestAllowedSegments([])).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gateRedirect.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/gateRedirect'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/gateRedirect.ts`:

```ts
/**
 * Route prefixes an anonymous (guest) Supabase session may stay on. Gate
 * redirects any anonymous session outside these to /guest. Kept as a pure
 * function of route segments (expo-router's useSegments() shape) so it's
 * testable without rendering the router.
 */
export function isGuestAllowedSegments(segments: string[]): boolean {
  if (segments[0] === "guest") return true;
  if (segments[0] === "new-match") return true;
  if (segments[0] === "score") return true;
  if (segments[0] === "join" && segments[1] === "tournament" && segments[3] === "spectator") return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gateRedirect.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Wire it into Gate**

In `app/_layout.tsx`, add the import near the top with the other `src/lib` imports:

```ts
import { isGuestAllowedSegments } from "../src/lib/gateRedirect";
```

Replace the profile-loading `useEffect` (currently lines 59-66) so it skips the profile lookup entirely for anonymous sessions — an anonymous user never has a `profiles` row, and there's no reason to query for one:

```ts
useEffect(() => {
  if (!session || session.user.is_anonymous) { setNeedsName(undefined); return; }
  let live = true;
  void getMyProfile().then((p) => {
    if (live) setNeedsName(p !== null && !p.displayNameSet);
  });
  return () => { live = false; };
}, [session, profileTick]);
```

Replace the routing `useEffect` (currently lines 68-96) to add the anonymous branch between the "no session" branch and the "needs name" branch:

```ts
useEffect(() => {
  if (loading) return;
  const inAuth = segments[0] === "(auth)";
  const inWelcome = segments[0] === "welcome";
  if (!session) {
    if (!inAuth) {
      // Remember where they were headed; Gate replays it once signed in.
      if (segments[0] === "join") setPendingLink(pathname);
      router.replace("/sign-in");
    }
    return;
  }
  if (session.user.is_anonymous) {
    // Guests skip the display-name step entirely and are confined to a
    // small allowlist of routes — everything else bounces to the guest home.
    if (inAuth || inWelcome || !isGuestAllowedSegments(segments)) {
      router.replace("/guest");
    }
    return;
  }
  if (needsName === undefined) return; // profile still loading
  if (needsName) {
    if (!inWelcome) {
      // Park the join destination for welcome's onContinue to replay once a
      // display name is set.
      if (segments[0] === "join") setPendingLink(pathname);
      router.replace("/welcome");
    }
    return;
  }
  if (inAuth || inWelcome) {
    const path = consumePendingLink();
    const target = path ? parseJoinTarget(path) : null;
    router.replace(target ? joinRouteFor(target) : "/");
    return;
  }
}, [session, loading, needsName, segments, router]);
```

Add a `Stack.Screen` entry for the guest shell alongside the other `headerShown: false` entries (near `welcome`, currently around line 150):

```tsx
<Stack.Screen name="guest" options={{ headerShown: false }} />
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/gateRedirect.ts tests/gateRedirect.test.ts app/_layout.tsx
git commit -m "feat(guest): route anonymous sessions to a guest allowlist in Gate"
```

---

### Task 2: `parseJoinTarget` accepts a bare tournament id

**Files:**
- Modify: `src/lib/joinLink.ts:29-78` (`parseJoinTarget`)
- Test: `tests/joinLink.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseJoinTarget` now also resolves a bare UUID (no `join/tournament/` prefix) to `{ kind: "tournament", id, role: "player" }`. The guest spectate screen (Task 6) overrides `role` to `"spectator"` itself — this function's default role for a bare id stays `"player"`, consistent with every other unqualified link it already parses.

- [ ] **Step 1: Write the failing test**

Add to `tests/joinLink.test.ts`:

```ts
test("a bare tournament UUID with no join/ prefix resolves to a tournament target", () => {
  expect(parseJoinTarget("3fa85f64-5717-4562-b3fc-2c963f66afa6"))
    .toEqual({ kind: "tournament", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", role: "player" });
});

test("a bare non-UUID word is not a join target", () => {
  expect(parseJoinTarget("smash-cup-2026")).toBeNull();
  expect(parseJoinTarget("hello")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/joinLink.test.ts`
Expected: FAIL on the new "bare tournament UUID" test — `parseJoinTarget` currently returns `null` for input with no `join` segment.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/joinLink.ts`, add a UUID matcher near the top of the file (after the existing exports, before `parseJoinTarget`):

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

Inside `parseJoinTarget`, immediately before the final `return null;` (after the `while (at !== -1)` loop), add:

```ts
  // No "join/..." segment found. A bare tournament id (pasted straight from
  // the guest spectate screen, no link wrapper) is still a valid target.
  if (parts.length === 1 && UUID_RE.test(parts[0])) {
    return { kind: "tournament", id: parts[0], role: "player" };
  }

  return null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/joinLink.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add src/lib/joinLink.ts tests/joinLink.test.ts
git commit -m "feat(joinLink): parse a bare tournament UUID with no link wrapper"
```

---

### Task 3: Guest match-id tracking (`guestMatches`)

**Files:**
- Create: `src/lib/guestMatches.ts`
- Test: `tests/guestMatches.test.ts`

**Interfaces:**
- Produces:
  - `recordGuestMatch(matchId: string): Promise<void>`
  - `getGuestMatchIds(): Promise<string[]>` — newest first
  - `clearGuestMatchIds(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/guestMatches.test.ts`:

```ts
const store = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  deleteItemAsync: (key: string) => { store.delete(key); return Promise.resolve(); },
}));

import { recordGuestMatch, getGuestMatchIds, clearGuestMatchIds } from "../src/lib/guestMatches";

beforeEach(() => store.clear());

test("returns an empty list when nothing has been recorded", async () => {
  expect(await getGuestMatchIds()).toEqual([]);
});

test("records a match id and returns it", async () => {
  await recordGuestMatch("m-1");
  expect(await getGuestMatchIds()).toEqual(["m-1"]);
});

test("newest recorded match comes first", async () => {
  await recordGuestMatch("m-1");
  await recordGuestMatch("m-2");
  expect(await getGuestMatchIds()).toEqual(["m-2", "m-1"]);
});

test("clear empties the list", async () => {
  await recordGuestMatch("m-1");
  await clearGuestMatchIds();
  expect(await getGuestMatchIds()).toEqual([]);
});

test("caps the stored list at 40 ids, dropping the oldest", async () => {
  for (let i = 0; i < 41; i++) await recordGuestMatch(`m-${i}`);
  const ids = await getGuestMatchIds();
  expect(ids).toHaveLength(40);
  expect(ids[0]).toBe("m-40");
  expect(ids).not.toContain("m-0");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/guestMatches.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/guestMatches'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/guestMatches.ts`:

```ts
import * as SecureStore from "expo-secure-store";

const KEY = "guest_match_ids";
const MAX = 40;

/** Record a quick-match id created during the current guest session, newest first. */
export async function recordGuestMatch(matchId: string): Promise<void> {
  const ids = await getGuestMatchIds();
  await SecureStore.setItemAsync(KEY, JSON.stringify([matchId, ...ids].slice(0, MAX)));
}

/** Match ids created during the current guest session, newest first. */
export async function getGuestMatchIds(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

/** Called when leaving guest mode (or starting a fresh guest session) so history doesn't leak across sessions. */
export async function clearGuestMatchIds(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/guestMatches.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/guestMatches.ts tests/guestMatches.test.ts
git commit -m "feat(guest): track quick-match ids created in the current guest session"
```

---

### Task 4: "Continue as guest" on the sign-in screen

**Files:**
- Modify: `app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `supabase.auth.signInAnonymously()` (Supabase JS client, already imported in this file as `supabase`).

- [ ] **Step 1: Add the handler**

In `app/(auth)/sign-in.tsx`, add this function alongside `passwordSignIn`/`googleSignIn` (after `googleSignIn`, before the `if (!supabase)` guard):

```ts
const continueAsGuest = async () => {
  if (!supabase) return;
  setBusy(true);
  const { error } = await supabase.auth.signInAnonymously();
  setBusy(false);
  if (error) toast(error.message || "Could not continue as guest", "error");
  // On success, Gate's session listener redirects to /guest automatically.
};
```

- [ ] **Step 2: Add the button**

In the same file, add a guest link below the closing `</PressableScale>` of the Google button (still inside `s.card`, before the closing `</View>`):

```tsx
          <Pressable onPress={continueAsGuest} disabled={busy} hitSlop={8} style={{ marginTop: 4 }}>
            <Text style={s.link}>Continue as guest</Text>
          </Pressable>
```

- [ ] **Step 3: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/sign-in.tsx"
git commit -m "feat(guest): add Continue as guest to the sign-in screen"
```

---

### Task 5: Guest shell screen

**Files:**
- Create: `app/guest.tsx`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`), `clearGuestMatchIds` (Task 3, `src/lib/guestMatches.ts`).

- [ ] **Step 1: Write the screen**

Create `app/guest.tsx`:

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { clearGuestMatchIds } from "../src/lib/guestMatches";
import Icon from "../src/components/Icon";
import Logo from "../src/components/Logo";
import PressableScale from "../src/components/PressableScale";
import { C, F } from "../src/theme";

export default function GuestHome() {
  const router = useRouter();

  const signIn = async () => {
    await clearGuestMatchIds();
    await supabase?.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Logo size={48} />
        <Text style={s.eyebrow}>GUEST</Text>
        <Text style={s.headline}>Play now,{"\n"}no account needed</Text>
      </View>

      <PressableScale style={s.card} onPress={() => router.push("/new-match")}>
        <Icon name="play" color={C.red} size={28} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>Quick match</Text>
          <Text style={s.cardSub}>Score a match now. Saved on this phone only.</Text>
        </View>
        <Icon name="chevron-forward" color={C.text2} size={20} />
      </PressableScale>

      <PressableScale style={s.card} onPress={() => router.push("/guest/spectate")}>
        <Icon name="trophy-outline" color={C.accent} size={28} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>Spectate a tournament</Text>
          <Text style={s.cardSub}>Paste a link or tournament id to watch live.</Text>
        </View>
        <Icon name="chevron-forward" color={C.text2} size={20} />
      </PressableScale>

      <PressableScale style={s.card} onPress={() => router.push("/guest/matches")}>
        <Icon name="time-outline" color={C.text2} size={28} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>My matches</Text>
          <Text style={s.cardSub}>Quick matches you've scored this session.</Text>
        </View>
        <Icon name="chevron-forward" color={C.text2} size={20} />
      </PressableScale>

      <PressableScale style={s.signIn} onPress={signIn}>
        <Text style={s.signInText}>Sign in for clubs, tournaments, and more</Text>
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 22, gap: 16, justifyContent: "center" },
  hero: { alignItems: "center", gap: 8, marginBottom: 12 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  headline: { color: C.text, fontFamily: F.display, fontSize: 24, lineHeight: 30, textAlign: "center" },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.card,
    borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16,
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  cardSub: { color: C.text2, fontFamily: F.body, fontSize: 13, lineHeight: 18 },
  signIn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  signInText: { color: C.accent, fontFamily: F.medium, fontSize: 14 },
});
```

- [ ] **Step 2: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/guest.tsx
git commit -m "feat(guest): add the guest shell screen"
```

---

### Task 6: Spectate entry screen

**Files:**
- Create: `app/guest/spectate.tsx`

**Interfaces:**
- Consumes: `parseJoinTarget`, `joinRouteFor` (`src/lib/joinLink.ts`, Task 2 extends `parseJoinTarget`), `toast` (`src/lib/toast.ts`).

- [ ] **Step 1: Write the screen**

Create `app/guest/spectate.tsx`:

```tsx
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { parseJoinTarget, joinRouteFor } from "../../src/lib/joinLink";
import { toast } from "../../src/lib/toast";
import FormScreen from "../../src/components/FormScreen";
import PressableScale from "../../src/components/PressableScale";
import { C, F } from "../../src/theme";

export default function GuestSpectate() {
  const router = useRouter();
  const [input, setInput] = useState("");

  const go = () => {
    const target = parseJoinTarget(input.trim());
    if (!target || target.kind !== "tournament") {
      toast("Couldn't find a tournament there. Check the link and try again.", "error");
      return;
    }
    router.push(joinRouteFor({ ...target, role: "spectator" }));
  };

  return (
    <FormScreen contentContainerStyle={s.scroll}>
      <View style={s.hero}>
        <Text style={s.eyebrow}>SPECTATE</Text>
        <Text style={s.headline}>Watch a tournament</Text>
        <Text style={s.sub}>Paste the share link or tournament id someone sent you.</Text>
      </View>

      <TextInput
        style={s.input}
        placeholder="Link or tournament id"
        placeholderTextColor={C.text3}
        autoCapitalize="none"
        autoCorrect={false}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={go}
        returnKeyType="go"
      />

      <PressableScale style={[s.cta, !input.trim() && s.off]} disabled={!input.trim()} onPress={go}>
        <Text style={s.ctaText}>Watch</Text>
      </PressableScale>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 16 },
  hero: { gap: 8, marginBottom: 4 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  headline: { color: C.text, fontFamily: F.display, fontSize: 22 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, lineHeight: 21 },
  input: {
    backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontFamily: F.body,
  },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
});
```

- [ ] **Step 2: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/guest/spectate.tsx
git commit -m "feat(guest): add the spectate-by-link entry screen"
```

---

### Task 7: Guest match history screen

**Files:**
- Create: `app/guest/matches.tsx`

**Interfaces:**
- Consumes: `getGuestMatchIds` (Task 3), `getMatch`, `MatchRecord` (`src/repos/matchRepo.ts`, existing).

- [ ] **Step 1: Write the screen**

Create `app/guest/matches.tsx`:

```tsx
import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getGuestMatchIds } from "../../src/lib/guestMatches";
import { getMatch, MatchRecord } from "../../src/repos/matchRepo";
import Icon from "../../src/components/Icon";
import PressableScale from "../../src/components/PressableScale";
import { C, F } from "../../src/theme";

const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
const format = (m: MatchRecord) =>
  `${m.config.matchType === "singles" ? "Singles" : "Doubles"} · ${m.config.pointsToWin} pts`;

export default function GuestMatches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const ids = await getGuestMatchIds();
        const rows = await Promise.all(ids.map((id) => getMatch(id)));
        if (live) setMatches(rows.filter((m): m is MatchRecord => m !== null));
      })();
      return () => { live = false; };
    }, [])
  );

  if (matches.length === 0) {
    return (
      <View style={s.emptyRoot}>
        <Icon name="badminton" color={C.text2} size={48} />
        <Text style={s.emptyTitle}>No matches yet</Text>
        <Text style={s.emptyText}>Quick matches you score this session show up here.</Text>
        <PressableScale style={s.emptyCta} onPress={() => router.push("/new-match")}>
          <Icon name="play" color={C.text} size={18} />
          <Text style={s.emptyCtaText}>Start a match</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={s.list}
      data={matches}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => (
        <PressableScale
          style={[s.card, item.status === "live" && s.cardLive]}
          onPress={() => router.push(`/score/${item.id}`)}
        >
          <Text style={s.format}>{format(item)}</Text>
          <Text style={s.teamName} numberOfLines={1}>{names(item.side_a)}</Text>
          <Text style={s.vs}>vs</Text>
          <Text style={s.teamName} numberOfLines={1}>{names(item.side_b)}</Text>
          {item.status === "live" && <Text style={s.liveBadge}>● LIVE — tap to resume</Text>}
        </PressableScale>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 4 },
  cardLive: { borderColor: C.green },
  format: { color: C.text2, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  teamName: { color: C.text, fontSize: 16, fontWeight: "700" },
  vs: { color: C.text3, fontSize: 12 },
  liveBadge: { color: C.green, fontSize: 12, fontWeight: "900", marginTop: 4 },
  emptyRoot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24, backgroundColor: C.bg },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "900", marginTop: 4, fontFamily: F.display },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 8 },
  emptyCta: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 14, minHeight: 52, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { color: C.text, fontSize: 17, fontWeight: "800" },
});
```

- [ ] **Step 2: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/guest/matches.tsx
git commit -m "feat(guest): add the guest match history screen"
```

---

### Task 8: Record quick matches created as a guest

**Files:**
- Modify: `app/new-match.tsx`

**Interfaces:**
- Consumes: `recordGuestMatch` (Task 3, `src/lib/guestMatches.ts`), `useSession` (`src/stores/session.tsx`, existing).

- [ ] **Step 1: Wire it into `start()`**

In `app/new-match.tsx`, add these imports at the top (alongside the existing ones):

```ts
import { useSession } from "../src/stores/session";
import { recordGuestMatch } from "../src/lib/guestMatches";
```

Add the hook inside the component, alongside the other `useState` calls:

```ts
const { session } = useSession();
```

Modify `start()` (currently lines 109-120) to record the match id when the session is anonymous:

```ts
const start = async () => {
  setStarting(true);
  try {
    const config = buildConfig();
    const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
    const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
    if (session?.user.is_anonymous) await recordGuestMatch(id);
    router.replace(`/score/${id}`);
  } catch (e) {
    toast((e as Error).message || "Could not start the match", "error");
    setStarting(false);
  }
};
```

- [ ] **Step 2: Verify the app builds**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add app/new-match.tsx
git commit -m "feat(guest): record quick matches created during a guest session"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: all suites pass, including the new `gateRedirect.test.ts`, the extended `joinLink.test.ts`, and `guestMatches.test.ts`.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual walkthrough**

Start the app (`npx expo start`) and confirm:
1. Sign-in screen shows "Continue as guest"; tapping it lands on `/guest` with no display-name prompt.
2. From `/guest`, "Quick match" reaches `new-match` → scoring works → match completes normally.
3. From `/guest`, "My matches" shows the quick match just played; tapping a live one resumes it.
4. From `/guest`, "Spectate a tournament" accepts a pasted share link (get one from a real signed-in account's tournament share screen) and reaches the read-only bracket view.
5. Deep-linking a guest to a player-join or scorer-join URL bounces back to `/guest` instead of opening that screen.
6. "Sign in for clubs, tournaments, and more" signs out of the guest session and returns to `/sign-in`; going guest again afterward shows an empty "My matches" (history didn't leak across guest sessions).

- [ ] **Step 4: Update graphify**

Run: `graphify update .`
