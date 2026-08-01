# Identity & Form UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a display name at first login (stored on the profile, not locally), brand the Google button, stop the keyboard covering inputs, reject blank names, and let admins add non-registered players to a tournament.

**Architecture:** Display name moves from local `app_settings` to `profiles.display_name`, gated by a new `display_name_set` flag and a blocking welcome screen. A shared `FormScreen` wrapper fixes keyboard occlusion once for all six form screens. A pure `validateName` helper backs consistent name validation. Guests reuse the existing `club_players` / `addGuestPlayer` path.

**Tech Stack:** Expo SDK 54, expo-router v6, Supabase, `react-native-svg` (installed), Jest. No new dependencies.

## Global Constraints

- `src/engine/*` untouched.
- App is online-only; a Supabase session is guaranteed inside `(app)`.
- No new dependencies.
- Follow theme tokens (`C`, `F`, `GRAD`, `glow`, `press`), `Icon`, `PressableScale`, and `toast` for non-destructive feedback.
- Sessions have **no name field** — do not add one; venue stays optional.
- Gate every task on `npx tsc --noEmit && npm test`.

---

## Task 1: Name validation helper (pure)

**Files:**
- Create: `src/lib/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Produces: `validateName(value: string, label: string): string | null` — error message, or null when valid.

- [ ] **Step 1: Write failing test**

```typescript
// tests/validate.test.ts
import { validateName } from "../src/lib/validate";

test("rejects empty and whitespace-only names", () => {
  expect(validateName("", "Club name")).toBe("Club name is required");
  expect(validateName("   ", "Club name")).toBe("Club name is required");
});

test("accepts a trimmed non-empty name", () => {
  expect(validateName("  Smash Club  ", "Club name")).toBeNull();
});

test("rejects names longer than 50 characters", () => {
  expect(validateName("x".repeat(51), "Tournament name")).toBe("Tournament name must be 50 characters or less");
  expect(validateName("x".repeat(50), "Tournament name")).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL.** `npm test -- validate.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/validate.ts
export const MAX_NAME = 50;

/** Validate a user-supplied name. Returns an error message, or null when valid. */
export function validateName(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} is required`;
  if (trimmed.length > MAX_NAME) return `${label} must be ${MAX_NAME} characters or less`;
  return null;
}
```

- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.ts tests/validate.test.ts
git commit -m "feat(validation): pure name validator"
```

---

## Task 2: FormScreen wrapper + Android keyboard mode

**Files:**
- Create: `src/components/FormScreen.tsx`
- Modify: `app.json` (Android keyboard layout mode)

**Interfaces:**
- Produces: `FormScreen({ children, contentContainerStyle, style })` — a keyboard-safe scrolling screen container.

- [ ] **Step 1: Implement the wrapper**

```tsx
// src/components/FormScreen.tsx
import React from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  type StyleProp, type ViewStyle,
} from "react-native";
import { C } from "../theme";

/** Screen container that keeps focused inputs visible above the keyboard. */
export default function FormScreen({
  children, contentContainerStyle, style,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={[s.root, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: C.bg } });
```

- [ ] **Step 2: Android resize mode.** In `app.json`, inside `expo.android`, add `"softwareKeyboardLayoutMode": "resize"` so the viewport shrinks instead of panning.

- [ ] **Step 3: `npx tsc --noEmit` clean.**

- [ ] **Step 4: Commit**

```bash
git add src/components/FormScreen.tsx app.json
git commit -m "feat(ui): keyboard-safe FormScreen wrapper"
```

---

## Task 3: Adopt FormScreen on every form screen

**Files (modify):** `app/(auth)/sign-in.tsx`, `app/(app)/index.tsx`, `app/(app)/profile.tsx`, `app/(app)/tournaments/new.tsx`, `app/new-match.tsx`, `app/new-session.tsx`

**Interfaces:** Consumes `FormScreen` (Task 2).

- [ ] **Step 1: Replace the outer container on each screen.**
  - `sign-in.tsx` already composes `KeyboardAvoidingView` + `ScrollView` inline — replace both with `FormScreen` (keep the existing `s.scroll` as `contentContainerStyle`).
  - `profile.tsx` and `new-session.tsx` currently use a bare `ScrollView` — swap it for `FormScreen`, passing the existing `contentContainerStyle`. Do not nest a ScrollView inside FormScreen.
  - `index.tsx` and `tournaments/new.tsx` use a `View` root containing a `FlatList`. **Do not** wrap a `FlatList` in a ScrollView (virtualisation breaks). Instead keep the `View` root and add `KeyboardAvoidingView` around it via `FormScreen`'s sibling export — simplest correct approach: leave the FlatList in place and wrap only the form block at the bottom in a `KeyboardAvoidingView`. Verify by focusing the lowest field on a small screen.
  - `new-match.tsx` — inspect its root first; apply the ScrollView-swap if it is not list-based.

- [ ] **Step 2: `npx tsc --noEmit` clean; manual on device: focus the lowest input on each screen and confirm it stays visible with the keyboard open.**

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/sign-in.tsx" "app/(app)/index.tsx" "app/(app)/profile.tsx" "app/(app)/tournaments/new.tsx" app/new-match.tsx app/new-session.tsx
git commit -m "fix(ui): keep inputs visible above the keyboard"
```

---

## Task 4: Apply name validation to club and tournament

**Files:**
- Modify: `app/(app)/index.tsx` (club name), `app/(app)/tournaments/new.tsx` (tournament name)

**Interfaces:** Consumes `validateName` (Task 1), `toast`.

- [ ] **Step 1: Club name.** In `app/(app)/index.tsx`, add `const [touched, setTouched] = useState(false)` and `const nameError = validateName(name, "Club name")`. Set `onBlur={() => setTouched(true)}` on the input. Render `{touched && nameError ? <Text style={s.err}>{nameError}</Text> : null}` under the field. Keep the Create button disabled while `nameError` is non-null. In `onCreate`, guard: if `nameError` then `toast(nameError, "error")` and return. Add an `err` style (`color: C.red, fontSize: 12.5, fontFamily: F.body`).

- [ ] **Step 2: Tournament name.** Same treatment in `app/(app)/tournaments/new.tsx` with label `"Tournament name"`. Fold `nameError === null` into the existing `canCreate` memo (replacing the current `name.trim().length > 0` check) so the rules cannot drift.

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: a spaces-only name shows the inline error and cannot be submitted.**

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/index.tsx" "app/(app)/tournaments/new.tsx"
git commit -m "feat(validation): reject blank club and tournament names"
```

---

## Task 5: Google mark on the sign-in button

**Files:**
- Create: `src/components/GoogleMark.tsx`
- Modify: `app/(auth)/sign-in.tsx`

**Interfaces:**
- Produces: `GoogleMark({ size }: { size?: number })` — the four-colour Google "G".

- [ ] **Step 1: Build the mark** using `react-native-svg` (already installed). Four `Path` elements in Google's brand colours — blue `#4285F4`, green `#34A853`, yellow `#FBBC05`, red `#EA4335` — on a `0 0 48 48` viewBox. The mark is never recoloured or distorted, per Google's identity guidelines.

```tsx
// src/components/GoogleMark.tsx
import React from "react";
import Svg, { Path } from "react-native-svg";

export default function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <Path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z" />
      <Path fill="#FBBC05" d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <Path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </Svg>
  );
}
```

- [ ] **Step 2: Use it.** In `app/(auth)/sign-in.tsx`, replace `<Icon name="person" .../>` in the Google button with `<GoogleMark size={18} />` and drop the now-unused `Icon` import if nothing else uses it.

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: the coloured G renders and is legible on the button surface.**

- [ ] **Step 4: Commit**

```bash
git add src/components/GoogleMark.tsx "app/(auth)/sign-in.tsx"
git commit -m "feat(auth): Google brand mark on the sign-in button"
```

---

## Task 6: Profile-backed display name + welcome screen

**Files:**
- Create: `supabase/migrations/0003_display_name_set.sql`, `src/repos/profileRepo.ts`, `app/welcome.tsx`
- Modify: `app/_layout.tsx` (gate), `app/(app)/index.tsx` (greeting), `app/(app)/profile.tsx` (edit name), `src/repos/settingsRepo.ts` (drop `DISPLAY_NAME_KEY`)

**Interfaces:**
- Produces:
  - `type Profile = { id: string; displayName: string; displayNameSet: boolean }`
  - `getMyProfile(): Promise<Profile | null>`
  - `setDisplayName(name: string): Promise<void>` — writes `display_name` and sets `display_name_set = true`.

- [ ] **Step 1: Migration.** `supabase/migrations/0003_display_name_set.sql`:

```sql
alter table public.profiles
  add column if not exists display_name_set boolean not null default false;

-- Existing users already have a usable name; do not re-prompt them.
update public.profiles set display_name_set = true where display_name <> '';
```

Apply it in the Supabase SQL Editor (or `supabase db push`).

- [ ] **Step 2: Repo.** `src/repos/profileRepo.ts` — `getMyProfile()` selects `id, display_name, display_name_set` from `profiles` for `auth.uid()` (single row; RLS already allows authenticated select). `setDisplayName(name)` updates both columns for the current user. Both return early when `supabase` is null.

- [ ] **Step 3: Welcome screen.** `app/welcome.tsx` — centred single field seeded with the existing `display_name`, using `validateName(value, "Display name")` for inline error and to disable Continue. Continue calls `setDisplayName(trimmed)` then `router.replace("/")`. Style with the sign-in hero language (Logo, gradient CTA, `PressableScale`). No skip control.

- [ ] **Step 4: Gate.** In `app/_layout.tsx`'s `Gate`, once a session exists load the profile and hold a `needsName` state (`profile !== null && !profile.displayNameSet`). Redirect signed-in users to `/welcome` when `needsName` and the current segment is not `welcome`; leave `/welcome` once the flag clears. Register `<Stack.Screen name="welcome" options={{ headerShown: false }} />`. Do not redirect while the profile is still loading.

- [ ] **Step 5: Consume the profile name.** In `app/(app)/index.tsx`, replace the `getSetting(DISPLAY_NAME_KEY)` greeting source with `getMyProfile()`'s `displayName` (falling back to the session email prefix, then "Player"). In `app/(app)/profile.tsx`, replace the local display-name input with one that reads `getMyProfile()` and saves via `setDisplayName`, validated with `validateName`. Remove `DISPLAY_NAME_KEY` from `src/repos/settingsRepo.ts` and delete any remaining references.

- [ ] **Step 6: `npx tsc --noEmit && npm test` clean; manual: a fresh Google sign-in lands on the welcome screen, saving a name enters the app, restarting does not re-prompt, and Home greets with the saved name.**

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0003_display_name_set.sql src/repos/profileRepo.ts app/welcome.tsx app/_layout.tsx "app/(app)/index.tsx" "app/(app)/profile.tsx" src/repos/settingsRepo.ts
git commit -m "feat(profile): capture display name at first login, stored on the profile"
```

---

## Task 7: Add guest players from the tournament screen

**Files:**
- Modify: `app/(app)/tournaments/new.tsx`

**Interfaces:** Consumes `addGuestPlayer(clubId, name)` and `listPlayers(clubId)` from `clubRepo`, `validateName`, `toast`.

- [ ] **Step 1: Add the control.** Above the entrant list, add a row: a "Guest player name" `TextInput` plus an Add `PressableScale`. Disabled while `validateName(guestName, "Player name")` is non-null.

- [ ] **Step 2: Wire it.** On Add: `await addGuestPlayer(clubId, guestName.trim())`, then `setPlayers(await listPlayers(clubId))`, clear the field, `toast("Player added", "success")`, and auto-select the new player as an entrant (match on the returned list by name, respecting the existing `cap`). On failure, `toast((e as Error).message, "error")`.

- [ ] **Step 3: `npx tsc --noEmit` clean; manual: add a guest, confirm it appears in the pick list, is selectable, and can be scored in a bracket match.**

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/tournaments/new.tsx"
git commit -m "feat(tournament): add non-registered guest players inline"
```

---

## Self-Review

**Spec coverage:**
- Display name at first login, stored on the profile → Task 6. ✅
- Google logo → Task 5. ✅
- Keyboard covering inputs → Tasks 2, 3. ✅
- Blank names rejected → Tasks 1, 4. ✅
- Guest players in tournaments → Task 7. ✅

**Type consistency:** `validateName(value, label)` identical across Tasks 1, 4, 6, 7. `Profile`/`getMyProfile`/`setDisplayName` defined once in Task 6 and consumed by the gate, Home, and Profile in the same task. `FormScreen` props consistent between Task 2 and Task 3. `GoogleMark` size prop matches its single caller.

**Placeholder scan:** none — `validateName`, `FormScreen`, `GoogleMark`, and the migration are fully coded; screen-shaped steps name exact files, states, and behaviours.

**Ordering note:** Task 1 precedes Tasks 4/6/7 (they consume the validator); Task 2 precedes Task 3. Task 6 requires the migration to be applied before the welcome flow works.

**Known risk called out in Task 3:** `index.tsx` and `tournaments/new.tsx` contain `FlatList`s — they must not be nested inside a `ScrollView`. The step specifies wrapping only the form block instead.

**Out of scope:** username handles, guest claim-on-signup, avatars, session names, engine changes.
