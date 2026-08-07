# Achievement Share-Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player tap any earned badge on the Profile screen to open a popup with a branded share card and a "Share to story" button.

**Architecture:** Reuse the existing share-to-story pipeline (`CardShell`, `captureAndShare`, `shareToInstagramStory`) unmodified. Add one new card component (`BadgeResultCard`), one new popup component (`BadgeSharePopup`), an optional tap prop on `BadgeGrid`, and wiring in `profile.tsx`.

**Tech Stack:** React Native, Expo Router, `react-native-view-shot` (capture), `react-native-share` (IG Stories intent), `expo-sharing` (fallback), existing `src/theme.ts` tokens.

## Global Constraints

- Only earned badges are tappable. Locked/in-progress chips stay inert (no press handler), matching today's `BadgeGrid`.
- No moment-of-unlock auto-popup — out of scope per spec.
- Reuse `CardShell`, `captureAndShare`, `shareToInstagramStory` unmodified — no edits to any of the three.
- This codebase does not unit-test presentational RN components (`jest.config.js`: `testEnvironment: "node"`, comment: "UI is exercised in the app"; see `SessionResultCard.tsx`/`ShareCard.tsx`, neither of which has a test file). Follow that convention: no component test files for `BadgeResultCard`/`BadgeSharePopup`; verify by manual QA instead.

---

### Task 1: `BadgeResultCard` — share card component

**Files:**
- Create: `src/components/share/BadgeResultCard.tsx`

**Interfaces:**
- Consumes: `CardShell` (`src/components/share/CardShell.tsx`, default export, `{ children: React.ReactNode }`), `Icon` (`src/components/Icon.tsx`, default export, `{ name: IconName; size?: number; color?: string }`), theme tokens `C`, `F` from `src/theme.ts`.
- Produces: `BadgeResultCard` default export, `{ badge: { title: string; description: string; icon: string }; playerName: string }` — used by Task 3.

- [ ] **Step 1: Create the component**

```tsx
// src/components/share/BadgeResultCard.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Icon, { type IconName } from "../Icon";
import { C, F } from "../../theme";

export default function BadgeResultCard({
  badge, playerName,
}: {
  badge: { title: string; description: string; icon: string };
  playerName: string;
}) {
  return (
    <CardShell>
      <View style={s.root}>
        <View style={s.iconRing}>
          <Icon name={badge.icon as IconName} color={C.red} size={120} />
        </View>
        <Text style={s.title}>{badge.title}</Text>
        <Text style={s.desc}>{badge.description}</Text>
        <Text style={s.name}>{playerName}</Text>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center", gap: 28 },
  iconRing: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: C.card, borderWidth: 2, borderColor: C.red,
    alignItems: "center", justifyContent: "center",
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 56, letterSpacing: 1, textAlign: "center" },
  desc: { color: C.text2, fontFamily: F.body, fontSize: 26, textAlign: "center", paddingHorizontal: 20 },
  name: { color: C.text3, fontFamily: F.medium, fontSize: 24, marginTop: 12 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `BadgeResultCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/share/BadgeResultCard.tsx
git commit -m "feat(share): add BadgeResultCard for achievement share images"
```

---

### Task 2: `BadgeGrid` — optional tap handler on earned badges

**Files:**
- Modify: `src/components/BadgeGrid.tsx`

**Interfaces:**
- Consumes: `EarnedBadge` type (`src/achievements/types.ts`: `{ id: string; title: string; description: string; icon: string; earned: boolean; progress: number }`).
- Produces: `BadgeGrid` now accepts optional `onPressBadge?: (badge: EarnedBadge) => void` — used by Task 4.

- [ ] **Step 1: Add the prop and wrap earned chips in `Pressable`**

Current file (`src/components/BadgeGrid.tsx`) renders each chip as a plain `View`. Change the signature and the earned-chip wrapper:

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon, { type IconName } from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { C, F, glow } from "../theme";

export default function BadgeGrid({
  badges, onPressBadge,
}: {
  badges: EarnedBadge[];
  onPressBadge?: (badge: EarnedBadge) => void;
}) {
  return (
    <View style={s.grid}>
      {badges.map((b) => {
        const inProgress = !b.earned && b.progress > 0;
        const iconColor = b.earned ? C.red : inProgress ? C.text : C.text3;
        const titleStyle = b.earned ? s.titleEarned : inProgress ? s.titleActive : s.titleLocked;
        const Wrapper = b.earned ? Pressable : View;
        const wrapperProps = b.earned ? { onPress: () => onPressBadge?.(b) } : {};
        return (
          <Wrapper
            key={b.id}
            style={[s.chip, b.earned && s.chipEarned, b.earned && glow(C.red, 10, 0.35)]}
            {...wrapperProps}
          >
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
          </Wrapper>
        );
      })}
    </View>
  );
}
```

Styles (`s = StyleSheet.create({...})`) at the bottom of the file are unchanged — leave them exactly as they are today.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `BadgeGrid.tsx`. (`Pressable`/`View` as a dynamic `Wrapper` component both accept `style`/`children`/`onPress` — TS accepts the union since `wrapperProps` is `{}` or `{ onPress }` and `View` ignores unknown props at the JS level, but if `tsc` complains about the polymorphic component typing, replace the `Wrapper`/`wrapperProps` pattern with an explicit `if (b.earned) { return <Pressable ...>...</Pressable>; } return <View ...>...</View>;` branch instead — same JSX body duplicated once, still simple.)

- [ ] **Step 3: Commit**

```bash
git add src/components/BadgeGrid.tsx
git commit -m "feat(achievements): add optional tap handler for earned badges"
```

---

### Task 3: `BadgeSharePopup` — popup with preview + share button

**Files:**
- Create: `src/components/BadgeSharePopup.tsx`

**Interfaces:**
- Consumes: `BadgeResultCard` (Task 1), `EarnedBadge` type (`src/achievements/types.ts`), `captureAndShare` (`src/lib/share/captureAndShare.ts`, `(viewRef: RefObject<View | null>) => Promise<void>`), `Icon`, theme tokens `C`, `F`, `radius` from `src/theme.ts`.
- Produces: `BadgeSharePopup` default export, `{ badge: EarnedBadge | null; playerName: string; onClose: () => void }` — used by Task 4.

- [ ] **Step 1: Create the component**

```tsx
// src/components/BadgeSharePopup.tsx
import React, { useRef } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import BadgeResultCard from "./share/BadgeResultCard";
import Icon from "./Icon";
import type { EarnedBadge } from "../achievements/types";
import { captureAndShare } from "../lib/share/captureAndShare";
import { C, F, radius } from "../theme";

const CARD_W = 1080;
const CARD_H = 1920;
const PREVIEW_W = Math.min(Dimensions.get("window").width - 64, 320);
const PREVIEW_SCALE = PREVIEW_W / CARD_W;
const PREVIEW_H = CARD_H * PREVIEW_SCALE;

export default function BadgeSharePopup({
  badge, playerName, onClose,
}: {
  badge: EarnedBadge | null;
  playerName: string;
  onClose: () => void;
}) {
  const shareCardRef = useRef<View>(null);

  if (!badge) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFill, s.backdrop]} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.center} pointerEvents="box-none">
        <View style={s.panel}>
          <Text style={s.title}>{badge.title}</Text>
          <View style={[s.previewClip, { width: PREVIEW_W, height: PREVIEW_H }]}>
            <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale: PREVIEW_SCALE }], position: "absolute", left: 0, top: 0 }}>
              <BadgeResultCard badge={badge} playerName={playerName} />
            </View>
          </View>
          <Pressable style={s.shareBtn} onPress={() => void captureAndShare(shareCardRef)}>
            <Icon name="share-social-outline" color={C.text} size={18} />
            <Text style={s.shareText}>Share to story</Text>
          </Pressable>
          <Pressable style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
      <View ref={shareCardRef} collapsable={false} style={s.offscreen}>
        <BadgeResultCard badge={badge} playerName={playerName} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.65)" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  panel: {
    backgroundColor: C.card, borderRadius: radius.lg, borderWidth: 1, borderColor: C.lineHi,
    padding: 20, alignItems: "center", gap: 14,
  },
  title: { color: C.text, fontFamily: F.display, fontSize: 20, textAlign: "center" },
  previewClip: { borderRadius: radius.md, overflow: "hidden" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.red, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 24,
  },
  shareText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  closeBtn: { paddingVertical: 8 },
  closeText: { color: C.text2, fontFamily: F.medium, fontSize: 14 },
  offscreen: { position: "absolute", left: -9999, top: 0, width: CARD_W, height: CARD_H },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `BadgeSharePopup.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/BadgeSharePopup.tsx
git commit -m "feat(share): add BadgeSharePopup for tap-to-share on earned badges"
```

---

### Task 4: Wire into `app/(app)/profile.tsx`

**Files:**
- Modify: `app/(app)/profile.tsx`

**Interfaces:**
- Consumes: `BadgeSharePopup` (Task 3), `BadgeGrid`'s new `onPressBadge` prop (Task 2), `EarnedBadge` type (`src/achievements/types.ts`).

- [ ] **Step 1: Import and add state**

Add to the import block near the other component imports (after the `BadgeGrid` import at line 14):

```tsx
import BadgeSharePopup from "../../src/components/BadgeSharePopup";
import type { EarnedBadge } from "../../src/achievements/types";
```

Add state near the other `useState` declarations (after `const [usernameBusy, setUsernameBusy] = useState(false);`):

```tsx
const [selectedBadge, setSelectedBadge] = useState<EarnedBadge | null>(null);
```

- [ ] **Step 2: Wire `BadgeGrid` and render the popup**

Find the existing `<BadgeGrid badges={badges} />` line and change it to:

```tsx
<BadgeGrid badges={badges} onPressBadge={setSelectedBadge} />
```

Immediately after the closing `</FormScreen>` (the component's JSX currently returns a `<>` fragment wrapping `<FormScreen>...</FormScreen>` plus sibling `Modal`s — add the popup as another sibling inside that same top-level fragment, alongside the existing `<Modal visible={editingName} ...>` etc.):

```tsx
<BadgeSharePopup
  badge={selectedBadge}
  playerName={me}
  onClose={() => setSelectedBadge(null)}
/>
```

(`me` is the existing `const me = savedName || "Player";` already defined above the `return` statement — no new derivation needed.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `profile.tsx`.

- [ ] **Step 4: Run full test suite**

Run: `npm test -- --silent`
Expected: all existing suites still pass (no test touches this screen directly, so this is a regression check, not new coverage).

- [ ] **Step 5: Manual QA**

Start the app (`npx expo start`, dev client build — `react-native-share` is a native module and won't work in Expo Go), open Profile, tap several different earned badges:
- Popup opens with the correct badge's icon/title/description and the player's name in the preview.
- "Share to story" produces a PNG and opens Instagram Stories (or the OS share sheet if Instagram isn't installed).
- "Close" and backdrop tap both dismiss the popup.
- Tapping a locked or in-progress badge does nothing (no popup).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/profile.tsx"
git commit -m "feat(profile): wire achievement tap-to-share popup"
```

---

## Self-Review Notes

- **Spec coverage:** BadgeResultCard (spec §1) → Task 1. BadgeSharePopup (spec §2) → Task 3. BadgeGrid tap prop (spec §3) → Task 2. profile.tsx wiring (spec §4) → Task 4. Testing/out-of-scope sections reflected in Global Constraints and Task 4 Step 5.
- **Type consistency:** `EarnedBadge` used consistently across Tasks 2–4 from its single source (`src/achievements/types.ts`); `BadgeResultCard`'s `badge` prop shape (`{ title, description, icon }`) is a subset of `EarnedBadge` that `BadgeSharePopup` satisfies by passing the full `EarnedBadge` object (structurally compatible, extra fields ignored).
- **No placeholders:** every step has literal, complete code.
