# Dynamic Serve Indicator Design

## Goal
Eliminate the visual bias towards Team Red by making court serve highlights, serve dots, announcement bubbles, and score ribbon serve indicators dynamically reflect the color of the team currently serving (Team A: Red, Team B: Blue).

## Background & Problem
Previously, `Court.tsx` and `MatchScreen.tsx` hardcoded `C.red` for:
- Court service box highlight border & tint (`boxServing`)
- Court serve indicator dot (`dot`)
- Announcement banner bubble (`bubble`)

This gave Team Red a permanent visual advantage regardless of which team was serving.

## Proposed Changes

### 1. `src/components/Court.tsx`
- Determine serving team color: `servingColor = state.servingTeam === "A" ? C.red : C.blue`.
- Pass dynamic styles to `boxServing` and `dot`:
  - `borderColor`: `servingColor`
  - `backgroundColor`: `servingColor === C.red ? "rgba(255, 59, 48, 0.12)" : "rgba(59, 130, 246, 0.12)"`
  - Serve dot `backgroundColor` & `shadowColor`: `servingColor`

### 2. `src/screens/MatchScreen.tsx`
- Update announcement bubble background to match serving team color (`state.servingTeam === "A" ? C.red : C.blue`).
- Update score ribbon serve dot (`serveDot`) color from fixed `C.green` to match serving team color.

## Verification Strategy
- Run unit/component tests (`npm test` / jest).
- Verify type checks with TypeScript (`npx tsc --noEmit`).
