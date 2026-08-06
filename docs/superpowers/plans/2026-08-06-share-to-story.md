# Share-to-Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users share match, session, and tournament-champion results as branded 1080×1920 image cards to Instagram Stories (one-tap on both iOS and Android via `react-native-share`, falling back to the generic OS share sheet on failure), from four screens already in the app.

**Architecture:** A shared `CardShell` + `Avatar` component pair renders the CourtSide-branded background/watermark/avatar-with-fallback, three thin card components (`MatchResultCard`, `SessionResultCard`, `TournamentResultCard`) compose on top of it, and one capture/share pipeline (`react-native-view-shot` → `react-native-share`'s Instagram Stories intent → `expo-sharing` fallback) is reused by every entry point.

**Tech Stack:** React Native (Expo SDK 54), TypeScript, `react-native-view-shot` 4.0.3, `expo-sharing` ~14.0.8, `react-native-share` (new, installed in Task 1), Jest ~29.7.0.

## Global Constraints

- One new dependency: `react-native-share`, installed via `npx expo install react-native-share` (not plain `npm install`, so Expo resolves an SDK-54-compatible version). It's a native module — after installing, `expo prebuild` must regenerate the native projects, and testing requires a dev-client/EAS build; it will not work in Expo Go. `react-native-view-shot` and `expo-sharing` were already installed and need no changes.
- True direct-to-Instagram-Stories sharing (both platforms) requires native pasteboard/intent handling that pure JS/Expo APIs cannot do — `Linking.openURL` cannot pass image data, and `expo-clipboard`'s `setImageAsync` sets a plain clipboard image that Instagram's sticker API does not recognize (it looks for pasteboard items tagged `com.instagram.sharedSticker.backgroundImage`, iOS-side). `react-native-share`'s `Share.shareSingle({ social: Social.InstagramStories, ... })` handles this correctly on both platforms internally.
- Cards are 1080×1920 (native IG Story canvas). Safe content zone is the centered 1080×1420 — nothing important renders in the top/bottom ~250px reserved for IG's own UI chrome.
- All visuals reuse `src/theme.ts` tokens (`C`, `F`, `GRAD`, `glow`, `textGlow`, `radius`, `easing`) — no new colors, fonts, or animation curves.
- Avatars: every card takes an optional `avatarUrl?: string | null` per player/entrant. Present → circular `Image`. Absent → the same initials-circle fallback already used at `app/(app)/profile.tsx:130` and `app/(app)/sessions/[id].tsx:366` (`C.cardHi` background, first-letter initial in `F.display`). No profile-picture feature exists yet — this is forward-compat only.
- If the Instagram share attempt fails for any reason (not installed, user cancels, native error), the pipeline falls back to the generic `expo-sharing` share sheet — see Task 8.
- Press feedback on the share button uses the existing `PressableScale` component (`src/components/PressableScale.tsx`), not a raw `Pressable` — this is the app's established press-feedback primitive.

---

### Task 1: Install `react-native-share` and prebuild

**Files:**
- Modify: `package.json`, `package-lock.json` (or equivalent lockfile)
- Modify: `app.json` (iOS scheme whitelist, needed by `react-native-share`'s internal availability check)

**Interfaces:**
- Produces: `react-native-share`'s `Share.shareSingle` and `Share.Social.InstagramStories` importable from `"react-native-share"`, used by Task 8.

- [ ] **Step 1: Install the package with Expo's resolver**

Run: `npx expo install react-native-share`
Expected: adds `react-native-share` to `package.json` at a version compatible with Expo SDK 54.

- [ ] **Step 2: Whitelist the Instagram URL scheme on iOS**

In `app.json`, change:

```json
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.navalo.courtside"
    },
```

to:

```json
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.navalo.courtside",
      "infoPlist": {
        "LSApplicationQueriesSchemes": ["instagram-stories", "instagram"]
      }
    },
```

- [ ] **Step 3: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8'))"`
Expected: no output (parses cleanly).

- [ ] **Step 4: Regenerate native projects**

Run: `npx expo prebuild --clean`
Expected: completes without error; `android/` and `ios/` regenerate with `react-native-share` linked.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "feat(share): add react-native-share, whitelist Instagram URL schemes"
```

---

### Task 2: Card data formatting helpers (TDD)

Pure, RN-free functions so they're trivially unit-testable — no component rendering needed.

**Files:**
- Create: `src/lib/share/cardData.ts`
- Test: `tests/share/cardData.test.ts`

**Interfaces:**
- Produces:
  - `truncateName(name: string, max?: number): string`
  - `formatGameScores(summary: { games: { A: number; B: number }[] } | null): string[]`
  - `topStandings(players: PlayerStat[], n?: number): PlayerStat[]` (uses `PlayerStat` from `src/repos/sessionRepo.ts`)
- Consumes: `PlayerStat` type from `src/repos/sessionRepo.ts` (already defined: `{ name, wins, losses, played }`).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/share/cardData.test.ts
import { truncateName, formatGameScores, topStandings } from "../../src/lib/share/cardData";
import type { PlayerStat } from "../../src/repos/sessionRepo";

test("truncateName leaves short names untouched", () => {
  expect(truncateName("Alex Lee")).toBe("Alex Lee");
});

test("truncateName truncates long names with an ellipsis", () => {
  expect(truncateName("Alexandria Montgomery-Fitzgerald", 18)).toBe("Alexandria Montgo…");
});

test("formatGameScores maps each game to an A-B string", () => {
  expect(formatGameScores({ games: [{ A: 21, B: 15 }, { A: 18, B: 21 }, { A: 21, B: 19 }] }))
    .toEqual(["21-15", "18-21", "21-19"]);
});

test("formatGameScores returns an empty array for a null summary", () => {
  expect(formatGameScores(null)).toEqual([]);
});

test("topStandings returns at most n players, preserving input order", () => {
  const players: PlayerStat[] = [
    { name: "A", wins: 5, losses: 1, played: 6 },
    { name: "B", wins: 4, losses: 2, played: 6 },
    { name: "C", wins: 3, losses: 3, played: 6 },
    { name: "D", wins: 2, losses: 4, played: 6 },
  ];
  expect(topStandings(players, 3).map((p) => p.name)).toEqual(["A", "B", "C"]);
});

test("topStandings returns fewer than n when the input is shorter", () => {
  const players: PlayerStat[] = [{ name: "A", wins: 1, losses: 0, played: 1 }];
  expect(topStandings(players, 3)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/share/cardData.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/share/cardData'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/share/cardData.ts
import type { PlayerStat } from "../../repos/sessionRepo";

export function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export function formatGameScores(
  summary: { games: { A: number; B: number }[] } | null
): string[] {
  if (!summary) return [];
  return summary.games.map((g) => `${g.A}-${g.B}`);
}

export function topStandings(players: PlayerStat[], n = 3): PlayerStat[] {
  return players.slice(0, n);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/share/cardData.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share/cardData.ts tests/share/cardData.test.ts
git commit -m "feat(share): add pure card-data formatting helpers"
```

---

### Task 3: `Avatar` component (shared, with initials fallback)

**Files:**
- Create: `src/components/share/Avatar.tsx`

**Interfaces:**
- Consumes: nothing new — mirrors the existing inline avatar pattern at `app/(app)/sessions/[id].tsx:366` and `app/(app)/profile.tsx:130`.
- Produces: `<Avatar name={string} avatarUrl={string | null | undefined} size={number} />` — used by Task 4 (`CardShell` is size-agnostic, but `MatchResultCard`/`SessionResultCard`/`TournamentResultCard` in Tasks 5–7 all render `Avatar` directly).

- [ ] **Step 1: Write the component**

```typescript
// src/components/share/Avatar.tsx
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { C, F } from "../../theme";

export default function Avatar({
  name,
  avatarUrl,
  size = 40,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[s.image, dim]} />;
  }
  return (
    <View style={[s.fallback, dim]}>
      <Text style={[s.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  image: { backgroundColor: C.cardHi },
  fallback: { backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" },
  initial: { color: C.text, fontFamily: F.display },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/share/Avatar.tsx
git commit -m "feat(share): add Avatar component with initials fallback"
```

---

### Task 4: `CardShell` component (background, watermark, logo)

**Files:**
- Create: `src/components/share/CardShell.tsx`

**Interfaces:**
- Consumes: `Logo` (`src/components/Logo.tsx`), `GRAD`/`C`/`F` from `src/theme.ts`.
- Produces: `<CardShell>{children}</CardShell>` — fixed 1080×1920 canvas with `GRAD.court` background, top logo/wordmark, bottom watermark band, and a centered safe-zone `View` (1080×1420) that `children` render into. Used by Tasks 5, 6, 7.

- [ ] **Step 1: Write the component**

```typescript
// src/components/share/CardShell.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "../Logo";
import { C, F, GRAD } from "../../theme";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const SAFE_MARGIN_V = 250;

export default function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.canvas}>
      <LinearGradient colors={GRAD.court} style={StyleSheet.absoluteFill} />
      <View style={s.topBar}>
        <Logo size={40} />
      </View>
      <View style={s.safeZone}>{children}</View>
      <View style={s.watermark}>
        <Logo size={28} showWordmark={false} />
        <Text style={s.link}>courtside-links.vercel.app/join</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H },
  topBar: { position: "absolute", top: SAFE_MARGIN_V - 80, left: 0, right: 0, alignItems: "center" },
  safeZone: {
    position: "absolute",
    top: SAFE_MARGIN_V,
    left: 60,
    right: 60,
    height: CANVAS_H - SAFE_MARGIN_V * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  watermark: {
    position: "absolute",
    bottom: SAFE_MARGIN_V - 100,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
  },
  link: { color: C.text2, fontFamily: F.medium, fontSize: 20 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/share/CardShell.tsx
git commit -m "feat(share): add CardShell with IG-Story-safe layout"
```

---

### Task 5: `MatchResultCard`

**Files:**
- Create: `src/components/share/MatchResultCard.tsx`

**Interfaces:**
- Consumes: `MatchRecord`/`SidePlayer` (`src/repos/matchRepo.ts`), `truncateName`/`formatGameScores` (Task 2), `Avatar` (Task 3), `CardShell` (Task 4).
- Produces: `<MatchResultCard record={MatchRecord} avatarUrls={Record<string, string | null>} />` where `avatarUrls` is keyed by `club_player_id` (null-keyed guest players simply get no avatar — looked up as `avatarUrls[p.club_player_id ?? ""]`). Rendered off-screen and captured in Task 8.

- [ ] **Step 1: Write the component**

```typescript
// src/components/share/MatchResultCard.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import { truncateName, formatGameScores } from "../../lib/share/cardData";
import type { MatchRecord, SidePlayer } from "../../repos/matchRepo";
import { C, F, glow, textGlow } from "../../theme";

function TeamBlock({
  players,
  isWinner,
  avatarUrls,
}: {
  players: SidePlayer[];
  isWinner: boolean;
  avatarUrls: Record<string, string | null>;
}) {
  return (
    <View style={s.team}>
      {isWinner && (
        <View style={s.winnerPill}>
          <Text style={s.winnerPillText}>WINNER</Text>
        </View>
      )}
      {players.map((p) => (
        <View key={p.club_player_id ?? p.name} style={s.playerRow}>
          <Avatar name={p.name} avatarUrl={avatarUrls[p.club_player_id ?? ""]} size={56} />
          <Text style={[s.playerName, isWinner && s.playerNameWinner]}>
            {truncateName(p.name)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function MatchResultCard({
  record,
  avatarUrls = {},
}: {
  record: MatchRecord;
  avatarUrls?: Record<string, string | null>;
}) {
  const games = formatGameScores(record.score_summary);
  const winnerIsA = record.winner === "A";

  return (
    <CardShell>
      <View style={s.root}>
        <TeamBlock players={record.side_a} isWinner={winnerIsA} avatarUrls={avatarUrls} />
        <View style={s.scoreBlock}>
          {games.map((g, i) => (
            <Text key={i} style={i === 0 ? s.scoreMain : s.scoreMinor}>{g}</Text>
          ))}
        </View>
        <TeamBlock players={record.side_b} isWinner={!winnerIsA} avatarUrls={avatarUrls} />
        <Text style={s.date}>
          {new Date(record.created_at).toLocaleDateString()}
        </Text>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { alignItems: "center", gap: 28 },
  team: { alignItems: "center", gap: 12 },
  playerRow: { alignItems: "center", gap: 8 },
  playerName: { color: C.text, fontFamily: F.semibold, fontSize: 26, textAlign: "center" },
  playerNameWinner: { color: C.accent, ...textGlow(C.accent, 10) },
  winnerPill: { backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, ...glow(C.red, 10, 0.5) },
  winnerPillText: { color: C.text, fontFamily: F.bold, fontSize: 14, letterSpacing: 1 },
  scoreBlock: { alignItems: "center", gap: 4 },
  scoreMain: { color: C.text, fontFamily: F.display, fontSize: 96 },
  scoreMinor: { color: C.text2, fontFamily: F.display, fontSize: 48 },
  date: { color: C.text3, fontFamily: F.body, fontSize: 20, marginTop: 12 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/share/MatchResultCard.tsx
git commit -m "feat(share): add MatchResultCard"
```

---

### Task 6: `SessionResultCard`

**Files:**
- Create: `src/components/share/SessionResultCard.tsx`

**Interfaces:**
- Consumes: `ClubSession`, `SessionStats`, `PlayerStat` (`src/repos/sessionRepo.ts`), `topStandings` (Task 2), `Avatar` (Task 3), `CardShell` (Task 4).
- Produces: `<SessionResultCard session={ClubSession} stats={SessionStats} avatarUrls={Record<string, string | null>} />` — `avatarUrls` keyed by player name (session stats aggregate by name, not id — see `sessionRepo.ts:185-190`).

- [ ] **Step 1: Write the component**

```typescript
// src/components/share/SessionResultCard.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import { truncateName, topStandings } from "../../lib/share/cardData";
import type { ClubSession, SessionStats } from "../../repos/sessionRepo";
import { C, F, radius } from "../../theme";

export default function SessionResultCard({
  session,
  stats,
  avatarUrls = {},
}: {
  session: ClubSession;
  stats: SessionStats;
  avatarUrls?: Record<string, string | null>;
}) {
  const top = topStandings(stats.players, 3);

  return (
    <CardShell>
      <View style={s.root}>
        <Text style={s.title}>SESSION RESULTS</Text>
        <Text style={s.date}>{new Date(session.starts_at).toLocaleDateString()}</Text>
        <View style={s.rows}>
          {top.map((p, i) => (
            <View key={p.name} style={s.row}>
              <Text style={s.rank}>{i + 1}</Text>
              <Avatar name={p.name} avatarUrl={avatarUrls[p.name]} size={48} />
              <Text style={s.name}>{truncateName(p.name)}</Text>
              <Text style={s.record}>{p.wins}-{p.losses}</Text>
            </View>
          ))}
        </View>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center", gap: 20 },
  title: { color: C.text, fontFamily: F.display, fontSize: 40, letterSpacing: 1 },
  date: { color: C.text3, fontFamily: F.body, fontSize: 20, marginBottom: 12 },
  rows: { width: "100%", gap: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: C.card, borderRadius: radius.md, padding: 16,
  },
  rank: { color: C.text2, fontFamily: F.display, fontSize: 28, width: 36 },
  name: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 24 },
  record: { color: C.text2, fontFamily: F.medium, fontSize: 22 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/share/SessionResultCard.tsx
git commit -m "feat(share): add SessionResultCard"
```

---

### Task 7: `TournamentResultCard`

**Files:**
- Create: `src/components/share/TournamentResultCard.tsx`

**Interfaces:**
- Consumes: `Avatar`, `CardShell`, `truncateName`, `Icon` (`src/components/Icon.tsx`, name `"trophy"`).
- Produces: `<TournamentResultCard tournamentName={string} date={number} champion={{ name: string; avatarUrl?: string | null }} runnerUp={{ name: string; avatarUrl?: string | null }} />`.

- [ ] **Step 1: Write the component**

```typescript
// src/components/share/TournamentResultCard.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./CardShell";
import Avatar from "./Avatar";
import Icon from "../Icon";
import { truncateName } from "../../lib/share/cardData";
import { C, F, glow, textGlow } from "../../theme";

export default function TournamentResultCard({
  tournamentName,
  date,
  champion,
  runnerUp,
}: {
  tournamentName: string;
  date: number;
  champion: { name: string; avatarUrl?: string | null };
  runnerUp: { name: string; avatarUrl?: string | null };
}) {
  return (
    <CardShell>
      <View style={s.root}>
        <View style={s.pill}>
          <Icon name="trophy" size={20} color={C.text} />
          <Text style={s.pillText}>CHAMPION</Text>
        </View>
        <Avatar name={champion.name} avatarUrl={champion.avatarUrl} size={120} />
        <Text style={s.championName}>{truncateName(champion.name)}</Text>
        <Text style={s.runnerUpLabel}>RUNNER-UP</Text>
        <View style={s.runnerUpRow}>
          <Avatar name={runnerUp.name} avatarUrl={runnerUp.avatarUrl} size={48} />
          <Text style={s.runnerUpName}>{truncateName(runnerUp.name)}</Text>
        </View>
        <Text style={s.tournamentName}>{tournamentName}</Text>
        <Text style={s.date}>{new Date(date).toLocaleDateString()}</Text>
      </View>
    </CardShell>
  );
}

const s = StyleSheet.create({
  root: { alignItems: "center", gap: 16 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8,
    ...glow(C.accent, 14, 0.5),
  },
  pillText: { color: C.text, fontFamily: F.bold, fontSize: 16, letterSpacing: 1 },
  championName: { color: C.accent, fontFamily: F.display, fontSize: 56, textAlign: "center", ...textGlow(C.accent, 14) },
  runnerUpLabel: { color: C.text3, fontFamily: F.medium, fontSize: 14, letterSpacing: 1, marginTop: 16 },
  runnerUpRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  runnerUpName: { color: C.text2, fontFamily: F.semibold, fontSize: 24 },
  tournamentName: { color: C.text, fontFamily: F.semibold, fontSize: 24, marginTop: 20, textAlign: "center" },
  date: { color: C.text3, fontFamily: F.body, fontSize: 18 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/share/TournamentResultCard.tsx
git commit -m "feat(share): add TournamentResultCard"
```

---

### Task 8: Capture + share pipeline

**Files:**
- Create: `src/lib/share/shareToInstagramStory.ts`
- Create: `src/lib/share/captureAndShare.ts`

**Interfaces:**
- Consumes: `react-native-view-shot`'s `captureRef` function, `react-native-share`'s `Share.shareSingle`/`Share.Social.InstagramStories` (Task 1), `expo-sharing`'s `isAvailableAsync`/`shareAsync` as the fallback.
- Produces:
  - `shareToInstagramStory(uri: string): Promise<void>`
  - `captureAndShare(viewRef: React.RefObject<View>): Promise<void>` — used by Task 9, 10, 11's share buttons.

- [ ] **Step 1: Write `shareToInstagramStory.ts`**

```typescript
// src/lib/share/shareToInstagramStory.ts
import Share, { Social } from "react-native-share";
import * as Sharing from "expo-sharing";

/**
 * Uses react-native-share's native Instagram Stories intent on both
 * platforms (it handles the iOS UIPasteboard item dictionary and the
 * Android FileProvider content:// intent internally — neither is reachable
 * from pure JS/Expo APIs). Falls back to the generic OS share sheet on any
 * failure: Instagram not installed, the user cancels, or a native error.
 */
export async function shareToInstagramStory(uri: string): Promise<void> {
  try {
    await Share.shareSingle({
      social: Social.InstagramStories,
      backgroundImage: uri,
      appId: "", // no interactive stickers/deep-link-back used, so no Facebook App ID is required
    });
    return;
  } catch {
    // Instagram unavailable, share sheet dismissed, or a native error — fall through.
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}
```

- [ ] **Step 2: Write `captureAndShare.ts`**

```typescript
// src/lib/share/captureAndShare.ts
import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { toast } from "../toast";
import { shareToInstagramStory } from "./shareToInstagramStory";

export async function captureAndShare(viewRef: RefObject<View | null>): Promise<void> {
  try {
    const uri = await captureRef(viewRef, { format: "png", quality: 1 });
    await shareToInstagramStory(uri);
  } catch {
    toast("Couldn't create the share image", "error");
  }
}
```

- [ ] **Step 3: Verify `toast` signature matches**

Run: `node -e "const s=require('fs').readFileSync('src/lib/toast.ts','utf8'); console.log(s.slice(0,300))"`
Expected: exported `toast(message: string, kind?: ...)` matching the call above. If the signature differs, adjust the call in Step 2 to match before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/share/shareToInstagramStory.ts src/lib/share/captureAndShare.ts
git commit -m "feat(share): add capture-and-share pipeline with IG Stories intent"
```

---

### Task 9: Wire the match share button (covers post-match, match detail, and guest history)

`app/score/[matchId].tsx` renders `MatchScreen` for every match — live, just-finished, or a completed match reopened later (including from `app/guest/matches.tsx`, which always navigates to `/score/${item.id}`). The `match_over` banner in `MatchScreen.tsx` (`src/screens/MatchScreen.tsx:124-150`) is therefore the single UI location that covers all three "match" entry points from the spec.

**Files:**
- Modify: `src/screens/MatchScreen.tsx`

**Interfaces:**
- Consumes: `MatchResultCard` (Task 5), `captureAndShare` (Task 8), `PressableScale` (existing), `Icon` (existing).

- [ ] **Step 1: Render an off-screen `MatchResultCard` + share button when the match is over**

In `src/screens/MatchScreen.tsx`, add the imports:

```typescript
import { useRef } from "react";
import { View as RNView } from "react-native";
import MatchResultCard from "../components/share/MatchResultCard";
import { captureAndShare } from "../lib/share/captureAndShare";
```

Inside the component, add a ref:

```typescript
const shareCardRef = useRef<RNView>(null);
```

In the `banner` block (around `src/screens/MatchScreen.tsx:140-150`), add a share button next to the "Tap to close" text, only when `state.phase === "match_over"`:

```typescript
{banner ? (
  <Pressable
    style={s.banner}
    onPress={() => {
      if (state.phase === "game_over") dispatch({ type: "GAME_STARTED", at: Date.now() });
      else router.back();
    }}
  >
    <Text style={s.bannerText}>{banner}</Text>
    {state.phase === "match_over" && (
      <>
        <Text style={s.bannerSub}>Tap to close</Text>
        <PressableScale
          style={s.shareButton}
          onPress={(e) => { e.stopPropagation(); void captureAndShare(shareCardRef); }}
        >
          <Icon name="share-social-outline" size={20} color={C.text} />
          <Text style={s.shareButtonText}>Share to Story</Text>
        </PressableScale>
      </>
    )}
  </Pressable>
) : (
  <Court state={state} />
)}
```

Right after the `centerBlock` JSX (still inside the component's returned tree, e.g. just before the closing tag of the root `View`), render the off-screen capture target — only mounted once the match is over, positioned off-screen so it never visibly flashes:

```typescript
{state.phase === "match_over" && (
  <RNView ref={shareCardRef} collapsable={false} style={s.offscreenCard}>
    <MatchResultCard record={record} />
  </RNView>
)}
```

- [ ] **Step 2: Add the new styles**

In the `StyleSheet.create` call at the bottom of `src/screens/MatchScreen.tsx`, add:

```typescript
shareButton: {
  flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16,
  backgroundColor: C.cardHi, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10,
},
shareButtonText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
offscreenCard: { position: "absolute", top: -3000, left: 0 },
```

- [ ] **Step 3: Manual verification**

Run the app (`npx expo start`), finish a match, and confirm:
1. The "Share to Story" button appears under "Tap to close".
2. Tapping it does not also trigger the banner's `onPress` (close/back).
3. On iOS, Instagram Stories opens with the card pre-filled (device with IG installed).
4. On Android, or iOS without IG installed, the generic share sheet opens.

- [ ] **Step 4: Commit**

```bash
git add src/screens/MatchScreen.tsx
git commit -m "feat(share): add share-to-story button on match end"
```

---

### Task 10: Wire the session share button

**Files:**
- Modify: `app/(app)/sessions/[id].tsx`

**Interfaces:**
- Consumes: `SessionResultCard` (Task 6), `captureAndShare` (Task 8).

- [ ] **Step 1: Add the share button and off-screen card**

In `app/(app)/sessions/[id].tsx`, add imports:

```typescript
import { useRef } from "react";
import { View as RNView } from "react-native";
import SessionResultCard from "../../../src/components/share/SessionResultCard";
import { captureAndShare } from "../../../src/lib/share/captureAndShare";
import PressableScale from "../../../src/components/PressableScale";
```

Add a ref inside the component:

```typescript
const shareCardRef = useRef<RNView>(null);
```

Find the existing header/actions area that renders once `session.status === "done"` (where session summary/stats are shown) and add a share button there:

```typescript
{session?.status === "done" && stats && (
  <PressableScale style={s.shareButton} onPress={() => void captureAndShare(shareCardRef)}>
    <Icon name="share-social-outline" size={18} color={C.text} />
    <Text style={s.shareButtonText}>Share Results</Text>
  </PressableScale>
)}
```

Render the off-screen capture target alongside it (anywhere in the returned JSX tree, e.g. right before the root `View`'s closing tag):

```typescript
{session?.status === "done" && stats && (
  <RNView ref={shareCardRef} collapsable={false} style={s.offscreenCard}>
    <SessionResultCard session={session} stats={stats} />
  </RNView>
)}
```

- [ ] **Step 2: Add the new styles**

In the `StyleSheet.create` call in `app/(app)/sessions/[id].tsx`, add:

```typescript
shareButton: {
  flexDirection: "row", alignItems: "center", gap: 8,
  backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
  alignSelf: "flex-start", marginTop: 8,
},
shareButtonText: { color: C.text, fontSize: 14, fontWeight: "700" },
offscreenCard: { position: "absolute", top: -3000, left: 0 },
```

- [ ] **Step 3: Manual verification**

Open a completed session, confirm the "Share Results" button appears and shares correctly (same iOS/Android check as Task 9).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/sessions/[id].tsx"
git commit -m "feat(share): add share-to-story button on session detail"
```

---

### Task 11: Wire the tournament champion share button

**Files:**
- Modify: `app/(app)/tournaments/[id].tsx`

**Interfaces:**
- Consumes: `TournamentResultCard` (Task 7), `captureAndShare` (Task 8), `bracketStatus` (already imported/used — `src/tournament/bracket.ts:78`).

- [ ] **Step 1: Add the share button and off-screen card**

In `app/(app)/tournaments/[id].tsx`, add imports:

```typescript
import { useRef } from "react";
import { View as RNView } from "react-native";
import TournamentResultCard from "../../../src/components/share/TournamentResultCard";
import { captureAndShare } from "../../../src/lib/share/captureAndShare";
```

Add a ref:

```typescript
const shareCardRef = useRef<RNView>(null);
```

Near the existing `const champ = bracketStatus(bracket).champion;` (around line 127), derive the runner-up and names:

```typescript
const champ = bracketStatus(bracket).champion;
const maxRound = bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0;
const finalMatch = bracket.find((m) => m.round === maxRound && m.index === 0);
const runnerUpId = finalMatch && champ
  ? (finalMatch.entrantA === champ ? finalMatch.entrantB : finalMatch.entrantA)
  : null;
const championName = champ ? entrants.find((e) => e.id === champ)?.name ?? "Champion" : null;
const runnerUpName = runnerUpId ? entrants.find((e) => e.id === runnerUpId)?.name ?? "Runner-up" : "TBD";
```

Where the champion is already displayed in the JSX, add a share button:

```typescript
{champ && championName && (
  <PressableScale style={s.shareButton} onPress={() => void captureAndShare(shareCardRef)}>
    <Icon name="share-social-outline" size={18} color={C.text} />
    <Text style={s.shareButtonText}>Share Champion Card</Text>
  </PressableScale>
)}
```

Render the off-screen capture target:

```typescript
{champ && championName && tournament && (
  <RNView ref={shareCardRef} collapsable={false} style={s.offscreenCard}>
    <TournamentResultCard
      tournamentName={tournament.name}
      date={tournament.createdAt}
      champion={{ name: championName }}
      runnerUp={{ name: runnerUpName }}
    />
  </RNView>
)}
```

- [ ] **Step 2: Add the new styles**

In the `StyleSheet.create` call in `app/(app)/tournaments/[id].tsx`, add:

```typescript
shareButton: {
  flexDirection: "row", alignItems: "center", gap: 8,
  backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
  alignSelf: "center", marginTop: 12,
},
shareButtonText: { color: C.text, fontSize: 14, fontWeight: "700" },
offscreenCard: { position: "absolute", top: -3000, left: 0 },
```

- [ ] **Step 3: Manual verification**

Complete a tournament bracket to a champion, confirm "Share Champion Card" appears and shares correctly with the right champion/runner-up names.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/tournaments/[id].tsx"
git commit -m "feat(share): add share-to-story button on tournament champion"
```

---

## Self-Review Notes

- **Spec coverage:** all three card types (Task 5–7), all shared shell/avatar/watermark requirements (Task 3–4), all five original entry points collapse correctly into three wiring tasks (Task 9 covers post-match end + match detail + guest history, since all three route through the same `MatchScreen` banner; Task 10 covers session detail; Task 11 covers tournament champion), the iOS/Android platform split (Task 1, Task 8), and the unit-testable data formatting (Task 2) are all covered.
- **Avatar forward-compat:** every card component takes `avatarUrl` params; none of them require the not-yet-built profile-picture feature to compile or render correctly today.
- **Type consistency checked:** `MatchRecord`/`SidePlayer` (Task 5) match `src/repos/matchRepo.ts`; `ClubSession`/`SessionStats`/`PlayerStat` (Task 6) match `src/repos/sessionRepo.ts`; `BracketMatch`/`Entrant` field names (Task 11) match `src/tournament/types.ts`.
