# Tab Tour Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 6-page first-run tour (welcome + Home/Sessions/Matches/Tournaments/Profile) shown once after a new named user finishes `welcome.tsx`, replayable from Profile.

**Architecture:** A new `app/tour.tsx` expo-router screen renders a horizontally paged `Animated.ScrollView` of 6 pages. `react-native-reanimated`'s scroll handler drives per-page fade/slide-in and a dot indicator; no new paging library. A small SecureStore-backed module (`src/lib/tabTour.ts`) persists the "seen" flag, following the exact pattern already used by `src/lib/lastLineup.ts` and `src/lib/guestMatches.ts`. `welcome.tsx` is the only entry point wired to check the flag; Profile gets a manual replay row.

**Tech Stack:** React Native, Expo Router, react-native-reanimated (already a dependency, no new packages), expo-secure-store (already a dependency).

## Global Constraints

- No new npm dependencies — reuse `react-native-reanimated`, `expo-secure-store`, `expo-linear-gradient`, existing `Icon`/`Logo`/`PressableScale`/`FormScreen` components.
- Only the 5 visible tab-bar items get a page: Home, Sessions, Matches, Tournaments, Profile. Clubs and Watch are excluded (hidden tabs, `href: null`).
- New persisted key name: `hasSeenTabTour` (never reuse or rename `completeOnboarding`, which is the existing display-name/age/hand step).
- Theme tokens only — `C`, `F`, `GRAD`, `glow`, `space`, `radius` from `src/theme.ts`. No hardcoded hex/fonts.
- Respect `useReducedMotion()` (from `react-native-reanimated`) exactly like `src/components/AnimatedSplash.tsx` already does: motion drops out, content still fully renders.
- Copy, verbatim:
  - Home — "Your next session and quick stats, at a glance."
  - Sessions — "Plan practice, track attendance, run drills."
  - Matches — "Score live matches, keep history, see form."
  - Tournaments — "Run brackets, track standings, share results."
  - Profile — "Your stats, badges, and account settings."
  - Welcome page headline: "Welcome to CourtSide"; body: "A quick look at what you can do."
  - Last-page CTA label: "Get started". Every other page's forward button: "Next".

---

### Task 1: `hasSeenTabTour` persistence module

**Files:**
- Create: `src/lib/tabTour.ts`
- Test: `tests/tabTour.test.ts`

**Interfaces:**
- Produces: `hasSeenTabTour(): Promise<boolean>`, `setSeenTabTour(): Promise<void>` — both used by Task 3 (`app/tour.tsx`) and Task 4 (`app/welcome.tsx`).

- [ ] **Step 1: Write the failing test**

Create `tests/tabTour.test.ts`:

```ts
// node test env can't parse the real react-native package (Flow/ESM syntax);
// stub just enough for tabTour's Platform.OS check to take the native
// (SecureStore) branch, matching the mock below — same pattern as guestMatches.test.ts.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const store = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(store.get(key) ?? null),
  setItemAsync: (key: string, value: string) => { store.set(key, value); return Promise.resolve(); },
  deleteItemAsync: (key: string) => { store.delete(key); return Promise.resolve(); },
}));

import { hasSeenTabTour, setSeenTabTour } from "../src/lib/tabTour";

beforeEach(() => store.clear());

test("returns false when the flag has never been set", async () => {
  expect(await hasSeenTabTour()).toBe(false);
});

test("returns true after setSeenTabTour resolves", async () => {
  await setSeenTabTour();
  expect(await hasSeenTabTour()).toBe(true);
});

test("persists across repeated reads", async () => {
  await setSeenTabTour();
  expect(await hasSeenTabTour()).toBe(true);
  expect(await hasSeenTabTour()).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/tabTour.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/tabTour'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tabTour.ts`:

```ts
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "has_seen_tab_tour_v1";

// expo-secure-store has no native module on web, and the web build runs
// every visitor as a guest — mirror the fallback used by lastLineup.ts and
// guestMatches.ts.
const store = {
  async get(key: string): Promise<string | null> {
    return Platform.OS === "web" ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
};

/** Whether the first-run tab tour has already been shown on this device. Never throws. */
export async function hasSeenTabTour(): Promise<boolean> {
  try {
    return (await store.get(KEY)) === "1";
  } catch {
    return false;
  }
}

/** Marks the tab tour as seen. Never throws — storage is best effort. */
export async function setSeenTabTour(): Promise<void> {
  try {
    await store.set(KEY, "1");
  } catch {
    // A storage failure must never block finishing the tour.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/tabTour.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tabTour.ts tests/tabTour.test.ts
git commit -m "feat: add hasSeenTabTour persistence"
```

---

### Task 2: Tour page content and copy

**Files:**
- Create: `src/lib/tourPages.ts`
- Test: `tests/tourPages.test.ts`

**Interfaces:**
- Consumes: `IconName` type from `src/components/Icon.tsx`.
- Produces: `TourPage` type (`{ key: string; icon: IconName | null; headline: string; body: string }`) and `TOUR_PAGES: TourPage[]` (length 6, first entry `icon: null`) — consumed by Task 3 (`app/tour.tsx`).

- [ ] **Step 1: Write the failing test**

Create `tests/tourPages.test.ts`:

```ts
import { TOUR_PAGES } from "../src/lib/tourPages";

test("has exactly 6 pages: welcome plus the 5 visible tabs", () => {
  expect(TOUR_PAGES).toHaveLength(6);
  expect(TOUR_PAGES.map((p) => p.key)).toEqual([
    "welcome", "home", "sessions", "matches", "tournaments", "profile",
  ]);
});

test("the welcome page has no tab icon", () => {
  expect(TOUR_PAGES[0].icon).toBeNull();
});

test("every tab page has an icon and non-empty headline and body", () => {
  for (const page of TOUR_PAGES.slice(1)) {
    expect(page.icon).not.toBeNull();
    expect(page.headline.length).toBeGreaterThan(0);
    expect(page.body.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/tourPages.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/tourPages'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tourPages.ts`:

```ts
import type { IconName } from "../components/Icon";

export type TourPage = {
  key: string;
  icon: IconName | null;
  headline: string;
  body: string;
};

/** Welcome page plus one page per visible tab-bar item, in tab-bar order. */
export const TOUR_PAGES: TourPage[] = [
  { key: "welcome", icon: null, headline: "Welcome to CourtSide", body: "A quick look at what you can do." },
  { key: "home", icon: "home", headline: "Home", body: "Your next session and quick stats, at a glance." },
  { key: "sessions", icon: "calendar", headline: "Sessions", body: "Plan practice, track attendance, run drills." },
  { key: "matches", icon: "badminton", headline: "Matches", body: "Score live matches, keep history, see form." },
  { key: "tournaments", icon: "trophy", headline: "Tournaments", body: "Run brackets, track standings, share results." },
  { key: "profile", icon: "person", headline: "Profile", body: "Your stats, badges, and account settings." },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/tourPages.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tourPages.ts tests/tourPages.test.ts
git commit -m "feat: add tour page content"
```

---

### Task 3: `app/tour.tsx` screen

**Files:**
- Create: `app/tour.tsx`
- Modify: `app/_layout.tsx:284-289` (register the route in the root `Stack`, next to `welcome`)

**Interfaces:**
- Consumes: `hasSeenTabTour`/`setSeenTabTour` from `src/lib/tabTour.ts` (Task 1); `TOUR_PAGES`, `TourPage` from `src/lib/tourPages.ts` (Task 2); `Icon` (`src/components/Icon.tsx`); `Logo` (`src/components/Logo.tsx`); `PressableScale` (`src/components/PressableScale.tsx`); `useScreenInsets` (`src/hooks/useScreenInsets.ts`); `C`, `F`, `GRAD`, `glow`, `space`, `radius` (`src/theme.ts`).
- Produces: route `/tour`, accepting an optional `target` search param (string, the path to land on after finishing — defaults to `/`). Read via `useLocalSearchParams<{ target?: string }>()`, same pattern as `app/new-match.tsx`.

- [ ] **Step 1: Write the screen**

Create `app/tour.tsx`:

```tsx
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle,
  useReducedMotion, useSharedValue,
} from "react-native-reanimated";
import Icon from "../src/components/Icon";
import Logo from "../src/components/Logo";
import PressableScale from "../src/components/PressableScale";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
import { setSeenTabTour } from "../src/lib/tabTour";
import { TOUR_PAGES, type TourPage } from "../src/lib/tourPages";
import { C, F, GRAD, glow, radius, space } from "../src/theme";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

function TourPageView({
  page, index, scrollX, width, reduced,
}: {
  page: TourPage; index: number; scrollX: Animated.SharedValue<number>; width: number; reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1, transform: [{ translateY: 0 }] };
    const input = [(index - 1) * width, index * width, (index + 1) * width];
    return {
      opacity: interpolate(scrollX.value, input, [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(scrollX.value, input, [16, 0, 16], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[s.page, { width }]}>
      <Animated.View style={[s.pageContent, style]}>
        {page.icon ? (
          <View style={[s.iconRing, glow(C.accent, 20, 0.4)]}>
            <Icon name={page.icon} size={48} color={C.accent} />
          </View>
        ) : (
          <Logo size={56} showWordmark={false} />
        )}
        <Text style={s.headline}>{page.headline}</Text>
        <Text style={s.body}>{page.body}</Text>
      </Animated.View>
    </View>
  );
}

export default function Tour() {
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const { width } = useWindowDimensions();
  const { top, ctaPadding } = useScreenInsets();
  const reduced = useReducedMotion();

  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const scrollRef = React.useRef<ScrollView>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const finish = async () => {
    await setSeenTabTour();
    router.replace((target ?? "/") as never);
  };

  const goNext = () => {
    if (index >= TOUR_PAGES.length - 1) { void finish(); return; }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  const isLast = index === TOUR_PAGES.length - 1;

  return (
    <View style={s.root}>
      {!isLast && (
        <Pressable style={[s.skip, { top: top + space.md }]} onPress={() => void finish()} hitSlop={12}>
          <Text style={s.skipText}>Skip</Text>
        </Pressable>
      )}

      <AnimatedScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {TOUR_PAGES.map((page, i) => (
          <TourPageView key={page.key} page={page} index={i} scrollX={scrollX} width={width} reduced={reduced} />
        ))}
      </AnimatedScrollView>

      <View style={s.dots}>
        {TOUR_PAGES.map((page, i) => (
          <View key={page.key} style={[s.dot, i === index && s.dotOn]} />
        ))}
      </View>

      <View style={{ paddingBottom: ctaPadding, paddingHorizontal: space.lg }}>
        <PressableScale style={[s.ctaWrap]} onPress={goNext}>
          <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
            <Text style={s.ctaText}>{isLast ? "GET STARTED" : "NEXT"}</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  skip: { position: "absolute", right: space.lg, zIndex: 10 },
  skipText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  page: { alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  pageContent: { alignItems: "center", gap: space.md },
  iconRing: {
    width: 96, height: 96, borderRadius: radius.pill, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center",
  },
  headline: { color: C.text, fontFamily: F.display, fontSize: 24, letterSpacing: 0.5, textAlign: "center" },
  body: { color: C.text2, fontFamily: F.body, fontSize: 15, lineHeight: 22, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: space.xs, marginBottom: space.lg },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: C.line },
  dotOn: { backgroundColor: C.red, width: 18 },
  ctaWrap: { borderRadius: radius.lg, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: radius.lg, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
});
```

- [ ] **Step 2: Register the route**

In `app/_layout.tsx`, add a `Stack.Screen` for `tour` immediately after the existing `welcome` entry (around line 286):

```tsx
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="tour" options={{ headerShown: false }} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/tour.tsx` or `app/_layout.tsx`

- [ ] **Step 4: Commit**

```bash
git add app/tour.tsx app/_layout.tsx
git commit -m "feat: add tab tour screen"
```

---

### Task 4: Wire `welcome.tsx` to route into the tour on first run

**Files:**
- Modify: `app/welcome.tsx:5,50-67` (import + `onContinue`)

**Interfaces:**
- Consumes: `hasSeenTabTour` from `src/lib/tabTour.ts` (Task 1); route `/tour` accepting `target` param (Task 3).

- [ ] **Step 1: Update the import**

In `app/welcome.tsx`, change line 6 from:

```ts
import { completeOnboarding, getMyProfile, type Hand } from "../src/repos/profileRepo";
```

to:

```ts
import { completeOnboarding, getMyProfile, type Hand } from "../src/repos/profileRepo";
import { hasSeenTabTour } from "../src/lib/tabTour";
```

- [ ] **Step 2: Update `onContinue`**

Replace the body of `onContinue` (lines 50-67):

```ts
  const onContinue = async () => {
    if (error) { setTouched(true); toast(error, "error"); return; }
    if (!hand) { toast("Choose your playing hand", "error"); return; }
    setBusy(true);
    try {
      const ageValue = age.trim() ? Number(age.trim()) : null;
      await completeOnboarding(name, ageValue, hand);
      // Gate may have re-parked a join destination while this profile lacked a
      // display name — honour it instead of always landing on home.
      const path = consumePendingLink();
      const target = path ? parseJoinTarget(path) : null;
      const destination = target ? joinRouteFor(target) : "/";
      if (await hasSeenTabTour()) {
        router.replace(destination as never);
      } else {
        // First run: show the tab tour, carrying the real destination along so
        // a join link tapped before sign-up still lands correctly once it finishes.
        router.replace({ pathname: "/tour", params: { target: destination } } as never);
      }
    } catch (e) {
      toast((e as Error).message || "Could not save your name", "error");
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/welcome.tsx`

- [ ] **Step 4: Commit**

```bash
git add app/welcome.tsx
git commit -m "feat: route first-run users through the tab tour"
```

---

### Task 5: Replay row in Profile

**Files:**
- Modify: `app/(app)/profile/index.tsx` (add a row after the existing Friends card, around line 409)

**Interfaces:**
- Consumes: route `/tour` (Task 3), defaults `target` param to `/` when omitted.

- [ ] **Step 1: Add the row**

In `app/(app)/profile/index.tsx`, immediately after the closing `</Pressable>` of the Friends card (the block ending at line 409 in the current file), add:

```tsx
      <Pressable style={s.card} onPress={() => router.push("/tour")}>
        <View style={s.reminderRow}>
          <Icon name="information-circle-outline" color={C.red} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Show tab tour</Text>
            <Text style={s.reminderSub}>Replay the app walkthrough.</Text>
          </View>
          <Icon name="chevron-forward" color={C.text2} size={20} />
        </View>
      </Pressable>
```

This reuses the exact `s.card` / `s.reminderRow` / `s.reminderSub` styles the Friends row above it already defines — no new styles needed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `app/(app)/profile/index.tsx`

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/profile/index.tsx"
git commit -m "feat: add tab tour replay row to profile"
```

---

### Task 6: Manual device verification

**Files:** none (verification only, device already connected)

- [ ] **Step 1: Full test suite**

Run: `npx jest`
Expected: all tests pass, including the 6 new ones from Tasks 1-2

- [ ] **Step 2: Launch on the connected device**

Use the mobile-mcp tools to build/launch the dev client on the connected device (`mobile_launch_app`), then sign up a fresh test account (or clear the app's storage first) to reach `welcome.tsx`.

- [ ] **Step 3: Verify first-run flow**

Fill in the welcome form and tap Continue. Confirm: lands on `/tour`, not directly on Home. Screenshot with `mobile_take_screenshot` to confirm the welcome page (Logo, "Welcome to CourtSide") renders correctly.

- [ ] **Step 4: Verify paging and content**

Swipe through all 6 pages. Confirm each tab page shows the correct icon (home/calendar/badminton/trophy/person), headline, and body text from the Global Constraints copy list, and the dot indicator advances. Confirm Skip is visible on pages 1-5 and hidden on page 6, and page 6's button reads "GET STARTED" while 1-5 read "NEXT".

- [ ] **Step 5: Verify finish lands on Home and the flag persists**

Tap "GET STARTED" (or Skip midway). Confirm it lands on Home. Force-quit and relaunch the app, sign back in with the same account: confirm it goes straight to Home, not the tour.

- [ ] **Step 6: Verify replay from Profile**

Navigate to the Profile tab, tap "Show tab tour". Confirm the tour opens again and finishing it returns to Home.

- [ ] **Step 7: Verify the tab bar itself is unaffected**

Confirm the tab bar still shows exactly Home, Sessions, Matches, Tournaments, Profile (5 items) — this feature must not add Clubs/Watch to the visible tab bar.

- [ ] **Step 8: Commit if any fixes were needed during verification**

If Steps 3-7 required code changes, commit them with a message describing what was fixed, e.g.:

```bash
git add <changed files>
git commit -m "fix: <what was wrong and how verification caught it>"
```
