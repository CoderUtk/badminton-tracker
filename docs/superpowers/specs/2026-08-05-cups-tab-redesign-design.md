# Cups Tab Status Chip/Tile Redesign

**Date:** 2026-08-05

## Problem

`app/(app)/tournaments/index.tsx` renders tournament status (`draft`/`live`/`done`) as
plain lowercase text appended to the meta line. No visual weight, no color coding beyond
the trophy icon tint. The rest of the app (`sessions/index.tsx`) already has a proven
status-chip pattern (colored dot + pill + card left-border) that Cups doesn't use, so it
reads inconsistently plainer than Sessions.

## Design

Port the sessions-list chip/tile pattern into the tournaments list, using the app's
existing `C` theme tokens — no new palette introduced (checked `ui-ux-pro-max`'s
`--design-system` output; its suggested green/gold palette doesn't fit this app's
established red/cyan HUD identity, and its font recommendation already matches the
app's current Russo One / Chakra Petch pairing, so no typography change needed).

**Status color map** (mirrors `STATUS_COLOR` in `sessions/index.tsx`):
- `draft` → `C.accent` (cyan)
- `live` → `C.red`
- `done` → `C.text3`

**Card changes** (`app/(app)/tournaments/index.tsx`):
- `borderLeftColor`/`borderLeftWidth: 4` in the status color, same as the sessions card.
- Trophy icon sits in a tinted circular background (`color + "15"`) instead of bare on
  the card background.
- Status renders as a pill: colored dot + uppercase label + tinted background
  (`color + "22"`), same shape as the sessions pill — replaces the current plain-text
  status suffix.
- `live` tournaments additionally get the existing `glow(C.red, 10, 0.35)` shadow on the
  card for a sense of urgency/energy — `done`/`draft` stay flat.
- Meta line keeps `{size}-player` info; status moves fully into its own pill instead of
  being concatenated into the meta text.

## Scope

Single file: `app/(app)/tournaments/index.tsx`. No new shared component — the chip is
small enough to stay inline, matching how `sessions/index.tsx` does it (no extraction
there either). No changes to `tournamentRepo.ts`, no new statuses, no DB changes.

## Testing

Visual-only change, no logic. Verify via `npx tsc --noEmit` and manual look at the tab
with tournaments in each of the three statuses (draft/live/done) plus the empty state.
