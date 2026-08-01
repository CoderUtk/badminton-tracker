# CourtSide — Future Roadmap v2

**Date:** 2026-08-01
**Status:** Design approved (planning only; no implementation yet)

Extends the [tournaments roadmap](2026-07-31-realtime-tournaments-design.md) and [tournaments-roadmap](2026-08-01-tournaments-roadmap-design.md). Phase 1+2 (UX fixes + tournament format: 64, doubles, games config) are **shipped**. This doc captures the next horizon.

## Guiding decisions (apply throughout)

1. **Identity = unique `@username`, not phone.** The Supabase auth UUID stays the internal PK; a unique, human-friendly `@username` is layered on top for sharing, friend-add, and tournament join. Mobile numbers are avoided — they need OTP infra and carry privacy/spam cost, with no benefit the username doesn't give. Phone is deferred indefinitely (only revisited if contacts-based invites are ever wanted).
2. **Guests are first-class.** Tournaments must run with unregistered players. The existing `club_players.profile_id = null` already models a guest; admins add guest entrants by name. A guest can be **claimed** by a real account later, preserving history.
3. **No Android popups except destructive/critical.** Replace `Alert.alert` with in-app **toast** (transient status) and **bottom-sheet** (choices/confirm), built on the already-installed `react-native-reanimated`. Native `Alert` remains only for destructive confirmations ("End match?", "Delete") and unrecoverable errors.
4. **No new heavy deps by default.** Tab transitions, sheets, and toasts use the reanimated + gesture-handler already present.

## Buckets and dependencies

| Bucket | Scope | Backend |
| --- | --- | --- |
| **A · UX & sharing** | in-app toast/sheet system, tab-switch animations, first-open onboarding tour, share-match-to-story | none (local) |
| **B · Identity** | unique `@username`, shown on Profile, basis for friend-add + join | Supabase |
| **C · Social / Circle** | friends graph, quick-match with a connection | Supabase (needs B) |
| **D · Tournament ops** | guest/dummy players, court **count** in config, mid-tournament court **reassignment** | Supabase (extends Phase 4) |

**Sequence:** `Phase 1+2 (done) → A (local) → [configure Supabase] → Phase 3 (join/approval) + B (username) + guest players → Phase 4 (live ops) + courts/reassign → C (Circle)`.

A is independent and ships anytime. B underpins C and the join flow. C needs B. D rides Phase 4.

---

## Bucket A — UX & sharing (local, ship-now)

Independent of any backend; each item is its own plan-able unit.

### A1. In-app feedback system (kill popups)
- **Toast:** a lightweight top/bottom transient banner for status/success/error, auto-dismiss, swipe-to-dismiss (reanimated spring, interruptible). Single `<Toaster/>` mounted in `app/_layout.tsx`; a `toast(msg, kind)` call from anywhere (no context boilerplate — Sonner-style DX).
- **Bottom-sheet:** a reusable spring sheet for choices/confirm (replaces `Alert` with buttons). Origin-aware, drag-to-dismiss with momentum, backdrop scrim.
- **Migration:** replace non-destructive `Alert.alert` calls (e.g. "Could not create tournament", "Could not start") with `toast`; keep destructive confirms ("End match?") as a styled sheet or native Alert.
- **Files:** `src/components/Toaster.tsx`, `src/components/Sheet.tsx`, `src/lib/toast.ts`; edits across screens that currently `Alert`.

### A2. Tab-switch animations
- Animate the transition between bottom tabs — a subtle cross-fade + slight upward/scale settle on the incoming screen, respecting `prefers-reduced-motion`. Built with reanimated; no `linear`/`ease-in`, use the Apple-style critically-damped curve already established in `PressableScale`.
- **Approach:** custom `sceneStyle`/`animation` on the expo-router `Tabs`, or a shared enter-transition wrapper. No new dependency.
- **Relevant skill:** `apple-design` / `ecc:motion-ui`.

### A3. First-open onboarding tour
- On first launch, a short swipeable set of cards explaining the tabs/features (Home, Sessions, Matches, Tournaments, Live, Profile). Persist "seen" in `app_settings` (the `settingsRepo` from Phase 1). Skippable; never shown again once dismissed.
- **Files:** `app/onboarding.tsx` (or a modal), gated by an `onboarding_seen` setting checked in `app/_layout.tsx`.

### A4. Share match to story
- A generated **share card** for a finished (or live) match — teams, score, CourtSide branding — rendered off-screen and shared via the OS share sheet (Instagram/story-friendly aspect). Uses `react-native-view-shot` (capture a styled view to an image) + `expo-sharing`. New deps: `react-native-view-shot`, `expo-sharing`.
- **Files:** `src/components/ShareCard.tsx`, a share action on the match detail / match-over screen.

---

## Bucket B — Identity (`@username`)

- Add a unique `username` to `profiles` (Supabase), case-insensitive unique, `[a-z0-9_]`, editable (rate-limited / once). Show `@username` on the Profile screen; provide "copy" and "share my handle."
- **Migration:** `0005_username.sql` — `alter table profiles add column username text unique`; a `set_username(p_username)` RPC that validates format + uniqueness.
- **UI:** username field on Profile (claim/change), display on the identity hero.
- Basis for friend-add (Bucket C) and public tournament/club join (Phase 3).

---

## Bucket C — Social / Circle (friends + quick match)

- **Friends graph:** `friendships(profile_a, profile_b, status: pending|accepted, created_at)` with RLS; add by `@username` (Bucket B); accept/decline. A "Circle" screen lists connections.
- **Quick match:** from a connection's row, "Start match" pre-fills a match with you + them (or as a doubles pair), skipping manual player entry. Reuses the existing match-create + scoring path.
- **Presence (optional, later):** show which connections are currently in a live match (reuses `RealtimeBackend` live-match presence).
- **Files:** `src/repos/friendsRepo.ts`, `app/(app)/circle/*`, migration `0006_friends.sql`. Needs B.

---

## Bucket D — Tournament ops (extends Phase 4)

Folded into the Phase 4 live-ops plan, not a separate phase.

### D1. Guest / dummy players
- Tournament admin adds entrants who have no account: create a `club_player` with `profile_id = null` and a typed name; they seed and are scored like anyone. The new-tournament and bracket screens allow "Add guest" inline.
- **Claim-on-signup (later):** when a real user signs up, they can claim a matching guest (by admin action or invite), merging history. Deferred within D.

### D2. Courts in tournament config
- Tournament declares a **court count** at creation. `tournaments.courts INTEGER DEFAULT 1`. The bracket/ops view shows a courts grid.

### D3. Mid-tournament court reassignment
- Admin/scorer can change a match's assigned court while the tournament runs (availability changes). `bracket_matches.court INTEGER` is editable from the ops dashboard; the change is realtime-published so all scorers/spectators see the new assignment.
- Pairs with the Phase 4 scorer-claim/lock model (one active scorer per match).

---

## Cross-cutting notes

- **Testing:** pure logic (username validation, friend-state transitions, court-assignment rules) is unit-tested; screens are tsc-gated; multi-account behaviour verified manually once Supabase is live. Gate every plan on `npx tsc --noEmit && npm test`.
- **Engine untouched** everywhere; social/tournament features sit above the scoring core and behind the existing `RealtimeBackend` / repo seams.
- **Reduced motion:** A2/A1 animations honor `prefers-reduced-motion` (cross-fade instead of slide/spring).

## Deferred / explicitly out of scope

Phone-number identity and contacts sync; public (non-club) discovery/matchmaking; double elimination and consolation brackets; ranking/Elo leaderboards across clubs; payments/ticketing; in-app chat. Revisit only if a concrete need appears.

## Per-bucket implementation order (when built)

1. **A1** in-app feedback (unblocks removing popups everywhere).
2. **A2, A3, A4** in any order (independent).
3. **[Supabase configured]**
4. **B** username → **Phase 3** join/approval + **D1** guest players.
5. **Phase 4** live ops + **D2/D3** courts + reassignment.
6. **C** Circle + quick match.
