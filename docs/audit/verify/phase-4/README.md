# Phase 4 verification — H7, M1, M2, M3, M9, P8, P9, P14, P15, P16

**Date:** 2026-08-14
**Branch:** `worktree-mobile-ux-phase-4` (worktree) @ base `de3f4f7`
**Plan:** `.superpowers/sdd/2026-08-14-mobile-ux-phase-4/` (task briefs 1-14)

Suite at verification: **67 suites / 456 tests passing**, `npx tsc --noEmit`
**clean** (exit 0, no output).

## Device access: none this session — no phase-4 screenshots exist

This session's tool set does not include a working device bridge:
`mobile_list_available_devices` (mobile-mcp) returned empty, with no ADB
device to reverse-tunnel or attach to. This was true for every task in this
phase, not just this final verification pass — no task report anywhere in
`.superpowers/sdd/2026-08-14-mobile-ux-phase-4/` records a device screenshot,
and the ledger (`progress.md`) records no device evidence for any of the ten
tasks that closed with a commit.

Per the plan's Global Constraints and Phase 3's own precedent (`docs/audit/verify/phase-3/README.md`,
"No finding in this phase has a post-fix on-device screenshot... recorded
here as an honest gap rather than worked around"), this is recorded plainly
rather than worked around. **None of the `m2-selection.png`, `h7-new-tournament.png`,
`m9-session-games.png`, `m1-end-match-dialog.png`, `m1-finish-session-dialog.png`,
`m3-tab-and-title.png`, `p8-club-detail.png`, `p9-club-sheet.png`,
`p14-disabled-create.png`, `p15-plan-session.png`, `p16-tab-icons.png` files
the brief's Step 2 table calls for were captured, and this directory contains
no images.** Every finding below closes on code-and-typecheck evidence only.

## Result — what evidence actually exists, per finding

| Finding | Commit | Device evidence | What stands in for it | Verdict |
|---|---|---|---|---|
| **M2** | `7f2ede5`, `aebaf1e`, `7584042`, `6149f73` | None | Code read: `SegmentedControl.tsx` and three screens' selection styles now key off the neutral `selected`/`selectedText` theme tokens, not `C.red`/cyan — but the audit's own text names `app/new-match.tsx` as a site, and it (plus nine other sites) still fills selection with `C.red`/cyan; see "M2 — partially closed" below | **PARTIALLY CLOSED** |
| **H7** | `740abd6` | None | Code read of `app/(app)/tournaments/new.tsx`'s `gamesRow` layout, plus an independent flexbox-math verification by the task reviewer during Task 5's review (see `progress.md`) | **CODE+TYPECHECK ONLY (reviewed)** |
| **M9** | `b9e3c0b` | None | Code read of `app/(app)/sessions/[id].tsx`: Attendance/Games, Auto/Manual, and Doubles/Singles now use three visually distinct control styles; confirmed no dangling style references left behind | **CODE+TYPECHECK ONLY** |
| **M1** | `facbf66` | None | Code read: all three remaining `Alert.alert` destructive-confirmation call sites (`src/screens/MatchScreen.tsx`, `app/(app)/matches/index.tsx`, `app/(app)/sessions/[id].tsx`) converted to `AppDialog`; confirmed no stray `Alert.` calls remain in any of the three touched files (`grep -rn "Alert\." src/screens/MatchScreen.tsx "app/(app)/matches/index.tsx" "app/(app)/sessions/[id].tsx"` returns nothing) | **CODE+TYPECHECK ONLY** |
| **M3** | `90f0b36` | None | Code read of `app/(app)/_layout.tsx` and the bracket detail screen: exact string values confirmed — tab reads "Tournaments", detail header reads "Tournament" | **CODE+TYPECHECK ONLY** |
| **P8** | none (Task 9) | None | Already closed by prior work — `app/(app)/clubs/[id].tsx`'s `cta` (filled `C.red`) vs `secondary` (outlined, `cardHi`/`line` border) style pair predates this phase; re-confirmed by direct code read this pass, no diff to verify | **ALREADY CLOSED, CODE-CONFIRMED** |
| **P9** | `1e7194d` | None | Code read: ClubSheet's Create action is filled red, Join is outlined | **CODE+TYPECHECK ONLY** |
| **P14** | `2378767` | None | Code read: disabled Create-bracket button now reads as neutral grey when disabled, not a dimmed red | **CODE+TYPECHECK ONLY** |
| **P15** | `c97daaa` | None | Code read of the new-session placeholder/Stepper change, plus an independent trace of the save-path fallback through `sessionRepo.ts` by the task reviewer during Task 12's review (see `progress.md`) confirming all three blank-field scenarios converge on "Badminton hall" | **CODE+TYPECHECK ONLY (reviewed)** |
| **P16** | none (Task 13) | None | Already closed by prior work — `app/(app)/_layout.tsx` routes every `tabBarIcon` through `Icon.tsx`'s flat `Ionicons`/`MaterialCommunityIcons`, no emoji or multicolor glyphs found; re-confirmed by direct code read this pass, no diff to verify | **ALREADY CLOSED, CODE-CONFIRMED** |

No finding in this phase has a post-fix on-device screenshot. All ten close
on code and typecheck evidence; two of the eight code-changed findings (H7,
P15) additionally carry an independent second read from a task reviewer
during the original implementation review, and two findings (P8, P16) close
because they were already true before this phase started, not because of new
work in this phase.

### P8 and P16 — already closed by prior work, not by Phase 4

Per the brief's Step 3 instructions and matching how Phase 3's README handled
its own already-closed findings (H4's Config/Players panels, closed by prior
refactors and recorded as such rather than credited to Phase 3):

- **P8** (`app/(app)/clubs/[id].tsx`): Task 9 found the club-detail screen
  already has a two-tier button hierarchy — `cta` (filled `backgroundColor: C.red`)
  for "Start a match" versus `secondary` (outlined, `backgroundColor: C.cardHi`,
  `borderWidth: 1`, `borderColor: C.line`) for "Live now" / "Pending requests" /
  "Manage players". No code change was made; Task 9 closed with no commit.
  This verification pass re-read the same lines (`s.cta`, `s.secondary` in the
  `StyleSheet.create` block) and confirms the same style pair is still in
  place, unmodified by anything landed later in this phase.
- **P16** (`app/(app)/_layout.tsx`): Task 13 found the tab bar already renders
  every tab icon through the shared `Icon` component (`Ionicons`/`MaterialCommunityIcons`),
  not emoji or ad hoc multicolor glyphs. No code change was made; Task 13
  closed with no commit. This pass re-read `_layout.tsx`'s five `Tabs.Screen`
  entries and confirms all five still route through `icon(name)` → `<Icon name={name} .../>`.

Both are recorded as closed by work that predates this phase (per Task 9's
and Task 13's own measure-first framing), not claimed as new fixes.

### M2 — partially closed: plan-scoping gap, not an implementation gap

The audit's own M2 text (`docs/audit/2026-08-12-ux-audit/AUDIT.md`) reads:
"selection is red on New match / New tournament Config, but cyan on the
Entrants list." This phase's tasks fixed New tournament Config and the Entrants list, keying
their selection styles off the neutral `selected`/`selectedText` theme
tokens. But `app/new-match.tsx` — the first screen the audit names —
was never touched, and neither were several other screens with the same
red/cyan-selection pattern. A code search this pass found these surviving
sites:

- `app/new-match.tsx` (`segOn`: red — the audit-named screen, **not** fixed
  this phase)
- `src/components/TournamentConfigTab.tsx` (`segOn`: red)
- `app/(app)/tournaments/edit/[id].tsx` (`segOn`: red, same literal)
- `src/components/TournamentPlayersTab.tsx` (`chipOn`/`chipTextOn`: cyan —
  the exact anti-pattern `theme.ts` documents as rejected)
- `app/(app)/matches/index.tsx` (`fChipOn`: red)
- `app/new-session.tsx` (`chipOn`: red)
- `app/(app)/profile/index.tsx`, `app/welcome.tsx`,
  `src/components/ClubPicker.tsx`, `src/components/TimePicker.tsx` (same
  red-selection pattern)

This is a plan-scoping gap, not an implementation gap — the tasks correctly
touched exactly the files the plan named, but the plan under-scoped M2
relative to the audit's own text, which named `new-match.tsx` explicitly. A
follow-up phase (Phase 4b) should do a mechanical `segOn`/`chipOn` →
`selected` token sweep over these ten sites. No such sweep was made as part
of this fix; this is a documentation correction to the verdict only.

### H7 and P15 — reviewer-verified beyond the implementer's own read

- **H7** (`740abd6`, `app/(app)/tournaments/new.tsx`): the task reviewer
  independently worked through the flexbox math of the `gamesRow` layout
  during Task 5's review and confirmed the fix — logged in `progress.md`
  as "Task 5: complete (commits 6149f73..740abd6, review clean)", with a
  separate deferred-minor note that the fix's correctness depends on Courts
  staying third in DOM order (not a defect, a documented fragility).
- **P15** (`c97daaa`, session-planning screen + `sessionRepo.ts`): the task
  reviewer independently traced the save-path fallback through
  `sessionRepo.ts` during Task 12's review and confirmed all three blank-field
  scenarios converge on "Badminton hall", matching pre-change behavior —
  logged in `progress.md` as "Task 12: complete (commits 2378767..c97daaa,
  review clean — reviewer independently traced the save-path fallback
  through sessionRepo.ts...)".

Neither reviewer check involved a running device; both are code-level traces.

## Suite and typecheck (Step 4)

```
Test Suites: 67 passed, 67 total
Tests:       456 passed, 456 total
Snapshots:   0 total
```

`npx tsc --noEmit` — clean, no output, exit 0.

This is one test higher than Phase 3's closing count of 455 (`progress.md`'s
own baseline note records 456 for this phase's start, i.e. from something
that landed between the two phases, not from this phase's work — this phase
added no new test files per its Global Constraints, and no task report in
this plan claims one).

## Summary

| Finding | Real device confirmation | Code+typecheck confirmation | Independent second read |
|---|---|---|---|
| M2 | No | Partially (10 sites still red/cyan, see "M2 — partially closed") | No |
| H7 | No | Yes | Yes (reviewer, flexbox math) |
| M9 | No | Yes | No |
| M1 | No | Yes | No |
| M3 | No | Yes | No |
| P8 | No | Yes (already closed, prior work) | No |
| P9 | No | Yes | No |
| P14 | No | Yes | No |
| P15 | No | Yes | Yes (reviewer, save-path trace) |
| P16 | No | Yes (already closed, prior work) | No |

Phase 4 closes on code and typecheck evidence for all ten findings. No device
was available to this session at any point — not ambiguously available as in
Phase 3, but entirely absent from the tool set (`mobile_list_available_devices`
returned no devices). This is recorded here as an honest gap rather than
worked around, consistent with the plan's Global Constraints and Phase 3's
own precedent.
