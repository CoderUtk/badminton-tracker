# Loading Indicator for Long-Running Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the primary action buttons users actually wait on (create/save/start) visible in-progress feedback — spinner replaces the button's content, button becomes inert — via one shared component, replacing the ad-hoc pattern already duplicated in `sign-in.tsx` and adding it where it's missing entirely.

**Architecture:** One new presentational component, `src/components/BusyButton.tsx`, built on the existing `PressableScale` (so every button that adopts it also gains consistent press-scale feedback, not just a spinner). Each screen keeps its own `useState(false)` busy boolean and its own `try/catch/finally` — `BusyButton` doesn't manage async timing itself, it just renders based on the `busy` prop it's given.

**Tech Stack:** TypeScript, Expo SDK 57, React Native, expo-router.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code.
- Gate every task on `npx tsc --noEmit && npm test`. Both must pass before commit.
- This repo has no RN component-test harness — verification for UI changes is `tsc`/`npm test` plus a manual device check, not a new automated test.
- Do not add a `Co-Authored-By` trailer to commits.
- Reuse `src/theme` tokens (`C`); no hardcoded colours.

---

### Task 1: BusyButton component

**Files:**
- Create: `src/components/BusyButton.tsx`

**Interfaces:**
- Consumes: `PressableScale` from `src/components/PressableScale.tsx` (existing, unchanged — `{ style, scaleTo, children, ...PressableProps }`).
- Produces: `BusyButton({ busy, disabled, onPress, style, indicatorColor, children }): JSX.Element`.

- [ ] **Step 1: Create the component**

Create `src/components/BusyButton.tsx`:

```tsx
import React from "react";
import { ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import PressableScale from "./PressableScale";
import { C } from "../theme";

/**
 * Wraps PressableScale so a button's own size/position never shifts while
 * busy — content swaps for a centered spinner and the button becomes inert,
 * instead of the screen giving no feedback while an async action is in
 * flight. Not a new visual style: callers keep their own `style` (background,
 * radius, etc.) exactly as before.
 */
export default function BusyButton({
  busy,
  disabled,
  onPress,
  style,
  indicatorColor = C.text,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  indicatorColor?: string;
  children: React.ReactNode;
}) {
  return (
    <PressableScale style={style} disabled={busy || disabled} onPress={onPress}>
      {busy ? <ActivityIndicator color={indicatorColor} /> : children}
    </PressableScale>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. `BusyButton` isn't imported anywhere yet, so this only
confirms the file itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/BusyButton.tsx
git commit -m "feat(ui): add a shared busy-state button component"
```

---

### Task 2: Wire into new-session.tsx

**Files:**
- Modify: `app/new-session.tsx`

**Interfaces:**
- Consumes: `BusyButton` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import and busy state**

In `app/new-session.tsx`, add the import:

```ts
import BusyButton from "../src/components/BusyButton";
```

Add state alongside the existing `timeMinutes` state:

```ts
const [saving, setSaving] = useState(false);
```

- [ ] **Step 2: Wrap save() with the busy state**

Replace `save`:

```ts
const save = async () => {
  if (!clubId) { toast("Create or select a club before planning a session.", "info"); return; }
  const hour = Math.floor(timeMinutes / 60);
  const minute = timeMinutes % 60;
  const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
  const id = await createSession({ clubId, startsAt, location, courts });
  router.replace(`/(app)/sessions/${id}`);
};
```

with:

```ts
const save = async () => {
  if (!clubId) { toast("Create or select a club before planning a session.", "info"); return; }
  setSaving(true);
  try {
    const hour = Math.floor(timeMinutes / 60);
    const minute = timeMinutes % 60;
    const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
    const id = await createSession({ clubId, startsAt, location, courts });
    router.replace(`/(app)/sessions/${id}`);
  } catch (e) {
    toast((e as Error).message || "Could not create session", "error");
  } finally {
    setSaving(false);
  }
};
```

This also adds error handling `save()` didn't have before — a failed
`createSession` previously threw uncaught.

- [ ] **Step 3: Replace the button**

Replace:

```tsx
<Pressable style={s.cta} onPress={save}><Text style={s.ctaText}>Create session</Text></Pressable>
```

with:

```tsx
<BusyButton busy={saving} style={s.cta} onPress={save}>
  <Text style={s.ctaText}>Create session</Text>
</BusyButton>
```

- [ ] **Step 4: Gate**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 5: Commit**

```bash
git add app/new-session.tsx
git commit -m "feat(ui): show a busy state on Create session"
```

- [ ] **Step 6: Verify on device**

Open "Plan session", fill it in, tap "Create session" — the button's content
should swap to a spinner (same size, no layout jump) until the new session
screen replaces it.

---

### Task 3: Wire into Home (create club, join club)

**Files:**
- Modify: `app/(app)/index.tsx`

**Interfaces:**
- Consumes: `BusyButton` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import and busy state**

In `app/(app)/index.tsx`, add the import:

```ts
import BusyButton from "../../src/components/BusyButton";
```

Add state alongside the existing `showInlineCreate` state:

```ts
const [creating, setCreating] = useState(false);
const [joining, setJoining] = useState(false);
```

- [ ] **Step 2: Wrap onCreate and onJoin**

Replace `onCreate`:

```ts
const onCreate = async () => {
  if (nameError) { toast(nameError, "error"); return; }
  try {
    await createClub(name.trim());
    setName("");
    setNameTouched(false);
    setShowInlineCreate(false); // collapse the form once the club exists
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not create club", "error");
  }
};
```

with:

```ts
const onCreate = async () => {
  if (nameError) { toast(nameError, "error"); return; }
  setCreating(true);
  try {
    await createClub(name.trim());
    setName("");
    setNameTouched(false);
    setShowInlineCreate(false); // collapse the form once the club exists
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not create club", "error");
  } finally {
    setCreating(false);
  }
};
```

Replace `onJoin`:

```ts
const onJoin = async () => {
  try {
    await joinClub(inviteCode);
    setInviteCode("");
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not join club", "error");
  }
};
```

with:

```ts
const onJoin = async () => {
  setJoining(true);
  try {
    await joinClub(inviteCode);
    setInviteCode("");
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not join club", "error");
  } finally {
    setJoining(false);
  }
};
```

- [ ] **Step 3: Replace both Create buttons and the Join button**

There are two "Create" `Pressable`s (the inline form shown when a club
already exists, and the empty-state form inside `ListEmptyComponent`) — both
call `onCreate` and are never visible at the same time (one requires
`clubs.length > 0`, the other requires the list to be empty), so both share
`creating`.

Replace the first one (inline create form):

```tsx
<Pressable style={({ pressed }) => [s.btn, pressed && press, !!nameError && s.btnOff]} disabled={!!nameError} onPress={onCreate}>
  <Icon name="add" color={C.text} size={18} />
  <Text style={s.btnText}>Create</Text>
</Pressable>
```

with:

```tsx
<BusyButton busy={creating} disabled={!!nameError} style={[s.btn, !!nameError && s.btnOff]} onPress={onCreate}>
  <Icon name="add" color={C.text} size={18} />
  <Text style={s.btnText}>Create</Text>
</BusyButton>
```

Replace the second one (inside `ListEmptyComponent`) the same way:

```tsx
<Pressable style={({ pressed }) => [s.btn, pressed && press, !!nameError && s.btnOff]} disabled={!!nameError} onPress={onCreate}>
  <Icon name="add" color={C.text} size={18} />
  <Text style={s.btnText}>Create</Text>
</Pressable>
```

with:

```tsx
<BusyButton busy={creating} disabled={!!nameError} style={[s.btn, !!nameError && s.btnOff]} onPress={onCreate}>
  <Icon name="add" color={C.text} size={18} />
  <Text style={s.btnText}>Create</Text>
</BusyButton>
```

Replace the Join button:

```tsx
<Pressable style={({ pressed }) => [s.btn, pressed && press, !inviteCode.trim() && s.btnOff]} disabled={!inviteCode.trim()} onPress={onJoin}>
  <Text style={s.btnText}>Join</Text>
</Pressable>
```

with:

```tsx
<BusyButton busy={joining} disabled={!inviteCode.trim()} style={[s.btn, !inviteCode.trim() && s.btnOff]} onPress={onJoin}>
  <Text style={s.btnText}>Join</Text>
</BusyButton>
```

- [ ] **Step 4: Gate**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(ui): show a busy state on Home's create/join club buttons"
```

- [ ] **Step 6: Verify on device**

Create a club from Home (both the inline form when clubs already exist, and
the empty-state form when they don't) — button shows a spinner while saving.
Join a club with an invite code — same.

---

### Task 4: Wire into new-match.tsx (Start scoring)

**Files:**
- Modify: `app/new-match.tsx`

**Interfaces:**
- Consumes: `BusyButton` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import and busy state**

In `app/new-match.tsx`, add the import:

```ts
import BusyButton from "../src/components/BusyButton";
```

Add state alongside the existing `firstServerIdx` state:

```ts
const [starting, setStarting] = useState(false);
```

- [ ] **Step 2: Wrap start() with the busy state**

Replace `start`:

```ts
const start = async () => {
  const config = buildConfig();
  const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
  const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
  router.replace(`/score/${id}`);
};
```

with:

```ts
const start = async () => {
  setStarting(true);
  try {
    const config = buildConfig();
    const side = (t: "A" | "B") => config.teams[t].map((p) => ({ club_player_id: null, name: p.name }));
    const id = await createMatch(config, side("A"), side("B"), clubId, params.sessionId ?? null);
    router.replace(`/score/${id}`);
  } catch (e) {
    toast((e as Error).message || "Could not start the match", "error");
    setStarting(false);
  }
};
```

`setStarting(false)` only runs in the catch branch, not a `finally` — on
success the screen navigates away immediately, so there's nothing left to
un-disable. `toast` needs a new import:

```ts
import { toast } from "../src/lib/toast";
```

- [ ] **Step 3: Replace the button**

Replace:

```tsx
<Pressable style={[s.cta, !filled && { opacity: 0.5 }]} disabled={!filled} onPress={start}>
  <Text style={s.ctaText}>Start scoring</Text>
</Pressable>
```

with:

```tsx
<BusyButton busy={starting} disabled={!filled} style={[s.cta, !filled && { opacity: 0.5 }]} onPress={start}>
  <Text style={s.ctaText}>Start scoring</Text>
</BusyButton>
```

- [ ] **Step 4: Gate**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 5: Commit**

```bash
git add app/new-match.tsx
git commit -m "feat(ui): show a busy state on Start scoring, and handle its errors"
```

- [ ] **Step 6: Verify on device**

Fill in a match, tap "Start scoring" — spinner shows until the score screen
replaces it.

---

### Task 5: Wire into TournamentConfigTab (Save changes, Start tournament)

**Files:**
- Modify: `src/components/TournamentConfigTab.tsx`
- Modify: `app/(app)/tournaments/[id].tsx`

**Interfaces:**
- Consumes: `BusyButton` from Task 1.
- Produces: `TournamentConfigTab`'s `onStart` prop stays `() => void` (unchanged signature — the parent owns the async call and its own busy state); adds a new required `starting: boolean` prop.

- [ ] **Step 1: Add the starting prop and use BusyButton in TournamentConfigTab**

In `src/components/TournamentConfigTab.tsx`, add the import:

```ts
import BusyButton from "./BusyButton";
```

Add `starting` to the destructured props and the type:

```ts
export default function TournamentConfigTab({
  tournament, isAdmin, isDraft, blocker, starting, onStart, onChanged,
}: {
  tournament: TournamentRow;
  isAdmin: boolean;
  isDraft: boolean;
  blocker: string | null;
  starting: boolean;
  onStart: () => void;
  onChanged: () => void;
}) {
```

Replace the Save changes button:

```tsx
{dirty ? (
  <Pressable style={[s.save, (!!nameError || busy) && s.off]} disabled={!!nameError || busy} onPress={onSave}>
    <Text style={s.saveText}>Save changes</Text>
  </Pressable>
) : null}
```

with:

```tsx
{dirty ? (
  <BusyButton busy={busy} disabled={!!nameError} style={[s.save, !!nameError && s.off]} onPress={onSave}>
    <Text style={s.saveText}>Save changes</Text>
  </BusyButton>
) : null}
```

Replace the Start tournament button:

```tsx
{isDraft ? (
  <>
    <Pressable style={[s.start, !!blocker && s.off]} disabled={!!blocker} onPress={onStart}>
      <Text style={s.startText}>Start tournament</Text>
    </Pressable>
    {blocker ? <Text style={s.err}>{blocker}</Text> : null}
  </>
) : null}
```

with:

```tsx
{isDraft ? (
  <>
    <BusyButton busy={starting} disabled={!!blocker} style={[s.start, !!blocker && s.off]} onPress={onStart}>
      <Text style={s.startText}>Start tournament</Text>
    </BusyButton>
    {blocker ? <Text style={s.err}>{blocker}</Text> : null}
  </>
) : null}
```

- [ ] **Step 2: Track starting state in the parent and pass it down**

In `app/(app)/tournaments/[id].tsx`, add state alongside the existing
`menuOpen` state:

```ts
const [starting, setStarting] = useState(false);
```

Replace `onStart`:

```ts
const onStart = async () => {
  if (!id) return;
  try {
    await startTournament(id);
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not start the tournament", "error");
  }
};
```

with:

```ts
const onStart = async () => {
  if (!id) return;
  setStarting(true);
  try {
    await startTournament(id);
    reload();
  } catch (e) {
    toast((e as Error).message || "Could not start the tournament", "error");
  } finally {
    setStarting(false);
  }
};
```

Pass the new prop where `TournamentConfigTab` is rendered:

```tsx
<TournamentConfigTab
  tournament={tournament}
  isAdmin={isAdmin}
  isDraft={!!isDraft}
  blocker={blocker}
  starting={starting}
  onStart={onStart}
  onChanged={reload}
/>
```

- [ ] **Step 3: Gate**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/TournamentConfigTab.tsx "app/(app)/tournaments/[id].tsx"
git commit -m "feat(ui): show a busy state on tournament Save changes and Start"
```

- [ ] **Step 5: Verify on device**

On a draft tournament's Config tab: edit the name and tap "Save changes" —
spinner shows briefly. With enough entrants, tap "Start tournament" —
spinner shows until the bracket screen takes over.

---

### Task 6: Migrate sign-in.tsx's password button to BusyButton

**Files:**
- Modify: `app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `BusyButton` from Task 1.
- Produces: nothing consumed by later tasks.

This migrates the existing ad-hoc `busy` + manual text-swap pattern on the
password sign-in/sign-up button to the shared component, for consistency —
not because it was broken. `passwordSignIn`/`passwordSignUp`/`busy` state
and the `completingAuth` full-screen state (Google flow) are unchanged.

- [ ] **Step 1: Add the import**

In `app/(auth)/sign-in.tsx`, add:

```ts
import BusyButton from "../../src/components/BusyButton";
```

- [ ] **Step 2: Replace the password CTA**

Replace:

```tsx
<PressableScale
  style={[s.ctaWrap, !canSubmit && s.off]}
  disabled={!canSubmit}
  onPress={isSignUp ? passwordSignUp : passwordSignIn}
>
  <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
    <Text style={s.ctaText}>
      {busy ? "PLEASE WAIT…" : isSignUp ? "CREATE ACCOUNT" : "SIGN IN"}
    </Text>
  </LinearGradient>
</PressableScale>
```

with:

```tsx
<BusyButton
  busy={busy}
  disabled={!canSubmit}
  style={s.ctaWrap}
  onPress={isSignUp ? passwordSignUp : passwordSignIn}
>
  <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
    <Text style={s.ctaText}>{isSignUp ? "CREATE ACCOUNT" : "SIGN IN"}</Text>
  </LinearGradient>
</BusyButton>
```

`canSubmit` already includes `!busy` (`const canSubmit = emailValid && password.length > 0 && !busy;`),
so `BusyButton`'s own `busy || disabled` check is redundant but harmless —
leave `canSubmit` as-is, no need to touch its definition.

Note the `LinearGradient` stays inside as `children` — `BusyButton` swaps
its entire `children` for the spinner while busy, so the gradient
background disappears too during the busy state. That matches every other
button this plan touches (spinner fully replaces content) and avoids a
special case for this one screen.

- [ ] **Step 3: Gate**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/sign-in.tsx"
git commit -m "refactor(auth): migrate the password sign-in button to BusyButton"
```

- [ ] **Step 5: Verify on device**

Sign in (or sign up) with email/password — button shows a spinner instead
of "PLEASE WAIT…" text while the request is in flight. Google sign-in is
unaffected (still uses the separate `completingAuth` full-screen state).

---

## Final verification

- [ ] `npx tsc --noEmit && npm test` — green
- [ ] All six device checks above passed
