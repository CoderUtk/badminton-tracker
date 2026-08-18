# Achievements Section Redesign

**Goal:** Turn the profile screen's achievements card from a flat wall of 22 badge
chips into a section that celebrates what the player has earned and pulls them toward
the next one, while fixing the accessibility failures and the colour contradiction the
share-card work introduced.

This is Project 2 of the two-project split made on 2026-08-16. Project 1 (the share-card
system convergence) is complete and merged.

## Problem

`src/components/BadgeGrid.tsx` renders all 22 badges in a single two-column wrap, in
definition order, inside a card on the profile screen
(`app/(app)/profile/index.tsx:419-425`).

1. **Earned badges are buried.** Definition order interleaves earned and locked, so a
   player with 7 badges hunts through 22 chips to find them. There is no grouping, no
   sorting, and no way to see progress at a glance.
2. **The earned colour now contradicts the share card.** `BadgeGrid` uses `C.red` for
   earned badges. The 2026-08-16 card convergence moved `BadgeResultCard` to `C.accent`
   under the accent rule documented in `src/theme.ts`: red frames identity, cyan marks
   the earned thing. Tapping a red badge currently produces a cyan share card.
3. **Text below the readable floor.** `desc` and `progressLabel` are both `fontSize: 10`
   (`BadgeGrid.tsx:89,93`). The platform floor for in-app body text is 12.
4. **The pressable is unlabelled.** The earned-badge `Pressable` (`BadgeGrid.tsx:30`)
   has no `accessibilityRole` and no `accessibilityLabel`, so a screen-reader user hears
   nothing about what it is or what tapping does. `src/components/NextSessionCard.tsx`
   already does this correctly, so the pattern exists and this component missed it.
5. **Locked and in-progress differ only by colour.** `iconColor` is `C.ghost` when locked
   and `C.text` when in progress (`BadgeGrid.tsx:25`), with the percentage label the only
   non-colour signal. This fails the "never convey meaning by colour alone" rule.
6. **Token drift.** `borderRadius: 12` is hardcoded (`BadgeGrid.tsx:68`) rather than
   `radius.md`, the same drift the share cards had before convergence.

## Scope

- Restructure the achievements section into a summary header plus three groups.
- Fix the six defects above.
- Keep it a section on the profile screen. No new route, no new tab.

Out of scope, and deliberately so: a dedicated achievements screen, a `category` field on
`Badge`, earned-on dates, any change to which badges exist or how they are evaluated, and
any change to `BadgeSharePopup` or `BadgeResultCard`.

## Structure

The section renders, top to bottom:

### Summary header

`7 of 22` with a slim progress bar beneath. The count is `badges.filter(b => b.earned).length`
over `badges.length`; the bar's fill is that ratio. This is the only place the player can
currently learn how far along they are without counting chips.

### 1. Earned

The existing chip grid, restricted to `b.earned`, with `C.accent` replacing `C.red`
throughout: icon colour, chip border, checkmark, and title.

Order is the badges' definition order, unchanged. Recency ordering is not possible — see
Non-goals.

**Empty state.** A player with no badges yet is the most common view, not an edge case.
When the earned group is empty it is replaced by a single line of encouragement rather
than an empty container or a zero-height gap, and the Next up group carries the section.

### 2. Next up

Up to **three** unearned badges with the highest `progress`, where `progress > 0`, sorted
descending. Fewer than three is normal and correct: a player may have only one badge in
progress. Rendered larger than a chip: full row width, icon, title, description, a
progress bar, and the percentage.

This group is the reason the redesign exists. It is what converts "I have 7 badges" into
"I am two wins from an eighth".

If no unearned badge has progress above zero, the group is omitted entirely rather than
rendered empty.

### 3. Locked

Everything else: unearned with `progress === 0`. Collapsed behind a disclosure row
showing the count (`Locked (14)`). Expanding reveals the existing chip grid, dimmed.

Collapsed is the default. The point of the redesign is that 14 untouched badges should
not be the first thing a player scrolls past.

## Grouping derivation

All three groups derive from fields that already exist on `EarnedBadge`
(`src/achievements/types.ts`):

```ts
export type Badge = { id: string; title: string; description: string; icon: string };
export type EarnedBadge = Badge & { earned: boolean; progress: number };
```

- Earned: `b.earned`
- Next up: `!b.earned && b.progress > 0`, sorted by `progress` descending, take 3
- Locked: `!b.earned && b.progress === 0`

No new field is added to `Badge`, and `src/achievements/rules.ts` is not touched. A
`category` field would mean editing all 22 rule entries to support a grouping this design
does not use.

The partition is exhaustive and non-overlapping by construction: every badge is either
earned or not, and every unearned badge has progress either above zero or equal to zero.
This is worth a unit test, because the grouping function is the only new logic here and a
badge silently belonging to no group would vanish from the screen.

## Accessibility

Each fix addresses a specific defect above:

- `desc` and `progressLabel` move from `fontSize: 10` to `12`, the in-app floor. Note this
  is unrelated to `CARD_TYPE`, whose floor of 18 applies to the 1080-wide share-card
  canvas, not to phone-screen text.
- The earned-badge `Pressable` gains `accessibilityRole="button"` and an
  `accessibilityLabel` naming the badge and its state, following the pattern already in
  `src/components/NextSessionCard.tsx`.
- Locked badges gain a lock glyph so the state is not carried by colour alone. In-progress
  badges keep their percentage, which already serves that purpose.
- The Locked disclosure row is itself a labelled, expanded/collapsed-announcing control.

Colour contrast is unchanged: `C.text2` and `C.text3` both already clear AA on
`C.bgElev`, and `tests/themeTokens.test.ts` asserts this.

## Colour

`C.accent` replaces `C.red` for every earned-badge affordance in `BadgeGrid`. This is not
a taste change; it applies the accent rule already documented in `src/theme.ts` and
already followed by `BadgeResultCard`, which the badge chip links to.

`C.ghost` remains correct for the locked progress-bar fill: it is a decorative bar, not
text, which is exactly what that token is reserved for.

`borderRadius: 12` becomes `radius.md`.

## Components

`BadgeGrid.tsx` currently owns both the grid layout and the chip. Splitting it keeps each
file focused and lets the chip be reused by the Earned and Locked groups without
duplication:

- `src/components/achievements/BadgeChip.tsx` — one chip. Props: the badge, an optional
  press handler, and a `dimmed` flag for the locked group.
- `src/components/achievements/NextUpRow.tsx` — one full-width in-progress row.
- `src/components/achievements/AchievementsSection.tsx` — the summary header, the three
  groups, and the disclosure state. This is what `profile/index.tsx` renders.
- `src/achievements/grouping.ts` — the pure partition function, unit-tested.

`BadgeGrid.tsx` is deleted once `AchievementsSection` replaces it. Its only caller is the
profile screen.

## Testing

Pure logic only, per this repo's node-environment Jest setup. React Native components are
never unit-tested here.

`tests/achievements/grouping.test.ts` covers the partition:

- every badge lands in exactly one group, across a mixed input
- Next up is sorted by progress descending and capped at three
- a badge with `progress === 0` and `earned === false` is Locked, not Next up
- an earned badge with `progress < 1` is still Earned (progress is not the earned test)
- empty input yields three empty groups rather than throwing

Manual verification on a device, since none of the layout is covered by tests:

- a fresh account (0 earned) shows the encouragement line and a populated Next up
- an account with badges shows Earned first, Next up below, Locked collapsed
- the Locked disclosure expands and collapses, and announces its state to a screen reader
- tapping an earned badge still opens the share popup

## Non-goals, with reasons

- **Earned-on dates and recency ordering.** Badges are computed live by
  `evaluateBadges(analytics, profile)` in `src/achievements/rules.ts`; nothing is
  persisted, so no timestamp exists. Adding one means introducing badge-state storage and
  a sync path — a separate project, not a detail of this one.
- **A dedicated achievements screen.** Considered and rejected for now; the section stays
  on the profile screen. Worth revisiting if the badge count grows well beyond 22.
- **Badge categories.** See Grouping derivation.
