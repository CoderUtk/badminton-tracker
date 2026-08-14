# Mobile UX Refinement — Phase 6 (Accessibility Sweep) + Two Ad-Hoc Items — Design

**Date:** 2026-08-15
**Status:** Design approved (planning only; no implementation yet)
**Source:** `docs/superpowers/specs/2026-08-13-mobile-ux-refinement-design.md` §8 (Phase 6 scope), `docs/audit/2026-08-12-ux-audit/AUDIT.md` §4 (accessibility findings).

## Context

Phase 6 is the last of the seven phases in the 2026-08-13 spec's finding-coverage
table (§12) — closing it finishes the audit's full 43-finding backlog. Phases
1–5 are merged to `master`. This session also folds in two ad-hoc UI
requirements that surfaced outside the original audit, each unrelated to
accessibility and kept in its own commit group rather than mixed into the
Phase 6 findings.

**Device:** `adb devices` returned empty at session start. Verification will
attempt the standard recovery (`adb kill-server && adb start-server`) and
otherwise record an honest gap, per Phases 3/4's precedent.

## Scope

Three independent commit groups, one plan file:

1. **Phase 6 accessibility sweep** — A1, A2, A3, A5, A6, A8 (spec §8).
2. **Home "Start a match" button** — shortened, new ad-hoc requirement.
3. **Truncation audit** — a documentation decision, not a code change.

Phase 4b (mechanical `segOn`/`chipOn` → `selected` sweep, 10 sites, listed in
`docs/audit/verify/phase-4/README.md`) was flagged to the user and explicitly
declined for this session — out of scope here.

---

## 1. Phase 6 — Accessibility sweep

Closes A1, A2, A3, A5, A6, A8. Cross-cutting acceptance criteria from spec §9
bind this group, specifically: "Every icon-only control labelled. No control
announces as a bare string." and "Selected state exposed via
`accessibilityState`, never implied by colour alone."

### A1 — Tab bar labels leak icon-font glyphs
`app/(app)/_layout.tsx:29-58` — five `Tabs.Screen` entries (`Home`,
`Sessions`, `Matches`, `Tournaments`, `Profile`) rely on the default
tab-label announcement, which the audit found emits a leading empty label
(`", Home"`) with icon-font glyphs leaking in for two tabs (Matches, Cups).
Fix: explicit `tabBarAccessibilityLabel` per `Tabs.Screen`, set to the plain
tab name, so nothing icon-derived reaches the announcement.

### A2 — Bracket nodes announce with no match semantics
`src/components/BracketView.tsx`'s `BracketCell` (lines 57-112) renders a
bare `TouchableOpacity` with two `Text` children and no `accessibilityLabel`
— it announces as raw text concatenation (`"3, —"`, `"C1, Jjjj, Utkarsh"`).
Fix: compose an `accessibilityLabel` from round, court (if assigned), both
side names, and winner if decided — e.g. `"Round 2, Court 3, Alice versus
Bob, Alice won"` or `"Round 1, Alice versus Bob, in progress"` for a live
cell with no winner yet.

### A3 — Bracket refresh button has no label
`app/(app)/tournaments/[id].tsx:308-312` — `PressableScale` wrapping an
`ActivityIndicator`/sync icon, no `accessibilityLabel`. Fix: add
`accessibilityLabel="Refresh tournament"`.

### A5 — Player slots announce with no role or hint
Court player slots use `DOUBLES_LABELS`/`SINGLES_LABELS` (`app/new-match.tsx:30-31`,
rendered via `src/components/CourtBox.tsx`). They currently announce as bare
label text (`", Player 2"`) with no indication they're interactive or that
tapping opens a picker. Fix: `accessibilityRole="button"` plus
`accessibilityHint="Opens player picker"` on the slot's pressable in
`CourtBox.tsx`.

### A6 — Serve dot has no label; swap buttons re-checked
`src/components/Court.tsx` swap controls already carry distinct
`accessibilityLabel`s ("Swap team A players", "Swap sides", line
104/133) — the audit's "near-identical unlabeled arrow circles" complaint may
already be closed on the label front; this is a measure-first re-check
against the live device, not an assumed rewrite. The confirmed real gap: the
red serve dot (`s.serveDot`, rendered inside `CourtBox.tsx`) has no
accessibility label at all. Fix: add `accessibilityLabel="Serving"` (or
equivalent) to the serve indicator; only touch the swap buttons' visuals if
device inspection shows they still read ambiguously despite their labels.

### A8 — Contrast measurement pass
Same method as Phase 5's M5 Task 1 Step 3 (WCAG relative-luminance formula
against the *actual* rendered background, not assumed). Targets: unselected
segment labels, the tournament tool buttons (Config/Players/Scorers/Ops
row), and locked achievement text — each against every surface it actually
sits on. Fix only sites measuring below 4.5:1; record ratios for sites that
already pass, same as M5's precedent (no code change was needed there once
measured).

---

## 2. Home "Start a match" button — shortened

`app/(app)/index.tsx` — current button: `ctaWrap`/`cta`/`ctaText`
(lines ~245-250), `minHeight: 96`, all-caps `"START A MATCH"` at
`fontSize: 22`, 26px icon, wrapped in a red gradient + glow (`glow(C.red, 18, 0.5)`).

**Decision: shrink both height/padding and the label**, not one or the
other. The button's visual dominance on Home comes from its color treatment
— it's the only gradient-plus-glow element on the screen — and its position
at the top of the scroll, not from raw size. Shrinking its footprint doesn't
cost it hierarchy against the plain-styled `StatTile`s, `NextSessionCard`,
and club rows beneath it, so there's room to address "too big / long" on
both axes the complaint named rather than trading one for the other.

Concrete change: `minHeight` 96→72, icon size 26→20, label to sentence case
"Start a match" at `fontSize` 22→18 (drop the heavy `letterSpacing: 1` that
was sized for all-caps tracking). Gradient, glow, and position stay
untouched — those carry the hierarchy, not the size.

One commit, `app/(app)/index.tsx` only.

---

## 3. Truncation audit — documentation decision, no code change

All 26 `numberOfLines` sites in the app were read for context (not assumed).
Every site falls into one of two categories:

- **Single-line list-row/label truncation** (the large majority — player
  names, club names, tournament names, tab/chip labels, card titles): each
  sits in a `flex:1` container beside an icon or badge, exactly the layout
  where `numberOfLines={1}` + ellipsis is the correct, expected mobile
  pattern. Names in this app (players, clubs, sessions) are typically short
  enough that truncation is graceful degradation, not a frequent real
  occurrence.
- **Multi-line body text** (`BadgeGrid` description at 2 lines, `Toaster`
  message at 3, `ShareCard` team name at 2): already sized for the longer
  content they carry.

**No systemic fix is warranted.** A shared truncation/tooltip pattern would
solve a problem this codebase doesn't have — every site already reserves
appropriate space via `flex:1` or a multi-line allowance, and none showed
signs of losing meaningful information in the audit's own screenshots. This
is recorded as a decision in the plan and its verification note; no files
change as a result.

---

## 4. Verification

Baseline: `docs/audit/2026-08-12-ux-audit/screens/` for group 1's findings
(a11y tree dump + screenshot per finding) and `01-home.png` for group 2 (the
button). Group 3 needs no device evidence — it closes on the code read
already done in this document.

Device state at session start: `adb devices` returned no attached device.
Verification will retry (`adb kill-server && adb start-server`) and record
an honest gap for any finding that can't get live evidence, per Phases 3/4.

Logic-testable findings: none in this phase (accessibility-label and style
changes aren't unit-testable in isolation the way H5/P6/P2 were).

## Risks

Same commit-discipline and pathspec rules as every prior phase (spec §11).
No new dependency. No migration. Phase 4b explicitly out of scope — flagged,
not folded in, per user decision this session.

## Finding coverage after this phase

All 43 findings from the 2026-08-12 audit are closed once this phase lands —
this is the last of the spec's seven phases (§12).
