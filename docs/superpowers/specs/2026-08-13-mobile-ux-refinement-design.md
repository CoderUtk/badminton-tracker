# Mobile UX & Interaction Architecture Refinement — Design

**Date:** 2026-08-13
**Status:** Design approved (planning only; no implementation yet)
**Source:** `docs/audit/2026-08-12-ux-audit/AUDIT.md` (43 findings, Android 15, 360×800dp)

Close every finding from the 2026-08-12 Android UX audit in one spec, sequenced
into seven phases. Phase 0 builds tokens and primitives; phases 1–6 apply them
screen by screen, each ending at a mobile-mcp re-audit of its own findings.

## Context

The audit was run with mobile-mcp over ADB against a dev client on a realme
NARZO 80 Lite (Android 15, 720×1600px ≈ 360×800dp) at `master` @ `93b5b9b`. It
covered 38 screens and produced 7 high, 10 medium, 8 accessibility and 18 polish
findings. Screenshots are the verification baseline and are referenced by
filename throughout.

Three of the high findings share one root cause. `app.json` sets
`softwareKeyboardLayoutMode: "resize"`, but RN 0.81 / Expo 54 force edge-to-edge
on Android 15, where `adjustResize` no longer resizes the window. The court on
`app/new-match.tsx` therefore never moves for the IME (H1), the anchored
suggestion panel opens underneath it (H2), and the root view — a plain
`KeyboardAvoidingView` with no safe-area inset at all — lets the primary CTA run
under the navigation bar (H3).

Two of the high findings are misdiagnosed in the audit and are corrected here.

**H4 is not dead buttons.** `app/(app)/tournaments/[id].tsx:340-348` wires
Config, Players and Scorers to the same `setTab` + `setPanelOpen(true)` handler,
and Ops routes to a real file at `app/(app)/tournaments/ops/[tournamentId].tsx`.
`TournamentConfigTab` early-returns at line 101 on `!isAdmin || !isDraft`, so on
a **live** tournament the `BottomPanel` opens with empty content and reads as no
response. The defect is an unhandled empty state, not a broken handler.

**H2 is not a layout accident.** The panel deliberately drops into the half's
other court box (`src/components/Court.tsx:145-168`, from `97b9e01` and
`23d7d79`) so the field being typed into stays visible. The audit read it as a
collision because the covered box still renders as live. The fix is legibility,
not relocation.

## Decisions taken during design

**One spec, phased.** The 43 findings span layout bugs, logic bugs and a design
system rewrite — three different risk profiles. They are kept in one spec at the
user's direction, with phase ordering doing the isolation work instead.

**Red stays primary; destructive goes outline.** Brand red keeps every primary
CTA. Destructive actions become outlined — transparent fill, red border, red
label — and always route through a confirmation dialog. Filled red means go;
outlined red means danger. No new hue.

**Selection carries no hue at all.** Cyan was considered and rejected: it
already means DRAFT in the status palette, so reusing it would recreate exactly
the double-meaning being removed from red, and at ~0.55 relative luminance
against red's ~0.24 it would make passive selected state louder than the primary
action. Selection is a state, not an action, so it gets neutral elevation.

**Hard portrait lock outside scoring.** No screen but live scoring will ever be
reachable in landscape.

**In-court editing is kept.** The court metaphor is one of the audit's
"what worked well" items and the panel-anchoring work is recent. The keyboard is
fixed underneath it rather than replacing the interaction.

## Scope

**In:** all 43 findings — H1–H7, M1–M10, A1–A8, P1–P18.

**Out, and untouched:** sign-in, onboarding, sign-up, the notification
permission flow, share-to-story output, session Start/Finish with auto game
generation, the club invite share sheet, and every delete flow. The audit never
reached these (AUDIT.md §1), so their UX state is unknown rather than assumed
good. Phase 0's token changes reach them incidentally; nothing else does.

---

## 1. Palette after Phase 4

Hue is spent only on actions and on live state.

| Token | Meaning | Applied to |
|---|---|---|
| `red` filled | primary action, one meaning only | Start a match, Start scoring, Create |
| `red` outline | destructive | Delete tournament, Remove player, End match |
| `green` | live / in progress / winner | LIVE badge, live match card, Resume |
| `cyan` | draft | DRAFT tournament |
| `amber` | scheduled | upcoming session |
| `text3` neutral | done / past | completed match, DONE tournament |
| `cardHi` + `lineHi` | selected | every segment, chip, entrant row |

Green-vs-red as the live/primary pair is the worst case for deuteranopia (~8% of
men) and status is currently colour-only. Every status therefore carries a text
label or icon alongside its hue, so colour is never the sole carrier
(WCAG 1.4.1).

## 2. Phase 0 — Foundations

No screen changes. `src/theme.ts` and `src/components/` only.

**Tokens.**
- `danger`: the outline recipe — `backgroundColor: "transparent"`, `borderWidth: 1.5`, `borderColor: C.red`, label `C.red`.
- `selected`: `backgroundColor: C.cardHi`, `borderColor: C.lineHi`, label `C.text`.
- `space`: `{ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }` — the 8pt grid all spacing aligns to.
- `text3` corrected. `#5C6472` on `#0C0E12` measures ≈3.4:1 and fails AA for body and secondary text; it is the root of A8. Raised until it measures ≥4.5:1 and re-checked against `C.card` and `C.cardHi`, not just `C.bg`.

**Primitives.**
- `AppDialog` — themed confirm/cancel dialog replacing the native `AlertDialog` (M1). Destructive variant uses the `danger` recipe.
- `Chip` and `Segment` — 48dp minimum on both axes, `accessibilityRole` set, `accessibilityState.selected` exposed (M4, A4), neutral-elevation selected styling.
- `Group` — grouping surface using `rgba(255,255,255,0.06)` plus optional hairline border. Replaces every card-inside-a-card.
- `useScreenInsets` — wraps `useSafeAreaInsets`, returns the bottom padding a screen with a docked CTA must apply.
- `PressableScale` extended to cover the icon-button and row cases currently using raw `Pressable`.

## 3. Phase 1 — Ergonomics & safe area

Closes **H1, H2, H3, M4, M10, P4**.

**Keyboard.** `KeyboardProvider` from `react-native-keyboard-controller` wraps
the root in `app/_layout.tsx`. `app/new-match.tsx` root becomes an
`Animated.View` whose `translateY` derives from `useReanimatedKeyboardAnimation()`:

```
shift = clamp(kbHeight - belowCourtHeight - bottomInset, 0, topRowHeight)
```

`belowCourtHeight` is measured with `onLayout` on the format-row/hint/CTA block.
With a ~270dp IME and a ~180dp block the shift lands near 90dp, so the
Doubles/Singles row is what scrolls away — the right thing to sacrifice while
naming a player. Transform only, driven on the UI thread. If the handler reports
no height the shift stays 0 and the screen degrades to today's behaviour rather
than breaking.

**Panel collision.** While the panel is open the covered `CourtBox` drops to
`opacity 0.35` and stops taking touches, and the panel gains a caret pointing at
the field it fills, so it reads as a menu over an inactive area. Panel
`maxHeight` clamps to the space above the keyboard so it can never extend under
the IME.

**Safe area.** Every screen with a docked CTA consumes `useScreenInsets`. H3's
specific case: `app/new-match.tsx` CTA at `y 1456→1568` against a nav bar
starting at `y 1504`.

**Touch targets.** Attendance `In`/`Maybe`/`Out` go from 43×32dp to ≥48×48dp
with `hitSlop` where bounds cannot grow, and gain `accessibilityState.selected`
(M4 + A4).

**Sheets.** Modal sheets render above the bottom tab bar and gain an explicit
close button; drag-to-dismiss stays as a secondary gesture (M10). Profile
content stops scrolling under the tab bar (P4).

## 4. Phase 2 — Orientation & match lifecycle

Closes **H6, M8, A7**. The timer fix runs first because it gates verification of
the rest.

**Timer (A7).** The elapsed-time chip re-renders `src/screens/MatchScreen.tsx`
every tick, which is why `uiautomator dump` reports `ERROR: could not get idle
state` and why the longest-lived screen drains battery. It moves into its own
leaf component driven by a Reanimated shared value so the tree goes idle between
points.

**Orientation contract (H6).** Three parts:
- `app.json` declares `orientation: "portrait"`, so no screen rotates by default.
- The scoring screen takes the lock in `useFocusEffect` — `lockAsync(LANDSCAPE)` on focus, `lockAsync(PORTRAIT_UP)` in the cleanup. Unmount, back gesture, pause, deep-link and crash-recovery all restore identically.
- Pause stops calling navigation entirely and sets a local paused state with a resume affordance.

**Scoreboard (M8).** Score digits become the dominant element, larger than
player names, the `+1` buttons and the elapsed-time chip. The `0` glyph stops
rendering as a filled coloured rectangle so `1 – 0` reads as two numerals.

### 4a. Amendments from Phase 2 planning (2026-08-13)

Four corrections, made after reading the code this phase touches. The clauses
above are kept verbatim above so the diff is legible; where they conflict with
this section, this section governs.

**`app.json` is already correct.** It has declared `"orientation": "portrait"`
since before this spec was written. H6's first bullet describes existing
behaviour, not work. The leak is entirely at runtime:
`src/screens/MatchScreen.tsx:55` restores with `unlockAsync()` — which releases
the lock to device sensors rather than forcing portrait — so leaving a match in
landscape strands every other screen there. The route's `orientation: "all"` at
`app/_layout.tsx:254` is correct and stays: it is what *permits* rotation on the
scoring screen, and the runtime lock does the deciding.

**The orientation picker survives.** `MatchScreen.tsx:48-72` already ships a
user-facing Auto / Portrait / Landscape control with a complete portrait layout
branch (`railWide`, `bodyPortrait`, `s.top`). Hard-locking landscape would
delete shipped, working UX to satisfy a clause written without knowledge of it.
Instead: **landscape becomes the default taken on focus** (replacing
`unlockAsync()`), the picker can still override mid-match, and the cleanup is
unconditionally `lockAsync(PORTRAIT_UP)`. The cleanup is what closes H6; the
default is what honours the spirit of the clause.

**Pause freezes elapsed time, without touching the event log.** Paused means an
overlay that blocks `+1` / undo / redo, plus elapsed time that excludes paused
spans — a timer that keeps counting through a pause is lying. It is implemented
as a **local, non-persisted accumulator**, not as new `PAUSED` / `RESUMED`
entries in `MatchEvent`. That log is reduced by the engine, persisted, synced to
Supabase and replayed by undo and `autoFinish`; new variants would reach all of
them for a UI affordance. Pause means "stay on this screen", so it does not need
to survive unmount.

**M8's `0` glyph was a diagnosis. It has since been measured, and the original
hypothesis was wrong.** Planning guessed the cause was not the font but the
glow: `ribbonScore` carried `textGlow(C.red, 16)`, a 16px `textShadowRadius`,
and Russo One's `0` has a small counter that a bloom that wide could plausibly
flood into a solid rounded rectangle while the thin-stroked `1` survived.

Phase 2 tested that on the audit device at a `0 – 0` board, and it does not
hold:

| fontFamily | glow | `0` renders as |
|---|---|---|
| `F.display` (Russo One) | `textGlow(…, 16)` | solid filled block |
| `F.display` (Russo One) | none | **still a solid filled block** |
| `F.bold` (Chakra Petch Bold) | none | open counter, a numeral |
| `F.bold` (Chakra Petch Bold) | `textGlow(…, 16)` | open counter, glow intact |

Removing the glow changed nothing; only the font did. **The cause is the font** —
Russo One's zero closes up at this size — **and the glow is innocent and stays.**
The fix that shipped is one property: `ribbonScore.fontFamily` moves to `F.bold`,
the body stack's bold. `F.display` is kept everywhere else on the screen,
including the `+1` rail labels. Evidence is in
`docs/audit/verify/phase-2/README.md`.

The general lesson is worth carrying into later phases: this was recorded as a
hypothesis rather than a cause precisely so it would be measured, and measuring
it overturned a reading that looked obvious on paper.

**One found bug is absorbed into this phase.** The Ops screen's *navigation*
header renders the raw route segment, because
`app/(app)/tournaments/_layout.tsx` declares no `Stack.Screen` for
`ops/[tournamentId]` and expo-router falls back to the filename. The screen's
own in-body header (`Live Ops Dashboard`) is already correct. This is a
one-entry fix with no verification cost, so it rides here rather than waiting
for Phase 3. Renaming the concept "Ops" itself is M3 and stays in Phase 4.

**Routed elsewhere, deliberately.** Four separately-reported UX complaints were
checked against the audit and already have owners: the Home `Longest Streak`
baseline is **P1** (Phase 5), the New tournament screen's clutter is **H7**
(Phase 4) and its entrant rows are **P13** (Phase 5), and the confusing "Ops"
name is **M3** (Phase 4). The dull Brackets screen is a visual-design pass and
is a Phase 4 carry-forward. Two are genuinely new and get their own spec rather
than being bolted onto a scoring-screen plan: **restructuring the over-long
Profile screen** (an information-architecture question that also re-opens P4,
M5 and P3) and **starting a quick match from a Friends row** (a new feature
carrying real product decisions about save-scope and doubles/singles defaults).

## 5. Phase 3 — Correctness

Closes **H4, H5, M6, P2, P6, P12, P17**.

- **H4** — the live-tournament panel gets a real empty state explaining that Config is locked once a bracket goes live, with the tools that *are* available surfaced. Locked tools render as disabled, not identical to live ones.
- **H5** — club header `0 matches · 0 games · 0 players` against a 3-member roster. Traced to source; if the fix needs SQL, the migration is reviewed before the file lands under `supabase/migrations/`.
- **M6** — match detail replaces `Total rallies: 1` / `Status: completed` raw key-value strings with formatted output, and adds date, duration and the per-rally timeline Home advertises.
- **P6** — the Cups card reports draw size where it means entrant count (`8-player` for 6 entrants; `0-player` for an empty draft).
- **P2** — Home shows `—` and Profile shows `0%` for the same zero-match condition. One rule, applied to both.
- **P12** — switching save-scope from Personal to a club silently overwrites typed player names. Typed input is preserved or the loss is confirmed.
- **P17** — re-tapping a tab resets it to root instead of restoring a deep stack.

## 6. Phase 4 — Design language

Closes **M1, M2, M3, M9, P8, P9, P14, P15, P16**. Largest visual diff, so it
runs after 1–3 are verified and any regression is attributable to it alone.

- **M2** — the §1 palette applied everywhere. `C.red` as a `backgroundColor` becomes a primary-CTA-only rule.
- **M9** — the three stacked control rows on session Games stop sharing one style. A segmented control, a mode toggle and a plain button each read as their own type, and `Generate` leaves the segment group.
- **M1** — native alert replaced by `AppDialog`.
- **M3** — one name for the concept. Tab `Cups`, screen `Tournaments`, button `New tournament` and detail `Bracket` collapse to a single term.
- **P8** — club detail's four full-width buttons gain a hierarchy beyond fill colour.
- **P9** — the Clubs sheet stops giving Create and Join identical primary styling, and both stop being tappable with empty inputs.
- **P14 / P15** — disabled states read as disabled, not as styled-but-live; prefilled values are distinguishable from placeholders.
- **P16** — multicolour emoji-style tab glyphs replaced with flat icons matching the rest of the app.

## 7. Phase 5 — UX states & content

Closes **M5, M7, P1, P3, P5, P7, P10, P11, P13, P18**.

- **M5** — the achievement grid drops to 2 columns so titles and descriptions stop clipping (eight observed truncations), progress bars carry numeric values, and locked-tile text meets contrast.
- **M7** — the ambiguous red `ON` pill becomes a platform `Switch`.
- **P1 / P3** — Home stat tiles share a baseline when a label wraps; display names stop wrapping mid-word and the edit affordance stays anchored.
- **P5** — Matches drops the filter chips when there is nothing to filter.
- **P7** — club detail gains the back chevron every other sub-screen has.
- **P10** — Friends gains a field label, search or suggestion instead of exact-username matching, and the pending-requests section Profile promises.
- **P11** — club roster rows show role and avatar; the owner's row stops carrying a remove control.
- **P13** — entrant rows read as selectable, and the minimum-players hint appears at zero rather than after the first selection.
- **P18** — the club invite code comes off the Home list row. It is a shareable secret and already has a dedicated share button on club detail.

## 8. Phase 6 — Accessibility sweep

Per-screen a11y lands inside each phase. This catches the global ones and does
the measured pass.

- **A1** — every tab announces with a leading empty label (`", Home"`). Icon-font glyphs stop leaking into labels.
- **A2** — bracket nodes announce as `"3, —"` and `"C1, Jjjj, Utkarsh"`. They gain match, round, versus and winner semantics.
- **A3** — the bracket refresh button has an empty label.
- **A5** — player slots announce `", Player 2"` with no role and no hint that they open a picker.
- **A6** — three near-identical unlabeled arrow circles on the court; the serve dot has no label.
- **A8** — measured 4.5:1 pass across unselected segment labels, tournament tool buttons and locked achievement text, against every surface they sit on.

## 9. Cross-cutting acceptance criteria

These gate every phase.

**Ergonomics.** Interactive elements ≥48×48dp, via bounds or `hitSlop`.
Confirmation and primary actions in the lower 60%; destructive in the header or
an overflow menu, never adjacent to a primary CTA. Bottom insets consumed
wherever a CTA docks.

**Motion.** Every pressable is `PressableScale` — scale 0.97, ~80ms on press
down, spring on release. Sheets, dialogs and toasts get entrance springs. Tab
switches, segment toggles and `+1` stay instant: they are the >50/day actions
that must not carry deliberate motion. `transform` and `opacity` only —
animating `width`, `height` or `padding` fails review.

**States.** Every view touched handles empty (with a next action), loading
(skeleton, no layout shift), success, and error (human-readable plus retry).
This is what closes the H4 empty panel, P5 and P13.

**Structure.** No card inside a card. Grouping is `rgba(255,255,255,0.06)`, a
border, or whitespace. All spacing on the 4/8/16/24/32 scale. No un-tinted
greys — the existing `#9BA3B2` slate is already correct and stays the model.

**Type.** Body and secondary text ≥4.5:1 measured. Any text node that can
receive a long name or achievement title gets `numberOfLines` plus
`ellipsizeMode`, or a scrollable wrapper. Layouts survive system font scaling
without clipping.

**A11y.** Selected state exposed via `accessibilityState`, never implied by
colour alone. Every icon-only control labelled. No control announces as a bare
string.

## 10. Verification

Baseline is `docs/audit/2026-08-12-ux-audit/screens/`. Each phase re-runs only
the audit steps for its own findings and writes evidence to
`docs/audit/verify/phase-N/` — an a11y tree dump plus a screenshot per finding,
referencing the original filename. A phase is done when every finding it claims
has a paired before/after.

Logic-testable findings also get Jest tests, since they are cheap and catch
regressions from later phases: H5 counts, P6 draw size, P2 empty-state parity,
and the Phase 2 orientation contract.

Environment, from AUDIT.md §7: the dev client needs Metro —
`adb reverse tcp:8081 tcp:8081` then `npx expo start --dev-client --port 8081`.
mobile-mcp drops the device handle intermittently; recover with
`adb kill-server && adb start-server`. The scoring screen cannot be tree-dumped
until A7 is fixed, which is why the timer is the first task in Phase 2.

## 11. Risks

**Native dependency.** `react-native-keyboard-controller` needs a dev-client
rebuild before Phase 1 can be tested, and its RN 0.81 / New Architecture
compatibility is pinned and verified as the first task of that phase rather than
assumed. If it does not build, Phase 1 falls back to manual `Keyboard`
listeners driving the same shared value — weaker across OEMs, but it ships.

**Migrations.** If H5 bottoms out in SQL, the migration is reviewed before the
file lands under `supabase/migrations/`. Writing a file there is not inert in
this repo.

**Visual regression.** Phase 4 touches nearly every screen. Running it after
1–3 are verified keeps blame attributable.

**Audit test data.** The audit left a completed doubles match and a free-text
player named `Ut` in the `Weekend` club, plus one selected entrant on an
uncreated bracket. Cleaned up or explicitly retained as fixtures before
verification starts, so re-audit diffs are not polluted.

**Commit discipline.** Explicit pathspec on every commit; never `git add -A` or
`git commit -a`. One commit per finding-group, phase name in the subject.

## 12. Finding coverage

| Phase | Findings |
|---|---|
| 0 — Foundations | none directly (builds the tokens and primitives A4, A8, M1, M2, M4 depend on) |
| 1 — Ergonomics & safe area | H1, H2, H3, M4, M10, A4, P4 |
| 2 — Orientation & lifecycle | H6, M8, A7 |
| 3 — Correctness | H4, H5, M6, P2, P6, P12, P17 |
| 4 — Design language | H7, M1, M2, M3, M9, P8, P9, P14, P15, P16 |
| 5 — States & content | M5, M7, P1, P3, P5, P7, P10, P11, P13, P18 |
| 6 — Accessibility sweep | A1, A2, A3, A5, A6, A8 |

All 43 findings are assigned. **H7** — the `Semis onward` chip physically
overlapped by the Courts stepper's `−` button on a 720px screen, plus the
two-line `Games / match` label pushing its chip row ~50px off the shared
baseline — is closed in Phase 4 alongside the control-type and spacing work,
since it is the same three-groups-in-one-row problem as M9.
