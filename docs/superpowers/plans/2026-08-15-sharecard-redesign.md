# ShareCard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the match share image from a 360×640 card showing two names and a score string into a 1080×1920 story poster carrying a hero score, per-game breakdown, four derived stats, and a join watermark.

**Architecture:** Three pure functions and one formatter are added to the existing `src/lib/share/` module and unit-tested in the node-only Jest suite. `ShareCard.tsx` is rewritten to take structured props instead of pre-flattened strings, and composes existing components (`Logo`, `StatTile`) rather than new ones. The match detail screen gates the share control to completed matches and passes the new props. Capture resolution is raised with one option change in `shareMatch.ts`.

**Tech Stack:** React Native (Expo SDK 57), TypeScript, `expo-linear-gradient`, `react-native-view-shot`, `expo-sharing`, Jest with `ts-jest` in a `node` test environment.

**Spec:** `docs/superpowers/specs/2026-08-15-sharecard-redesign-design.md`

## Global Constraints

- Expo has changed — read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo API code.
- **No new dependencies.** Everything needed is already installed.
- Jest is configured `testEnvironment: "node"` with `roots: ["<rootDir>/tests"]`. Tests cover pure logic only; React Native components are never unit-tested in this repo. Do not add a component test renderer.
- New pure logic goes in `src/lib/share/` next to the existing `cardData.ts`, and its tests in `tests/share/`.
- Colors, fonts, spacing and radii come from `src/theme.ts` (`C`, `F`, `GRAD`, `radius`, `textGlow`). Never hardcode a hex value in a component.
- `C.text3` is the dimmest token allowed for text. `C.ghost` is decorative-only and must never be the sole carrier of information.
- Commit with an explicit pathspec every time. Never `git add -A`, `git add .`, or `git commit -a`.
- Do not add a `Co-Authored-By` trailer.
- Run the full suite with `npm test`. Typecheck with `npx tsc --noEmit`.

---

## File Structure

**Create:**
- `src/lib/share/matchStats.ts` — derived match stats and the compact duration formatter. Pure, no React Native imports.
- `tests/share/matchStats.test.ts` — unit tests for the above.

**Modify:**
- `src/lib/shareJoin.ts` — export the resolved display domain so the card doesn't rebuild the URL.
- `tests/shareJoin.test.ts` — cover the new export.
- `src/components/ShareCard.tsx` — full rewrite: new props, new layout.
- `src/lib/shareMatch.ts:9` — raise capture output to 1080×1920.
- `app/(app)/matches/[id].tsx` — gate the share control, pass the new props.

**Reuse as-is (do not reimplement):**
- `src/lib/share/cardData.ts` → `formatGameScores(summary)` returns `["21-15", "18-21"]`; `truncateName(name, max)` ellipsizes.
- `src/lib/matchDetail.ts` → `matchDurationMs(events)`.
- `src/components/StatTile.tsx` → `<StatTile label value valueColor? />`, already `flex: 1` and already carries an on-device-verified `minHeight` for two-line labels.
- `src/components/Logo.tsx` → `<Logo size? showWordmark? style? />`.

---

## Task 1: Derived match stats

**Files:**
- Create: `src/lib/share/matchStats.ts`
- Test: `tests/share/matchStats.test.ts`

**Interfaces:**
- Consumes: `MatchEvent` and `TeamId` from `src/engine` (already exported via `src/engine/index.ts`).
- Produces:
  - `totalRallies(events: MatchEvent[]): number`
  - `longestStreak(events: MatchEvent[], side: TeamId): number`
  - `leadChanges(events: MatchEvent[]): number`
  - `formatShortDuration(ms: number): string`

The relevant `MatchEvent` variants for this task, from `src/engine/types.ts`:

```ts
| { type: "RALLY_WON"; by: TeamId; at: number }
| { type: "GAME_STARTED"; at: number }
```

`TeamId` is `"A" | "B"`.

- [ ] **Step 1: Write the failing tests**

Create `tests/share/matchStats.test.ts`:

```ts
import {
  totalRallies,
  longestStreak,
  leadChanges,
  formatShortDuration,
} from "../../src/lib/share/matchStats";
import type { MatchEvent, TeamId } from "../../src/engine";

/** Compact builder: "ABBA" -> four RALLY_WON events. "|" starts a new game. */
function ev(pattern: string): MatchEvent[] {
  const out: MatchEvent[] = [];
  let at = 1000;
  for (const ch of pattern) {
    at += 1000;
    if (ch === "|") out.push({ type: "GAME_STARTED", at });
    else out.push({ type: "RALLY_WON", by: ch as TeamId, at });
  }
  return out;
}

test("totalRallies counts nothing for an empty event list", () => {
  expect(totalRallies([])).toBe(0);
});

test("totalRallies counts rallies across games and ignores non-rally events", () => {
  expect(totalRallies(ev("AABB|ABA"))).toBe(7);
});

test("longestStreak is zero when the side never wins a rally", () => {
  expect(longestStreak(ev("BBBB"), "A")).toBe(0);
});

test("longestStreak finds a run at the start", () => {
  expect(longestStreak(ev("AAABAB"), "A")).toBe(3);
});

test("longestStreak finds a run at the end", () => {
  expect(longestStreak(ev("ABAAAA"), "A")).toBe(4);
});

test("longestStreak carries a run across a game boundary", () => {
  // Three at the end of game one, two at the start of game two: momentum
  // carries, so this is a run of five, not two runs of three and two.
  expect(longestStreak(ev("BAAA|AAB"), "A")).toBe(5);
});

test("leadChanges is zero for a blowout", () => {
  expect(leadChanges(ev("AAAAA"))).toBe(0);
});

test("leadChanges does not count a tie as a change", () => {
  // 1-0, 1-1, 2-1, 2-2: A leads or it is level, B never leads.
  expect(leadChanges(ev("ABAB"))).toBe(0);
});

test("leadChanges counts a genuine flip through a tie", () => {
  // 1-0 (A), 1-1 (tie), 1-2 (B) -> one change.
  expect(leadChanges(ev("ABB"))).toBe(1);
});

test("leadChanges counts several flips", () => {
  // 1-0 A, 1-1, 1-2 B(+1), 2-2, 3-2 A(+1) -> 2.
  expect(leadChanges(ev("ABBAA"))).toBe(2);
});

test("leadChanges resets at each game, so a new game's first lead is not a change", () => {
  // Game one ends with B ahead; game two opens with A ahead. Each game starts
  // level, so that is not a flip.
  expect(leadChanges(ev("BB|AA"))).toBe(0);
});

test("formatShortDuration renders sub-hour durations as whole minutes", () => {
  expect(formatShortDuration(42 * 60 * 1000)).toBe("42′");
});

test("formatShortDuration floors partial minutes", () => {
  expect(formatShortDuration(59 * 1000)).toBe("0′");
});

test("formatShortDuration renders an hour-plus duration with a zero-padded minute", () => {
  expect(formatShortDuration(61 * 60 * 1000)).toBe("1h 01′");
});

test("formatShortDuration treats a negative duration as zero", () => {
  expect(formatShortDuration(-5000)).toBe("0′");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/share/matchStats.test.ts`

Expected: FAIL — `Cannot find module '../../src/lib/share/matchStats'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/share/matchStats.ts`:

```ts
import type { MatchEvent, TeamId } from "../../engine";

/**
 * Derived match stats for the share card.
 *
 * Pure and React-Native-free for the same reason as matchDetail.ts: the
 * node-env Jest suite has to be able to import them. The card renders these,
 * it never computes them.
 */

/** Points actually played, across every game. */
export function totalRallies(events: MatchEvent[]): number {
  return events.reduce((n, e) => (e.type === "RALLY_WON" ? n + 1 : n), 0);
}

/**
 * Longest run of consecutive points won by `side`.
 *
 * Deliberately not reset at GAME_STARTED: a run that carries from the end of
 * one game into the start of the next is real momentum, and reads that way on
 * the card.
 */
export function longestStreak(events: MatchEvent[], side: TeamId): number {
  let best = 0;
  let run = 0;
  for (const e of events) {
    if (e.type !== "RALLY_WON") continue;
    run = e.by === side ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * How many times the lead changed hands.
 *
 * A tie is not a lead change, and coming out of a tie only counts if the new
 * leader is not the side that led going in — so `lead` remembers the last
 * non-level state rather than being cleared when the scores meet.
 *
 * Reset per game, unlike longestStreak: every game starts level, so a
 * cross-game "change" would be an artefact of the scoreboard resetting rather
 * than anything that happened on court.
 */
export function leadChanges(events: MatchEvent[]): number {
  let changes = 0;
  let a = 0;
  let b = 0;
  let lead = 0; // sign of (a - b) at the last point where they differed
  for (const e of events) {
    if (e.type === "GAME_STARTED") {
      a = 0;
      b = 0;
      lead = 0;
      continue;
    }
    if (e.type !== "RALLY_WON") continue;
    if (e.by === "A") a++;
    else b++;
    const sign = a > b ? 1 : a < b ? -1 : 0;
    if (sign === 0) continue;
    if (lead !== 0 && sign !== lead) changes++;
    lead = sign;
  }
  return changes;
}

/**
 * Compact duration for a stat tile: "42′", or "1h 04′" past the hour.
 *
 * formatElapsed (src/lib/elapsed.ts) is the wrong shape here — it returns
 * HH:MM:SS, which is three segments of noise in a 76pt-wide tile.
 */
export function formatShortDuration(ms: number): string {
  const totalMin = ms > 0 ? Math.floor(ms / 60000) : 0;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}′`;
  return `${h}h ${String(m).padStart(2, "0")}′`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/share/matchStats.test.ts`

Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/share/matchStats.ts tests/share/matchStats.test.ts
git commit -m "feat(share): derive rally, streak and lead-change stats for the card"
```

---

## Task 2: Expose the join display domain

**Files:**
- Modify: `src/lib/shareJoin.ts`
- Test: `tests/shareJoin.test.ts`

**Interfaces:**
- Produces: `joinLinkDisplayDomain(): string | null` — the bare domain to print on the card, or `null` when unconfigured.

**Why:** the spec forbids the card constructing its own URL. `shareJoin.ts` already owns `process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN` and falls back to an `expo-linking` `badminton://` URL, which is meaningless to a stranger scrolling a story. The card needs the domain or nothing at all.

Note the existing test file reads the env var at **call** time via `require` after setting `process.env`, and its `afterEach` does `jest.resetModules()` and deletes the var. The current module reads the env var at module scope (`const JOIN_LINK_DOMAIN = ...`), which is why those tests re-`require`. Keep that working: read the env var **inside** the new function so it is correct regardless of import timing.

- [ ] **Step 1: Write the failing tests**

Append to `tests/shareJoin.test.ts`:

```ts
test("joinLinkDisplayDomain returns the bare domain when configured", () => {
  process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN = "courtside-links.vercel.app";
  const { joinLinkDisplayDomain } = require("../src/lib/shareJoin");
  expect(joinLinkDisplayDomain()).toBe("courtside-links.vercel.app");
});

test("joinLinkDisplayDomain returns null when unconfigured, so the card prints no link", () => {
  const { joinLinkDisplayDomain } = require("../src/lib/shareJoin");
  expect(joinLinkDisplayDomain()).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/shareJoin.test.ts`

Expected: FAIL — `joinLinkDisplayDomain is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/shareJoin.ts`, directly below the existing `JOIN_LINK_DOMAIN` constant:

```ts
/**
 * The domain to *display* on a share card, or null when unconfigured.
 *
 * Read at call time rather than module scope so it tracks the env var the way
 * the tests (and an app restart) expect. Deliberately returns null instead of
 * the badminton:// fallback shareJoinLink uses: a custom-scheme URL is a dead
 * end for a stranger scrolling a story, so the card shows the wordmark alone.
 */
export function joinLinkDisplayDomain(): string | null {
  return process.env.EXPO_PUBLIC_JOIN_LINK_DOMAIN || null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/shareJoin.test.ts`

Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareJoin.ts tests/shareJoin.test.ts
git commit -m "feat(share): expose the join display domain for card watermarks"
```

---

## Task 3: Rewrite ShareCard

**Files:**
- Modify: `src/components/ShareCard.tsx` (full rewrite of the file's body)

**Interfaces:**
- Consumes: `formatShortDuration` from Task 1; `joinLinkDisplayDomain` from Task 2; `formatGameScores` and `truncateName` from `src/lib/share/cardData.ts`; `StatTile` and `Logo` components; `C`, `F`, `GRAD`, `radius`, `textGlow` from `src/theme.ts`.
- Produces: the props type Task 4 must satisfy:

```ts
export type ShareCardStats = {
  durationMs: number;
  rallies: number;
  streak: number;
  leadChanges: number;
};

export type ShareCardProps = {
  teamA: string;
  teamB: string;
  winner: "A" | "B";
  games: { A: number; B: number }[];
  stats: ShareCardStats;
  dateLabel: string;
  avatarUrl?: string | null;
};
```

**Layout note:** the card is authored at 360×640 (9:16) and scaled to 1080×1920 at capture time in Task 4, so every number below is a third of its final pixel size. The spec's 1080×1420 safe zone becomes 84pt of vertical padding at this scale.

**Reuse note:** do not write a local stat tile. `StatTile` is already `flex: 1`, already uses `C.card` + 12 radius, and already carries a `minHeight` that was measured on-device so a two-line label ("LEAD CHANGES") does not shove the value down. Four of them in a `flexDirection: "row"` with a gap is the whole stat row.

- [ ] **Step 1: Replace the file**

Write `src/components/ShareCard.tsx`:

```tsx
import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "./Logo";
import StatTile from "./StatTile";
import { formatGameScores, truncateName } from "../lib/share/cardData";
import { formatShortDuration } from "../lib/share/matchStats";
import { joinLinkDisplayDomain } from "../lib/shareJoin";
import { C, F, GRAD, radius, textGlow } from "../theme";

export type ShareCardStats = {
  durationMs: number;
  rallies: number;
  streak: number;
  leadChanges: number;
};

export type ShareCardProps = {
  teamA: string;
  teamB: string;
  /** Non-nullable: the share control is gated to decided matches. */
  winner: "A" | "B";
  games: { A: number; B: number }[];
  stats: ShareCardStats;
  dateLabel: string;
  /** Reserved for the upcoming profile-picture feature. Intentionally unused. */
  avatarUrl?: string | null;
};

/**
 * Fixed-size story card (9:16) captured off-screen for sharing. Render it in an
 * absolutely-positioned, off-viewport wrapper and pass its ref to captureRef,
 * which scales this 360×640 layout up to Instagram's 1080×1920.
 *
 * The 84pt vertical padding is the spec's safe zone: Instagram overlays its own
 * chrome on roughly the top and bottom eighth of a story, so nothing but the
 * background gradient is allowed to live out there.
 */
const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { teamA, teamB, winner, games, stats, dateLabel }, ref,
) {
  const winnerName = truncateName(winner === "A" ? teamA : teamB);
  const loserName = truncateName(winner === "A" ? teamB : teamA);
  const chips = formatGameScores({ games });

  // Hero numerals come from the last game played: the point that ended it.
  const last = games[games.length - 1];
  const heroScore = last ? (winner === "A" ? last.A : last.B) : 0;
  const foilScore = last ? (winner === "A" ? last.B : last.A) : 0;

  const domain = joinLinkDisplayDomain();

  return (
    <View ref={ref} collapsable={false} style={s.card}>
      <LinearGradient colors={GRAD.court} style={StyleSheet.absoluteFill} />

      <View style={s.header}>
        <Logo size={26} />
      </View>

      <View style={s.body}>
        <Text style={s.eyebrow}>MATCH WON</Text>
        <Text style={s.hero}>{heroScore}</Text>
        <Text style={s.foil}>{foilScore}</Text>
        <View style={s.rule} />
        <Text style={s.winner} numberOfLines={2}>{winnerName}</Text>
        <Text style={s.loser} numberOfLines={2}>def. {loserName}</Text>

        <View style={s.chipRow}>
          {chips.map((score, i) => {
            const g = games[i];
            const wonIt = winner === "A" ? g.A > g.B : g.B > g.A;
            return (
              <View key={i} style={[s.chip, wonIt ? s.chipWon : s.chipLost]}>
                <Text style={s.chipText}>{score}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.statRow}>
        <StatTile label="TIME" value={formatShortDuration(stats.durationMs)} />
        <StatTile label="RALLIES" value={String(stats.rallies)} />
        <StatTile label="STREAK" value={String(stats.streak)} valueColor={C.accent} />
        <StatTile label="LEAD CHANGES" value={String(stats.leadChanges)} />
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>{dateLabel}</Text>
        {domain !== null && <Text style={s.footerLink}>{domain}</Text>}
      </View>
    </View>
  );
});

export default ShareCard;

const s = StyleSheet.create({
  card: {
    width: 360, height: 640, backgroundColor: C.bg,
    paddingHorizontal: 28, paddingVertical: 84, justifyContent: "space-between",
  },
  header: { alignItems: "center" },
  body: { flex: 1, justifyContent: "center", alignItems: "center" },
  eyebrow: { color: C.red, fontFamily: F.medium, fontSize: 11, letterSpacing: 2 },
  hero: {
    color: C.text, fontFamily: F.display, fontSize: 108, lineHeight: 116,
    fontVariant: ["tabular-nums"], ...textGlow(C.accent, 18),
  },
  // Decorative foil for the hero numeral. C.ghost fails AA by design, which is
  // why the same value is repeated accessibly in the chip strip below.
  foil: {
    color: C.ghost, fontFamily: F.display, fontSize: 40, lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  rule: { width: 28, height: 1, backgroundColor: C.line, marginVertical: 14 },
  winner: { color: C.text, fontFamily: F.semibold, fontSize: 17, textAlign: "center" },
  loser: { color: C.text2, fontFamily: F.medium, fontSize: 13, textAlign: "center", marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 18, flexWrap: "wrap", justifyContent: "center" },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: C.card, borderWidth: 1 },
  chipWon: { borderColor: C.accent },
  chipLost: { borderColor: C.line },
  chipText: { color: C.text2, fontFamily: F.medium, fontSize: 11, fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", gap: 6 },
  footer: { alignItems: "center", gap: 2 },
  footerText: { color: C.text3, fontFamily: F.medium, fontSize: 10, letterSpacing: 1 },
  footerLink: { color: C.text2, fontFamily: F.medium, fontSize: 10, letterSpacing: 1 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: errors **only** in `app/(app)/matches/[id].tsx`, complaining that `scoreLine`/`subtitle` are not in `ShareCardProps` and that `winner` may be null. That file is fixed in Task 4. If any error points at `ShareCard.tsx` itself, fix it before moving on.

- [ ] **Step 3: Run the suite**

Run: `npm test`

Expected: PASS. No test imports `ShareCard`, so this is a regression check on Tasks 1 and 2.

- [ ] **Step 4: Commit**

```bash
git add src/components/ShareCard.tsx
git commit -m "feat(share): rebuild the match card as a 9:16 story poster"
```

---

## Task 4: Wire the call site and raise capture resolution

**Files:**
- Modify: `src/lib/shareMatch.ts`
- Modify: `app/(app)/matches/[id].tsx`

**Interfaces:**
- Consumes: `ShareCardProps` from Task 3; `totalRallies`, `longestStreak`, `leadChanges` from Task 1; `matchDurationMs` and `formatMatchDate` from `src/lib/matchDetail.ts` (both already imported by this screen).

- [ ] **Step 1: Raise the capture resolution**

In `src/lib/shareMatch.ts`, replace the `captureRef` call on line 9:

```ts
  const uri = await captureRef(ref, { format: "png", quality: 1, width: 1080, height: 1920 });
```

and extend the function's doc comment to say why:

```ts
/**
 * Capture a rendered card view to a PNG and hand it to the OS share sheet.
 *
 * width/height force the 360×640 card up to Instagram's native story size.
 * Without them the capture matches the layout size and every upload gets
 * upscaled 3× by Instagram, which is what made the old card look soft.
 */
```

- [ ] **Step 2: Gate the share control and pass the new props**

In `app/(app)/matches/[id].tsx`:

Add to the imports from `../../../src/lib/matchDetail` — `formatMatchDate` is already imported; no change needed there. Add a new import line after the existing `matchDetail` import block:

```ts
import { leadChanges, longestStreak, totalRallies } from "../../../src/lib/share/matchStats";
```

Replace the `scoreLine` derivation (line 34) with a decided-match guard:

```ts
  // The share card renders a decided match: no winner means no share control,
  // which is why ShareCardProps.winner is non-nullable.
  const games = match.score_summary?.games ?? [];
  const canShare = match.status === "completed" && match.winner !== null && games.length > 0;
```

Leave `onShare`, `names` and `timeline` as they are.

Replace the share button and the off-screen card block (lines 74–89) with:

```tsx
      {canShare && (
        <PressableScale style={s.shareBtn} onPress={onShare}>
          <Icon name="trophy" color={C.text} size={18} />
          <Text style={s.shareText}>Share to story</Text>
        </PressableScale>
      )}

      {/* Off-screen card captured for sharing. */}
      {canShare && (
        <View style={s.offscreen} pointerEvents="none">
          <ShareCard
            ref={cardRef}
            teamA={names(match.side_a)}
            teamB={names(match.side_b)}
            winner={match.winner as "A" | "B"}
            games={games}
            stats={{
              durationMs: matchDurationMs(events),
              rallies: totalRallies(events),
              streak: longestStreak(events, match.winner as "A" | "B"),
              leadChanges: leadChanges(events),
            }}
            dateLabel={formatMatchDate(match.created_at)}
          />
        </View>
      )}
```

Note `formatMatchDate` replaces the old inline `new Date(...).toLocaleDateString()`, which depended on runtime ICU data — `matchDetail.ts` already documents why that is avoided here.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors anywhere. If `scoreLine` is reported as unused, delete its now-dead declaration.

- [ ] **Step 4: Run the suite**

Run: `npm test`

Expected: PASS, full suite.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareMatch.ts "app/(app)/matches/[id].tsx"
git commit -m "feat(share): gate sharing to decided matches and capture at 1080x1920"
```

---

## Task 5: Device verification

**Files:** none — this task either confirms Task 4's approach or triggers the documented fallback.

This is the acceptance gate the spec names. `react-native-view-shot`'s `width`/`height` are documented as output size but have historically behaved as a **crop** on some Android versions, which would silently ship a card with its edges cut off.

- [ ] **Step 1: Capture on a physical Android device**

Run the app on a physical Android device (`npm run android` with a device attached — note Expo Go cannot be used for a release-parity check of native capture; use the dev client build this repo already produces).

Open a completed match, tap "Share to story", and save the image out of the share sheet.

- [ ] **Step 2: Verify the Android output**

Check the saved PNG's pixel dimensions are exactly **1080×1920**, and that the wordmark at the top and the date/link at the bottom are both fully visible and not clipped.

- [ ] **Step 3: Repeat on a physical iOS device**

Same check: 1080×1920, nothing clipped at either edge.

- [ ] **Step 4: If either device crops instead of scaling, apply the fallback**

Revert `shareMatch.ts` to `{ format: "png", quality: 1 }` and instead scale the layout. In `ShareCard.tsx`, add above the StyleSheet:

```ts
/**
 * Layout scale. The card is authored at 360×640 for readability and rendered
 * off-screen at 3× so captureRef can grab Instagram's native 1080×1920 with no
 * resize options — react-native-view-shot's width/height crop rather than
 * scale on some Android versions.
 */
const S = 3;
const px = (n: number) => n * S;
```

Then wrap every numeric value in the StyleSheet in `px(...)` — `width: px(360)`, `height: px(640)`, `fontSize: px(108)`, `lineHeight: px(116)`, and so on, including the `Logo size={px(26)}` prop. `letterSpacing` scales too. Re-run Steps 1–3.

`StatTile`'s internal sizing is fixed and will not scale with `px()`. If the fallback is taken, the stat row will look proportionally small against a 3× card; in that case replace the `StatTile` row with a local scaled variant in `ShareCard.tsx` that mirrors StatTile's structure (label above value, `flex: 1`, `C.card` background) with `px()` applied, and leave the shared `StatTile` untouched so the Home screen is unaffected.

- [ ] **Step 5: Visual QA on long names**

On a doubles match where all four player names are long, confirm `truncateName` plus `numberOfLines={2}` keeps the stat row and footer inside the frame rather than pushing them out of the safe zone.

- [ ] **Step 6: Commit any fallback changes**

Only if Step 4 was needed:

```bash
git add src/components/ShareCard.tsx src/lib/shareMatch.ts
git commit -m "fix(share): scale the card layout 3x where view-shot crops instead of scaling"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1080×1920 canvas, capture approach + fallback | 4 (step 1), 5 |
| Safe zone (84pt vertical padding at 360 scale) | 3 |
| `GRAD.court` full bleed | 3 |
| Wordmark band, eyebrow, hero + foil numerals, rule, names | 3 |
| Game chip strip with winner-side accent border | 3 |
| Four stat tiles (time / rallies / streak / lead changes) | 3, values from 1 |
| Watermark band, env-driven domain, wordmark-only fallback | 2, 3 |
| Structured props, reserved `avatarUrl` | 3 |
| Derived stats + cross-game streak, per-game lead reset | 1 |
| Gating to completed matches with a winner | 4 |
| Honest `0` for lead changes on a blowout | 1 (test), 3 (no conditional tile) |
| Unchanged toast error handling | 4 (untouched `onShare`) |
| Tests for the three pure functions | 1 |
| Manual device verification of capture size | 5 |

No spec requirement is unclaimed.

**Deviations from the spec, both reuse-driven and both improvements:**
- The spec placed the new module at `src/lib/shareStats.ts`. It goes to `src/lib/share/matchStats.ts` instead, because `src/lib/share/cardData.ts` and `tests/share/` already exist and establish that location.
- The spec did not mention `formatShortDuration`. It is required: the existing `formatElapsed` returns `HH:MM:SS`, which does not fit a stat tile. Added to Task 1 with tests.
- The spec described building a stat row; the plan reuses the existing `StatTile`, which already carries an on-device-measured `minHeight` fix for two-line labels — exactly the "LEAD CHANGES" wrap case.

**Type consistency:** `ShareCardProps` as produced in Task 3 matches the props passed in Task 4 field-for-field. `longestStreak(events, side)` is called with `match.winner as "A" | "B"`, matching its `TeamId` parameter. `formatGameScores` is fed `{ games }`, matching its `{ games: { A: number; B: number }[] } | null` parameter.

**Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N". Every code step carries its actual code.
