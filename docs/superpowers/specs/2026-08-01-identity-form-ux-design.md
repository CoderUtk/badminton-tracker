# Identity & Form UX — Design

**Date:** 2026-08-01
**Status:** Design approved (planning only; no implementation yet)

Five focused improvements surfacing from first real online use: capture a display name at first login, brand the Google button, stop the keyboard covering inputs, reject blank names, and let admins add non-registered players to a tournament.

## Context

The app is now **online-only** (Supabase live, sign-in required). That invalidates one earlier decision: display name was stored in **local settings** (`settingsRepo`, `DISPLAY_NAME_KEY`) because an accountless mode existed. With accounts mandatory, the name belongs on the profile so it follows the user across devices.

## 1. Display name at first login

**Problem:** a new user lands in the app with a name derived from their email/Google profile by the `handle_new_user` trigger, and can only change it by discovering the Profile screen.

**Design:**
- After sign-in, load the user's `profiles` row. If they have not explicitly chosen a name, route to a blocking `app/welcome.tsx`: one field ("What should we call you?") and a Continue button.
- **Signal:** add `profiles.display_name_set boolean not null default false`. Guessing from the email prefix is unreliable because the trigger already prefills that value. The welcome screen writes the name and sets the flag true; it is never shown again.
- The screen is blocking (no skip) but single-field, seeded with the trigger's guess so Continue is usually one tap.
- **Migration:** `supabase/migrations/0003_display_name_set.sql` — add the column; existing rows are backfilled to `true` so current users are not re-prompted.

**Consequence — remove the local name:** Home's greeting and Profile read `profiles.display_name`. `DISPLAY_NAME_KEY` and its Profile input are removed; the Profile screen instead edits the profile name (writes to Supabase). `app_settings` remains for other keys.

## 2. Google branding on the sign-in button

Replace the generic `person` icon with the real Google "G" as an inline `react-native-svg` component (`src/components/GoogleMark.tsx`) using the four brand colours. Keep the label "Continue with Google". Per Google's identity guidelines the mark is not recoloured or distorted; it sits on the existing neutral surface, which provides adequate contrast.

## 3. Keyboard covering inputs

**Problem:** on screens where a field sits low, the on-screen keyboard covers it and the user cannot see what they type. Six screens contain inputs: `app/(auth)/sign-in.tsx`, `app/(app)/index.tsx`, `app/(app)/profile.tsx`, `app/(app)/tournaments/new.tsx`, `app/new-match.tsx`, `app/new-session.tsx`.

**Design — fix once, apply everywhere:**
- `src/components/FormScreen.tsx`: a wrapper composing `KeyboardAvoidingView` (`padding` on iOS) + `ScrollView` with `keyboardShouldPersistTaps="handled"`, `contentContainerStyle` passthrough, and `automaticallyAdjustKeyboardInsets` on iOS.
- `app.json`: set `android.softwareKeyboardLayoutMode: "resize"` so Android resizes the viewport instead of panning (currently unset).
- Adopt `FormScreen` on all six screens. Screens already using `ScrollView` swap it for the wrapper rather than nesting.

## 4. Blank names rejected

**Design:**
- `src/lib/validate.ts`: pure `validateName(value: string, label: string): string | null` — returns an error message or null. Rules: trimmed length ≥ 1 (rejects whitespace-only) and ≤ 50.
- Applied to the **club name** (`app/(app)/index.tsx`) and **tournament name** (`app/(app)/tournaments/new.tsx`).
- Behaviour: submit stays disabled while invalid (already true for both), **plus** inline helper text in `C.red` under the field once touched, and a `toast(error, "error")` if a submit is somehow attempted. Pure function is unit-tested.

**Scope correction:** sessions have **no name field** — `new-session.tsx` collects venue, courts, and date. Venue is optional and stays optional; no validation is added there. If a session name is wanted later it is a separate change.

## 5. Guest (non-registered) players in tournaments

Confirms the earlier roadmap decision (Bucket D1) and is now unblocked by live Supabase.

- Guests already model cleanly: a `club_players` row with `profile_id = null`. `clubRepo.addGuestPlayer(clubId, name)` already exists.
- **UI:** an "Add guest player" row on `app/(app)/tournaments/new.tsx` — a name field plus an Add button. On submit, insert the guest, refresh the player list, and auto-select the new player as an entrant.
- Guests are **club-scoped**, not tournament-scoped, so the same guest is reusable across tournaments and sessions. Name validation from item 4 applies.
- Claiming a guest with a real account later remains deferred (roadmap D1).

## Testing

- Pure logic (`validateName`) is unit-tested.
- Screens are `tsc`-gated; keyboard behaviour, the welcome flow, and Google branding are verified manually on device.
- Gate every task on `npx tsc --noEmit && npm test`.

## Out of scope

Username handles (Bucket B), guest claim-on-signup, avatars, session names, and any change to the scoring engine.
