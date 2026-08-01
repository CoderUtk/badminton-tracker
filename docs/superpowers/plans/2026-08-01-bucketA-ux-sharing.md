# Bucket A — UX & Sharing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the local, no-backend UX layer from the future roadmap — an in-app toast/sheet system that replaces Android popups, animated tab switches, a first-open onboarding tour, and share-a-match-to-story.

**Architecture:** A tiny module-level toast store (Sonner-style: `toast()` callable anywhere, one `<Toaster/>` mounted once) plus a props-driven bottom `<Sheet/>`, both built on the already-installed `react-native-reanimated`. Onboarding gates on the `settingsRepo` from Phase 1. Sharing captures a styled off-screen card to an image and hands it to the OS share sheet.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router v6, `react-native-reanimated` (installed), Jest. New deps: `react-native-view-shot`, `expo-sharing` (Task 6 only).

## Global Constraints

- `src/engine/*` untouched.
- No new dependency except `react-native-view-shot` + `expo-sharing` in Task 6; toast/sheet/tabs/onboarding use reanimated already present.
- Native `Alert.alert` is allowed ONLY for destructive confirms ("End match?", "Finish session?", "Delete") and unrecoverable errors. Everything else → `toast` or `<Sheet>`.
- Motion honors reduced-motion; use the Apple-style critically-damped spring already used in `PressableScale` (no `linear`/`ease-in`).
- Follow theme tokens (`C`, `F`, `glow`, `press`), `Icon`, `PressableScale`.
- Gate every task on `npx tsc --noEmit && npm test`.

---

## Task 1: Toast store + Toaster (kill transient popups)

**Files:**
- Create: `src/lib/toast.ts` (store + `toast()` + `useToasts()`)
- Create: `src/components/Toaster.tsx`
- Modify: `app/_layout.tsx` (mount `<Toaster/>` inside `GestureHandlerRootView`, above navigation)
- Test: `tests/toast.test.ts`

**Interfaces:**
- Consumes: nothing (pure store) + reanimated in the component.
- Produces:
  - `type ToastKind = "info" | "success" | "error"`
  - `type Toast = { id: string; message: string; kind: ToastKind }`
  - `toast(message: string, kind?: ToastKind): string` (returns id; auto-dismiss ~3s)
  - `dismissToast(id: string): void`
  - `subscribeToasts(cb: (list: Toast[]) => void): () => void`
  - `useToasts(): Toast[]` (React hook the Toaster uses)

- [ ] **Step 1: Write failing test**

```typescript
// tests/toast.test.ts
import { toast, dismissToast, subscribeToasts } from "../src/lib/toast";

test("toast adds and manual dismiss removes", () => {
  const seen: number[] = [];
  const off = subscribeToasts((l) => seen.push(l.length));
  const id = toast("hi", "success");
  const id2 = toast("bye");
  dismissToast(id);
  dismissToast(id2);
  off();
  expect(seen).toEqual([1, 2, 1, 0]);
});

test("toast auto-dismisses after the timeout", () => {
  jest.useFakeTimers();
  const seen: number[] = [];
  const off = subscribeToasts((l) => seen.push(l.length));
  toast("temp");
  jest.advanceTimersByTime(3500);
  off();
  expect(seen[seen.length - 1]).toBe(0);
  jest.useRealTimers();
});
```

- [ ] **Step 2: Run → FAIL.** `npm test -- toast.test.ts`

- [ ] **Step 3: Implement the store**

```typescript
// src/lib/toast.ts
import { useEffect, useState } from "react";

export type ToastKind = "info" | "success" | "error";
export type Toast = { id: string; message: string; kind: ToastKind };

let toasts: Toast[] = [];
const subs = new Set<(l: Toast[]) => void>();
let seq = 0;
const emit = () => subs.forEach((cb) => cb(toasts));

export function toast(message: string, kind: ToastKind = "info"): string {
  const id = `t${++seq}`;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => dismissToast(id), 3000);
  return id;
}
export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
export function subscribeToasts(cb: (l: Toast[]) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => subscribeToasts(setList), []);
  return list;
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Build the Toaster** — `src/components/Toaster.tsx`: renders `useToasts()` as a stack pinned to the top (below the status bar, `pointerEvents="box-none"`, absolute, high z). Each toast is an `Animated` view that springs in (`translateY` from `-16` + opacity 0 → 0/1, critically damped) and is swipe-up/tap dismissible (calls `dismissToast`). Color the left edge by kind (`C.accent`/`C.green`/`C.red`). Honor reduced-motion (`useReducedMotion` → fade only).

- [ ] **Step 6: Mount it.** In `app/_layout.tsx`, render `<Toaster/>` inside `GestureHandlerRootView`, as a sibling above the router so it overlays all screens.

- [ ] **Step 7: `npx tsc --noEmit` clean.**

- [ ] **Step 8: Commit**

```bash
git add src/lib/toast.ts src/components/Toaster.tsx app/_layout.tsx tests/toast.test.ts
git commit -m "feat(ui): in-app toast system"
```

---

## Task 2: Migrate non-destructive Alerts to toast

**Files (replace `Alert.alert(...)` error/info calls with `toast(...)`):**
- Modify: `app/(app)/index.tsx:36,45`, `app/(app)/tournaments/new.tsx:60`, `app/(app)/tournaments/[id].tsx:58`, `app/new-session.tsx:32`, `app/(auth)/sign-in.tsx:34,47,58`, `app/(app)/sessions/[id].tsx:64`

**Interfaces:** Consumes `toast` (Task 1).

- [ ] **Step 1: Replace error toasts.** For each error/info `Alert.alert(title, message)` above, replace with `toast(message ?? title, "error")` (or `"info"` for non-errors like "Choose a club", "Need N players"). Remove now-unused `Alert` imports where nothing destructive remains in the file. **Do NOT touch** the destructive confirms: `MatchScreen.tsx:55` (End match), `matches/index.tsx:52` (End match), `sessions/[id].tsx:88` (Finish session) — those keep native Alert. Leave `tournaments/[id].tsx:49` (Start match) for Task 3.

- [ ] **Step 2: `npx tsc --noEmit` clean; manual: trigger a create error → toast, not popup.**

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/index.tsx" "app/(app)/tournaments/new.tsx" "app/(app)/tournaments/[id].tsx" app/new-session.tsx "app/(auth)/sign-in.tsx" "app/(app)/sessions/[id].tsx"
git commit -m "refactor(ui): non-destructive Alerts -> toast"
```

---

## Task 3: Bottom Sheet + start-match choice

**Files:**
- Create: `src/components/Sheet.tsx`
- Modify: `app/(app)/tournaments/[id].tsx` (replace the "Start match" `Alert` with a `<Sheet>`)

**Interfaces:**
- Produces: `Sheet({ visible, title, message, actions, onClose })` where `actions: { label: string; onPress: () => void; destructive?: boolean }[]`.

- [ ] **Step 1: Build `Sheet.tsx`** — a bottom sheet: a backdrop `Pressable` (scrim, tap-to-close) + an `Animated` panel that springs up from `translateY(100%)` → `0` (Apple drawer curve, interruptible), drag-down-to-dismiss with momentum (`react-native-gesture-handler` Pan + reanimated), rounded top, `C.card` surface. Renders `title`, optional `message`, and `actions` as full-width `PressableScale` buttons (destructive → `C.red`). Reduced-motion → fade. No unit test (interaction component); tsc-gated + manual.

- [ ] **Step 2: Wire start-match.** In `app/(app)/tournaments/[id].tsx`, replace the `Alert.alert("Start match", ...)` with local `sheet` state and a `<Sheet visible title="Start match" message="Create and score this match now?" actions={[{label:"Start", onPress: doStart}, {label:"Cancel", onPress: close}]}/>`. Keep the `catch` error as a `toast(..., "error")` (from Task 1).

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: tap an empty bracket cell → sheet slides up; Start creates the match.**

- [ ] **Step 4: Commit**

```bash
git add src/components/Sheet.tsx "app/(app)/tournaments/[id].tsx"
git commit -m "feat(ui): bottom sheet + start-match choice (no popup)"
```

---

## Task 4: Tab-switch animation

**Files:**
- Modify: `app/(app)/_layout.tsx`

**Interfaces:** none (nav config).

- [ ] **Step 1: Enable the transition.** In `app/(app)/_layout.tsx`, add to the `Tabs` `screenOptions` the built-in animation (react-navigation bottom-tabs v7, bundled with expo-router SDK 54):

```tsx
<Tabs
  screenOptions={{
    animation: "shift", // animated cross-slide between tabs; "fade" is the calmer alternative
    // ...existing options
  }}
>
```

Prefer `"shift"`; if it reads too strong, use `"fade"`. This uses the library's own animator (no custom reanimated needed and no reduced-motion handling required — the library respects the system setting).

- [ ] **Step 2: `npx tsc --noEmit` clean; manual: switch tabs → smooth transition, not an instant cut.**

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/_layout.tsx"
git commit -m "feat(nav): animated tab transitions"
```

---

## Task 5: First-open onboarding tour

**Files:**
- Create: `app/onboarding.tsx` (full-screen swipeable cards)
- Modify: `app/_layout.tsx` (redirect to onboarding when unseen)
- Uses: `settingsRepo` (`getSetting`/`setSetting`) from Phase 1

**Interfaces:**
- Consumes: `getSetting`, `setSetting` (`src/repos/settingsRepo`).
- Produces: an `ONBOARDING_SEEN_KEY = "onboarding_seen"` constant (add to `settingsRepo`).

- [ ] **Step 1: Add the key.** In `src/repos/settingsRepo.ts`, export `export const ONBOARDING_SEEN_KEY = "onboarding_seen";`.

- [ ] **Step 2: Build the screen.** `app/onboarding.tsx`: a horizontally paged `ScrollView` (`pagingEnabled`) of 4–5 cards (icon + title + one line) explaining Home, Sessions/Matches, Tournaments, Live/Watch, Profile. Page dots. A "Skip" (top-right) and a final "Get started" button; both call `setSetting(ONBOARDING_SEEN_KEY, "1")` then `router.replace("/")`. Style with theme tokens; entrance uses reduced-motion-safe fade.

- [ ] **Step 3: Gate it.** In `app/_layout.tsx`'s `Gate` (or alongside it): after auth resolves and the user is in-app, read `getSetting(ONBOARDING_SEEN_KEY)`; if null and not already on `/onboarding`, `router.replace("/onboarding")`. Register `onboarding` as a `Stack.Screen` (`headerShown:false`). Never show again once the setting is set.

- [ ] **Step 4: `npx tsc --noEmit` clean; manual: fresh install (or clear the setting) → onboarding shows once; after "Get started" it never returns.**

- [ ] **Step 5: Commit**

```bash
git add app/onboarding.tsx app/_layout.tsx src/repos/settingsRepo.ts
git commit -m "feat(onboarding): first-open feature tour"
```

---

## Task 6: Share match to story

**Files:**
- Create: `src/components/ShareCard.tsx` (the styled card)
- Create: `src/lib/shareMatch.ts` (capture + share helper)
- Modify: `app/(app)/matches/[id].tsx` (add a Share action) and replace the `sessions/[id].tsx:152` "Coming soon" placeholder if trivial
- Modify: `package.json`

**Interfaces:**
- Consumes: `react-native-view-shot` (`captureRef`), `expo-sharing`.
- Produces: `ShareCard({ teamA, teamB, scoreLine, subtitle })` (a fixed-size view) and `shareMatchCard(ref): Promise<void>`.

- [ ] **Step 1: Install deps**

```bash
npx expo install react-native-view-shot expo-sharing
```

- [ ] **Step 2: Build `ShareCard.tsx`** — a fixed 1080×1920-ratio (scaled) view: CourtSide wordmark, the two team names, the big final score line, a subtitle (date/club), on the brand gradient (`GRAD`). It renders off-screen (absolute, `pointerEvents="none"`, positioned outside the viewport) so it can be captured without being visible.

- [ ] **Step 3: Capture + share** — `src/lib/shareMatch.ts`:

```typescript
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

export async function shareMatchCard(ref: React.RefObject<any>): Promise<void> {
  const uri = await captureRef(ref, { format: "png", quality: 1 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
}
```

- [ ] **Step 4: Wire the action.** In `app/(app)/matches/[id].tsx`, render a hidden `<ShareCard ref={cardRef} .../>` built from the match record + score summary, and a visible "Share" `PressableScale` that calls `shareMatchCard(cardRef)`; on error `toast("Couldn't share", "error")`. If the `sessions/[id].tsx:152` placeholder maps cleanly to a session card, reuse the same helper; otherwise leave it.

- [ ] **Step 5: `npx tsc --noEmit` clean; manual (device): finish a match → Share → OS share sheet with the card image.**

- [ ] **Step 6: Commit**

```bash
git add src/components/ShareCard.tsx src/lib/shareMatch.ts "app/(app)/matches/[id].tsx" package.json package-lock.json
git commit -m "feat(share): match share card to story via OS share sheet"
```

---

## Self-Review

**Spec coverage (Bucket A):**
- A1 in-app toast/sheet + kill popups → Tasks 1, 2, 3. ✅
- A2 tab-switch animations → Task 4. ✅
- A3 first-open onboarding → Task 5. ✅
- A4 share match to story → Task 6. ✅

**Type consistency:** `ToastKind`/`Toast` identical across `toast.ts` and `Toaster.tsx`. `Sheet` `actions` shape consistent between definition (Task 3) and the start-match caller. `ONBOARDING_SEEN_KEY` defined once in `settingsRepo` (Task 5) and consumed in `_layout`. `DISPLAY_NAME_KEY`/settings API reused unchanged from Phase 1.

**Placeholder scan:** none — pure logic (toast store) is fully coded and tested; interaction components (Toaster/Sheet/ShareCard) specify exact motion, tokens, and behavior; the destructive-Alert exclusions are named by file:line.

**Destructive-confirm exclusions (kept as native Alert, per constraint):** `MatchScreen.tsx:55`, `matches/index.tsx:52`, `sessions/[id].tsx:88`.

**Out of scope (correctly absent):** username, friends, guest players, courts — Buckets B/C/D, separate plans, need Supabase.
