# Phase 2 verification — H6, M8, A7

**Date:** 2026-08-14
**Branch:** `mobile-ux-phase-2` @ `100e0a8`
**Device:** realme NARZO 80 Lite, Android 15, 720×1600px ≈ 360×800dp — the same
device as the 2026-08-12 audit.
**Plan:** `docs/superpowers/plans/2026-08-13-mobile-ux-phase-2.md`
**Spec:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` §4 and §4a

Suite at verification: 61 suites / 432 tests passing, `npx tsc --noEmit` clean.

## Result

| Finding | Baseline | Capture | Verdict |
|---|---|---|---|
| **A7** | none — §26–27 could not be dumped | `a7-scoring-tree.xml` | **PASS** |
| **H6** orientation | `29-matches-live-landscape.png` | `h6-29-back-to-portrait.png` | **PASS** |
| **H6** pause | `28-scoring-paused.png` | `h6-28-paused.png` | **PASS** |
| **M8** | `26-scoring.png`, `27-scoring-point.png` | `m8-26-scoring-glow16-before.png`, `m8-27-scoring-point-10-10-landscape.png`, `m8-26-scoring-10-10-portrait-360dp.png` | **PASS** |
| Ops header (found bug) | none — new | `ops-header.png` | **PASS** |

### A7 — the scoring screen reaches idle

`adb shell uiautomator dump` on a live scoring screen now exits 0 and writes
25,410 bytes of real XML (`rotation="1"`). Five consecutive dumps were clean.
The audit's `ERROR: could not get idle state` does not reproduce.

**Task 2's leaf extraction alone was sufficient.** The plan's Task 3 Step 4
fallback — marking the ticking text node `importantForAccessibility="no"` — was
**not needed and not applied**, so the elapsed value remains in the
accessibility tree. Task 3 therefore produced no commit.

This was the phase's gate: every capture below depends on it.

### H6 — orientation

The scoring screen takes landscape on focus with no user interaction. Exits
tested, all landing portrait:

- **System back while in landscape** → Home renders portrait (`h6-29-back-to-portrait.png`). This is the audit's exact failure: `29-matches-live-landscape.png` showed Home, Matches and the tab bar stranded sideways, clipped, with the CTA under system chrome.
- **Force-stop and relaunch while in landscape** → Home opens portrait. Covers the crash-recovery path.
- The Auto/Portrait/Landscape picker still works and was used to move between orientations mid-match; the cleanup is unconditional, so the mode in force at exit does not matter.

### H6 — pause

`h6-28-paused.png`. Pause shows the scrim, blocks scoring, and **does not
navigate** — the audit's `28-scoring-paused.png` showed the Home tab.

Clock behaviour measured: paused at `00:14:22`, still `00:14:22` after 30+
seconds. Tapping where a `+1` rail sits resumed the match instead of scoring
(score stayed `10 – 10`). After resuming, the clock read `00:14:29` — continuing
from where it stopped rather than jumping the ~40 s spent paused, so the paused
span is genuinely excluded.

### M8 — scoreboard

Score digits are the dominant element: 56pt against 22pt `+1` labels and 13pt
names. Verified at `0 – 0`, `10 – 10` landscape, and `10 – 10` in 360dp
portrait. No clipping, no reflow as digits are added, names ellipsize as
designed.

**The spec §4a glow hypothesis is DISPROVED.** Four states were measured on
device at a `0 – 0` board:

| fontFamily | glow | `0` renders as |
|---|---|---|
| `F.display` (Russo One) | `textGlow(…, 16)` | solid filled block |
| `F.display` (Russo One) | none | **still a solid filled block** |
| `F.bold` (Chakra Petch Bold) | none | open counter, a numeral |
| `F.bold` (Chakra Petch Bold) | `textGlow(…, 16)` | open counter, glow intact |

The cause is the font — Russo One's zero closes up at this size — and the glow
is innocent. The fix is one property (`ribbonScore.fontFamily` → `F.bold`); the
glow stays, and `F.display` is kept everywhere else on the screen including the
`+1` rail labels. **Spec §4a should be corrected**: it records the glow as the
working hypothesis, and the measurement contradicts it.

`SCOREBOARD_TYPE.score` **stays at 56**. The plan's fallback of reducing it to
48 for a 360dp portrait overflow was not needed — see
`m8-26-scoring-10-10-portrait-360dp.png`. This also clears the Task 8 review's
deferred concern that `ribbonScore.minWidth: 72` was chosen without font metrics
and might clip a two-digit score.

### Ops header

`ops-header.png`. The navigation header reads `Live ops`; before, the
tournaments `Stack` declared no screen for `ops/[tournamentId]` and expo-router
titled it from the route filename. The screen's own in-body heading
(`Live Ops Dashboard`) was already correct and is unchanged. Renaming the
concept "Ops" itself is audit **M3** and remains Phase 4's.

## Test data

The audit's leftover fixtures were **retained, not cleaned**. Verification used
the existing `Weekend` club and its players, plus a new doubles match scored to
`10 – 10` and left unfinished, and the pre-existing `Nasdaqyy` live tournament.
Home's match count moved 8 → 9 during the pass. None of this affects the
findings above, but a later phase diffing against the audit baseline should
expect it.

## Not closed here

Nothing this phase claimed is outstanding. Two items were observed in passing
and belong to other phases:

- **P1** is visible in every Home capture: `Longest Streak` wraps to two lines, dropping its value to y≈1063 against y≈1032 for `Matches` and `Win Rate`. Phase 5 owns it.
- The scoring toolbar's `iconBtn` is 46×40dp, under the 48dp floor. Phase 6's measured sweep owns it; raising it here would have changed the toolbar height and made these before/after captures harder to read.
