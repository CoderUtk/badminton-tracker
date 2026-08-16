# Card Design Tokens and Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four share cards one designed family by giving them a shared type scale and accent rule, and fold the match card onto `CardShell` so it finally carries the QR watermark every other card already has.

**Architecture:** New `CARD_TYPE` tokens in `src/theme.ts` become the single type scale for all share cards. `ShareCard` stops hand-rolling its own gradient, wordmark and footer and wraps in `CardShell`, re-derived at the native 1080×1920 canvas the other three cards already use. Once every card is native-size, the `captureRef` resize options become redundant and are removed, making captures 1:1.

**Tech Stack:** React Native, Expo SDK 57, `expo-linear-gradient`, `react-native-qrcode-svg`, `react-native-view-shot`, Jest with `ts-jest` in a `node` environment.

**Spec:** `docs/superpowers/specs/2026-08-16-share-card-convergence-design.md` (sub-project B)

**Depends on:** nothing. Independent of sub-project A; the two may run in either order or in parallel. Sub-project C depends on both.

## Global Constraints

- Expo has changed — read https://docs.expo.dev/versions/v57.0.0/ before writing any Expo API code.
- **No new dependencies.**
- **No Supabase migration.** Do not create or edit any file under `supabase/migrations/`.
- Jest is `testEnvironment: "node"` with `roots: ["<rootDir>/tests"]`. Tests cover pure logic and tokens only; React Native components are never unit-tested in this repo. Do not add a component test renderer and do not write a test that renders a card.
- Colours, fonts, spacing, radii and type sizes come from `src/theme.ts`. No hardcoded hex values and no numeric font sizes in card components once `CARD_TYPE` exists.
- `C.text3` is the dimmest token permitted for text. `C.ghost` is decorative-only and must never be the sole carrier of information.
- Commit with an explicit pathspec every time. Never `git add -A`, `git add .`, or `git commit -a`.
- Do not add a `Co-Authored-By` trailer.
- `npx tsc --noEmit` must end clean. `npm test` must stay green.

---

## File Structure

**Modify:**
- `src/theme.ts` — add `CARD_TYPE` and the documented accent rule.
- `src/components/ShareCard.tsx` — wrap in `CardShell`, re-derive at 1080.
- `src/components/share/TournamentResultCard.tsx` — tokens, date, accent rule.
- `src/components/share/SessionResultCard.tsx` — tokens, date, tabular numerals.
- `src/components/share/BadgeResultCard.tsx` — tokens, accent rule.
- `src/lib/shareMatch.ts` — drop the resize options.
- `src/lib/share/captureAndShare.ts` — drop the resize options.
- `tests/themeTokens.test.ts` — assert the new scale.

**Read but do not modify:**
- `src/components/share/CardShell.tsx` — provides canvas, gradient, wordmark, QR watermark. Its `safeZone` is 960 wide by 1430 tall, centered.
- `src/components/Logo.tsx`, `src/components/Icon.tsx`, `src/lib/share/cardData.ts`, `src/lib/share/matchStats.ts`.

---

## Task 1: Shared card type scale and accent rule

**Files:**
- Modify: `src/theme.ts`
- Test: `tests/themeTokens.test.ts`

**Interfaces:**
- Produces: `CARD_TYPE` with keys `hero`, `title`, `subtitle`, `body`, `label`, `caption`, all `number`, in points on the 1080×1920 card canvas.

- [ ] **Step 1: Write the failing tests**

Append to `tests/themeTokens.test.ts`:

```ts
import { CARD_TYPE } from "../src/theme";

describe("share card type scale", () => {
  const ORDER = ["hero", "title", "subtitle", "body", "label", "caption"] as const;

  it("is strictly descending", () => {
    const sizes = ORDER.map((k) => CARD_TYPE[k]);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeLessThan(sizes[i - 1]);
    }
  });

  it("keeps the hero clearly dominant over the card headline", () => {
    // Below ~2x the headline the hero stops reading as the one thing that matters.
    expect(CARD_TYPE.hero / CARD_TYPE.title).toBeGreaterThanOrEqual(2);
  });

  it("never drops below the 18pt floor for a 1080-wide capture", () => {
    // 18pt at 1080 is ~6pt on a phone-sized preview. Anything smaller is
    // unreadable once Instagram recompresses the image.
    for (const k of ORDER) expect(CARD_TYPE[k]).toBeGreaterThanOrEqual(18);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/themeTokens.test.ts`

Expected: FAIL — `CARD_TYPE` is not exported.

- [ ] **Step 3: Add the tokens**

Append to `src/theme.ts`:

```ts
/**
 * Type scale for the share cards, in points on the 1080x1920 capture canvas.
 *
 * Lives here rather than in each card's StyleSheet so the four cards cannot
 * drift apart again: before this existed, the match card's hero numeral was
 * ~324pt effective while every other card topped out at 56, so they did not
 * read as the same product.
 *
 * The floor is 18. These cards are captured at 1080 wide and viewed at phone
 * size after Instagram recompresses them, so small type disappears.
 */
export const CARD_TYPE = {
  hero: 180,     // the single dominant numeral or name on a card
  title: 56,     // card headline: SESSION RESULTS, badge title, champion name
  subtitle: 30,  // secondary name, standings row name
  body: 26,      // descriptive copy, chip text
  label: 22,     // eyebrows, stat captions, runner-up label
  caption: 18,   // date, watermark sub-line
} as const;

/**
 * Accent rule for share cards. One rule, applied everywhere:
 *
 *   C.red    = identity and framing. Eyebrows, category pills, brand marks.
 *   C.accent = the earned thing. Winning score, champion name, unlocked badge.
 *
 * textGlow(C.accent) is reserved for the single hero element on a card. More
 * than one glowing element and neither reads as the point of the image.
 */
```

Place the accent-rule comment immediately above the existing `glow` / `textGlow` helpers so it is found when those are used.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/themeTokens.test.ts`

Expected: PASS, including the pre-existing contrast tests in that file.

- [ ] **Step 5: Commit**

```bash
git add src/theme.ts tests/themeTokens.test.ts
git commit -m "feat(theme): add a shared type scale and accent rule for share cards"
```

---

## Task 2: Fold ShareCard onto CardShell

**Files:**
- Modify: `src/components/ShareCard.tsx` (full rewrite of the render body and StyleSheet)

**Interfaces:**
- Consumes: `CARD_TYPE` from Task 1; `CardShell` from `src/components/share/CardShell.tsx`; `formatGameScores` and `truncateName` from `src/lib/share/cardData.ts`; `formatShortDuration` from `src/lib/share/matchStats.ts`; `formatMatchDate` from `src/lib/matchDetail.ts`.
- Produces: `ShareCardProps` unchanged in shape except that `dateLabel` is no longer rendered by the card. See the note below.

**What CardShell provides**, so none of it is rewritten here: the 1080×1920 canvas, the `GRAD.court` full-bleed background, the top `Logo` wordmark bar, and the bottom watermark band containing the QR code and join link. Its `safeZone` is 960 wide, 1430 tall, centered both ways, at `top: 130`.

**Two consequences to handle deliberately:**

1. `CardShell`'s watermark band already carries the join link. `ShareCard`'s current footer renders `dateLabel` plus a domain. The domain is now duplicated, so the card's own footer is removed and the match date moves to a `caption` line directly under the team names inside the safe zone. `joinLinkDisplayDomain` is no longer imported by this component.
2. The local stat tile stays local. It was deliberately decoupled from the home screen's `StatTile` on 2026-08-15 so a home-screen change could not shift this card's layout. Do not re-import `StatTile`. Its type sizes now come from `CARD_TYPE`.

- [ ] **Step 1: Rewrite the component**

Replace the body of `src/components/ShareCard.tsx`, keeping the existing `ShareCardStats` and `ShareCardProps` type declarations and their comments:

```tsx
import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import CardShell from "./share/CardShell";
import { formatGameScores, truncateName } from "../lib/share/cardData";
import { formatShortDuration } from "../lib/share/matchStats";
import { C, CARD_TYPE, F, radius, textGlow } from "../theme";

/** One stat tile. Local to this card on purpose: the home screen's StatTile is
 *  shared with a screen whose layout changes must not move this card. */
function Tile({ label, value, valueColor = C.text }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={s.tile}>
      <Text style={[s.tileValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {/* C.text2, never C.text3 - #5C6472 on C.card is below WCAG AA. */}
      <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard(
  { teamA, teamB, winner, games, stats, dateLabel }, ref,
) {
  const winnerName = truncateName(winner === "A" ? teamA : teamB);
  const loserName = truncateName(winner === "A" ? teamB : teamA);
  const chips = formatGameScores({ games });

  const last = games[games.length - 1];
  const heroScore = last ? (winner === "A" ? last.A : last.B) : 0;
  const foilScore = last ? (winner === "A" ? last.B : last.A) : 0;

  return (
    <View ref={ref} collapsable={false}>
      <CardShell>
        <View style={s.root}>
          <Text style={s.eyebrow}>MATCH WON</Text>
          <Text style={s.hero}>{heroScore}</Text>
          <Text style={s.foil}>{foilScore}</Text>
          <View style={s.rule} />
          <Text style={s.winner} numberOfLines={2}>{winnerName}</Text>
          <Text style={s.loser} numberOfLines={2}>def. {loserName}</Text>
          <Text style={s.date}>{dateLabel}</Text>

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

          <View style={s.statRow}>
            <Tile label="TIME" value={formatShortDuration(stats.durationMs)} />
            <Tile label="RALLIES" value={String(stats.rallies)} />
            <Tile label="STREAK" value={String(stats.streak)} valueColor={C.accent} />
            <Tile label="LEAD CHANGES" value={String(stats.leadChanges)} />
          </View>
        </View>
      </CardShell>
    </View>
  );
});

export default ShareCard;

const s = StyleSheet.create({
  root: { width: "100%", alignItems: "center" },
  // C.red frames, per the accent rule in theme.ts.
  eyebrow: { color: C.red, fontFamily: F.medium, fontSize: CARD_TYPE.label, letterSpacing: 4 },
  // The one glowing element on this card.
  hero: {
    color: C.text, fontFamily: F.display, fontSize: CARD_TYPE.hero, lineHeight: CARD_TYPE.hero * 1.08,
    fontVariant: ["tabular-nums"], ...textGlow(C.accent, 36),
  },
  // Decorative foil. C.ghost fails AA by design; the same number is repeated
  // accessibly in the chip strip below.
  foil: {
    color: C.ghost, fontFamily: F.display, fontSize: CARD_TYPE.title,
    lineHeight: CARD_TYPE.title * 1.1, fontVariant: ["tabular-nums"],
  },
  rule: { width: 84, height: 2, backgroundColor: C.line, marginVertical: 36 },
  winner: { color: C.text, fontFamily: F.semibold, fontSize: CARD_TYPE.title, textAlign: "center" },
  loser: { color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.subtitle, textAlign: "center", marginTop: 10 },
  date: { color: C.text3, fontFamily: F.medium, fontSize: CARD_TYPE.caption, letterSpacing: 2, marginTop: 18 },
  chipRow: { flexDirection: "row", gap: 16, marginTop: 48, flexWrap: "wrap", justifyContent: "center" },
  chip: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.md, backgroundColor: C.card, borderWidth: 2 },
  chipWon: { borderColor: C.accent },
  chipLost: { borderColor: C.line },
  chipText: { color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.body, fontVariant: ["tabular-nums"] },
  statRow: { flexDirection: "row", gap: 16, marginTop: 56, width: "100%" },
  tile: {
    flex: 1, backgroundColor: C.card, borderRadius: radius.lg,
    paddingVertical: 24, paddingHorizontal: 12, alignItems: "center", gap: 10,
  },
  tileValue: { fontFamily: F.display, fontSize: CARD_TYPE.title, fontVariant: ["tabular-nums"] },
  tileLabel: {
    color: C.text2, fontFamily: F.medium, fontSize: CARD_TYPE.label,
    letterSpacing: 1, textAlign: "center", minHeight: CARD_TYPE.label * 2.4,
  },
});
```

Note the outer `<View ref={ref} collapsable={false}>` wrapper: the capture ref must sit on a view that wraps `CardShell`, because `CardShell` renders the canvas and does not forward a ref.

- [ ] **Step 2: Remove the now-dead import**

`joinLinkDisplayDomain` is no longer used by this file. Remove its import. Leave the export in `src/lib/shareJoin.ts` alone — it is still correct and is covered by tests; deleting it is out of scope for this task.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: zero errors. If an error points at `app/(app)/matches/[id].tsx` or `src/screens/MatchScreen.tsx`, the props shape changed when it should not have — revert that part; those call sites are unchanged by this task.

- [ ] **Step 4: Run the suite**

Run: `npm test`

Expected: PASS. No test imports `ShareCard`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ShareCard.tsx
git commit -m "feat(share): fold the match card onto CardShell so it carries the QR"
```

---

## Task 3: Apply the system to the other three cards

**Files:**
- Modify: `src/components/share/TournamentResultCard.tsx`
- Modify: `src/components/share/SessionResultCard.tsx`
- Modify: `src/components/share/BadgeResultCard.tsx`

**Interfaces:**
- Consumes: `CARD_TYPE` from Task 1; `formatMatchDate` from `src/lib/matchDetail.ts`.
- Produces: no prop changes. All three keep their current public interfaces.

Three mechanical changes, applied to each card:

1. Every `fontSize` literal becomes a `CARD_TYPE` token.
2. `new Date(x).toLocaleDateString()` becomes `formatMatchDate(x)`. `src/lib/matchDetail.ts` documents why: `toLocaleDateString` depends on the runtime's ICU data, so output varies by device and cannot be asserted in a test.
3. Every rendered number gets `fontVariant: ["tabular-nums"]`.

Plus one accent-rule correction per card.

- [ ] **Step 1: TournamentResultCard**

- Sizes: `pillText` → `CARD_TYPE.label`; `championName` → `CARD_TYPE.title`; `runnerUpLabel` → `CARD_TYPE.label`; `runnerUpName` → `CARD_TYPE.subtitle`; `tournamentName` → `CARD_TYPE.subtitle`; `date` → `CARD_TYPE.caption`.
- Date: `formatMatchDate(date)` replaces `new Date(date).toLocaleDateString()` at line 35. Add the import.
- Accent rule: the `CHAMPION` pill currently has a `C.red` background *and* `glow(C.accent, 14, 0.5)`. The pill is framing, so it keeps `C.red` and **loses the cyan glow**. The champion's name keeps `textGlow(C.accent)` — it is the earned thing, and it becomes the card's single glowing element.

- [ ] **Step 2: SessionResultCard**

- Sizes: `title` → `CARD_TYPE.title`; `date` → `CARD_TYPE.caption`; `rank` → `CARD_TYPE.title`; `name` → `CARD_TYPE.subtitle`; `record` → `CARD_TYPE.subtitle`.
- Date: `formatMatchDate(session.starts_at)` replaces the `toLocaleDateString` at line 24. Add the import.
- Numerals: add `fontVariant: ["tabular-nums"]` to both `rank` and `record`. The win-loss column is the one place in the app where a proportional digit visibly misaligns a stacked list.

- [ ] **Step 3: BadgeResultCard**

- Sizes: `title` → `CARD_TYPE.title`; `desc` → `CARD_TYPE.body`; `name` → `CARD_TYPE.subtitle`.
- Accent rule: the icon and its ring move from `C.red` to `C.accent`. An unlocked badge is the archetypal earned thing, and today this card rings it red while `TournamentResultCard` glows its champion cyan for the same semantic role.
- Add `...textGlow(C.accent, 24)` to the badge `title` so this card has one glowing element like the others.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit && npm test`

Expected: both clean. No test renders these components.

- [ ] **Step 5: Verify no literals remain**

Run: `npx jest --version > /dev/null && grep -n "fontSize: [0-9]" src/components/share/*.tsx src/components/ShareCard.tsx`

Expected: no output. Every card font size now comes from `CARD_TYPE`. If any line prints, convert it.

- [ ] **Step 6: Commit**

```bash
git add src/components/share/TournamentResultCard.tsx src/components/share/SessionResultCard.tsx src/components/share/BadgeResultCard.tsx
git commit -m "refactor(share): put every card on the shared type scale and accent rule"
```

---

## Task 4: Capture at 1:1

**Files:**
- Modify: `src/lib/shareMatch.ts`
- Modify: `src/lib/share/captureAndShare.ts`

**Depends on:** Task 2. Do not run this before the match card is on `CardShell`, or that card will capture at 360×640 and ship a genuinely low-resolution image.

Every card now renders at the native 1080×1920 canvas, so asking `captureRef` to resize is redundant.

- [ ] **Step 1: Drop the resize options**

In `src/lib/shareMatch.ts`:

```ts
  const uri = await captureRef(ref, { format: "png", quality: 1 });
```

In `src/lib/share/captureAndShare.ts`:

```ts
    const uri = await captureRef(viewRef, { format: "png", quality: 1 });
```

- [ ] **Step 2: Replace both doc comments**

Both currently explain that `width`/`height` pin the capture because `ShareCard` is 360×640. That is no longer true and would mislead the next reader. Use, in each file:

```ts
/**
 * Capture a rendered card view to a PNG and hand it on.
 *
 * No resize options: every share card renders at CardShell's native
 * 1080x1920, which is Instagram's story size, so the capture is 1:1. Passing
 * width/height here would ask react-native-view-shot to rescale an image that
 * is already the right size, which it implements as a crop on some Android
 * versions.
 */
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `npx tsc --noEmit && npm test`

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shareMatch.ts src/lib/share/captureAndShare.ts
git commit -m "fix(share): capture cards 1:1 now that every card is native size"
```

---

## Manual verification

The whole point of this sub-project is visual, and none of it is covered by the node-env test suite. Run these on a device before calling it done:

- [ ] **Every card shows a scannable QR.** Share from all four surfaces: match history detail, post-match screen, session detail, tournament detail (complete tournament), and a badge from the profile screen. Scan each QR with a phone camera and confirm it opens the join link.
- [ ] **Every shared PNG is 1080×1920** and nothing is clipped at the top or bottom edge.
- [ ] **The four cards look related.** Put the five images side by side. Headline sizes should match; exactly one element should glow on each.
- [ ] **A best-of-5 match** does not overflow the safe zone with five chips.
- [ ] **A match over an hour** shows `1h 04′` in the TIME tile without truncation.
- [ ] **Long doubles names** truncate rather than pushing the stat row out of the frame.

---

## Self-Review

**Spec coverage (sub-project B only):**

| Spec requirement | Task |
|---|---|
| `CARD_TYPE` scale in theme.ts | 1 |
| Accent rule documented and applied | 1, 2, 3 |
| One glowing element per card | 2, 3 |
| `ShareCard` folded onto `CardShell`, QR restored | 2 |
| Re-derived at native 1080 | 2 |
| Radii from tokens, no literals | 2, 3 (step 5 checks) |
| `formatMatchDate` replaces `toLocaleDateString` | 3 |
| `tabular-nums` on every number | 2, 3 |
| `captureRef` resize removed, capture 1:1 | 4 |

Deferred to sub-project C by design: avatars on any card, the four call sites, and the image-load-during-capture race. Deferred to sub-project A: `PlayerStat.id`. Neither is referenced here.

**Deviation from the spec:** the spec put the match card's team rows with avatars in this sub-project's layout description. Avatars are entirely sub-project C, so Task 2 lays out names without them. The vertical budget leaves room: content sums to roughly 800 of the 1430pt safe zone, so adding avatar rows later does not force a re-layout.

**Ordering constraint:** Task 4 must follow Task 2. Called out in Task 4's header rather than left implicit, because running it first produces a silently low-resolution image rather than a test failure.

**Type consistency:** `CARD_TYPE` keys used in Tasks 2 and 3 are exactly the six defined in Task 1. `Tile` in Task 2 takes `{ label, value, valueColor? }`, matching all four of its call sites in the same file.

**Placeholder scan:** none. Task 3 is specified as per-property mappings rather than full file bodies because the three files are small and otherwise unchanged; every property that changes is named with its target token.
