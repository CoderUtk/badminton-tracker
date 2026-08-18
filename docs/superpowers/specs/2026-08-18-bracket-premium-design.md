# Bracket screen — premium pass (Tier 1)

**Date:** 2026-08-18
**Component:** `src/components/BracketView.tsx`
**Consumers:** `app/(app)/tournaments/[id].tsx`, `app/join/tournament/[id]/spectator.tsx`

## Problem

`theme.ts` carries a full premium direction — carved surfaces lit from above,
ambient blooms, glow presets, an esports type pairing. The bracket uses almost
none of it: flat `C.card` boxes with a 1px border, plain diagonal `<Line>`
connectors, and no round labelling at all. It reads as a wireframe embedded in
a designed app.

Three specific failures:

1. **No orientation.** Nothing on screen says which column is the final. On a
   16-player bracket the user scrolls a grid of identical boxes.
2. **Diagonals read as a graph, not a bracket.** The one visual convention
   every viewer already knows for this data structure is the orthogonal elbow.
3. **No narrative.** Every connector looks the same whether or not anyone has
   advanced along it. The bracket shows structure but not progress.

## Scope

In: connectors, round headers, cell surface, champion cell, colour semantics.

Out (deliberately deferred): avatars and seed chips, pinch-zoom / fit-to-screen,
entrance and live-pulse motion, cell width for doubles pairs, TBD ghost slots.
These are real, but each is independently shippable and none of them is blocked
by this pass.

## Colour semantics

`theme.ts` documents the rule: `C.accent` is the earned thing, `C.red` is
identity and framing. BracketView currently inverts it — live cells are cyan,
the champion is red. Resolved in favour of the documented rule:

| State | Colour |
|---|---|
| Match in progress | `C.red` (already the colour of the existing live dot) |
| Edge someone advanced along | `C.accent` |
| Champion cell | `C.accent` + `glow` + `textGlow` |
| Everything else | `C.line` |

This flips the live cell border from cyan to red. Accepted: it makes
"happening now" and "already won" scannable as two different things, which they
currently are not.

## Geometry

`CELL_W`, `CELL_H`, `GAP_Y`, `COL_GAP`, `colX` and `computeCenters` are
unchanged. The champion cell does not grow — enlarging one cell would force the
centre calculation to become size-aware for a single visual beat. It is
distinguished by fill and glow instead.

The header rail is a fixed 30px row above the canvas, outside the centre maths.

## Components

### `roundName(round, maxRound)` — `src/tournament/bracketLabel.ts`

Pure, derived from rounds remaining: `FINAL`, `SEMIS`, `QUARTERS`,
`ROUND OF 16`, else `ROUND {n}`. Lives beside `bracketCellLabel` because that
module is already the tested home for bracket string logic, and because a
plain `.ts` module is importable by Jest under this project's tsconfig where a
`.tsx` is not.

### `elbowPath(x1, y1, x2, y2, r)` — same module

Returns an SVG path string: out right from the parent's right edge to the
mid-gutter, a quadratic corner of radius `r`, vertical run, a second corner,
then into the child's left edge. When `y1 === y2` it emits a straight
horizontal run — a quadratic across a flat segment renders as a visible wobble.

Pure and string-returning, so it is testable without a renderer.

### Header rail — `BracketView`

Sits inside the horizontal `ScrollView`, above the vertical one, so it scrolls
sideways in lockstep with the columns and stays visible during vertical scroll.
Built as one `View` of width `totalW` containing a per-round cell of
`width: CELL_W, marginRight: COL_GAP` — the same rhythm the columns are laid
out on, so labels align without a second source of truth for `colX`.

Each header shows the round name in `F.display` 11pt, letterSpacing 1, plus a
`decided/total` sub-count. `C.text3` normally; `C.text` for the round that
contains at least one live match.

### Connectors — `BracketView`

`<Line>` replaced with `<Path>` from `elbowPath`. An edge is lit when its
parent match has a `winnerEntrant`. Lit edges draw twice: a 6px stroke at 0.12
opacity as a bloom, then a 2px stroke at full opacity on top. SVG has no cheap
shadow primitive; a double stroke is the honest approximation. Unlit edges are
a single 1.5px `C.line`.

### Cell — `BracketCell`

The `TouchableOpacity` wraps a `CarvedCard` rather than styling a bare `View`.
`CarvedCard` already encapsulates the two-stop translucent fill and the
asymmetric border that make a surface read as carved; re-declaring that inline
is exactly the drift its docstring warns about.

Border colour overrides per state. The losing side's row drops to opacity 0.45,
so the winner reads as the row rather than as a slightly brighter grey.

## Testing

`elbowPath` and `roundName` get unit tests beside the existing
`bracketCellLabel` tests — including the flat-run case, which is the only
branch where a wrong path string is visually obvious but silently valid SVG.

Visual treatment is not unit tested. Existing bracket tests must stay green.

## Risks

- **Android glow.** `glow()` uses `elevation`, which on Android tints by
  elevation rather than by `shadowColor`. The champion cell's cyan bloom may
  render as a neutral drop shadow there. Acceptable — the accent border and
  `textGlow` carry the state on their own.
- **Path count.** One extra `<Path>` per lit edge doubles the SVG node count in
  the worst case (15 edges for a 16-player bracket). Negligible.
