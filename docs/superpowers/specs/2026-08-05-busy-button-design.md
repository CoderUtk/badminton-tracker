# Loading Indicator for Long-Running Actions — Design

**Goal:** Give primary action buttons visible in-progress feedback (spinner replaces the button's content, button stays disabled) for the async operations users actually wait on. The screen stays interactive around the button — this is not a full-screen blocking overlay.

**Why:** Several primary buttons (Create session, Create club, Start match, Start tournament) show no feedback while their async call is in flight — tapping does nothing visible until it either succeeds (navigates away) or fails (a toast appears). `sign-in.tsx` already solved this ad hoc with a local `busy` boolean and a manual text swap; this generalizes that pattern into a shared component instead of every screen reinventing it.

## Component: `src/components/BusyButton.tsx`

A thin wrapper, not a new visual style — every screen keeps its own button styling (`s.cta`, `s.start`, `s.btn`, etc.), `BusyButton` just controls what renders inside it and whether it's interactive:

```tsx
export default function BusyButton({
  busy, disabled, onPress, style, indicatorColor = C.text, children,
}: {
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  indicatorColor?: string;
  children: React.ReactNode;
}): JSX.Element
```

Renders a `Pressable` with the caller's `style` unchanged (so the button's size/position never shifts), `disabled={busy || disabled}`, and swaps `children` for a centered `ActivityIndicator` when `busy` is true. No animation of its own — same press feedback (`press` style / `PressableScale`) as whatever the call site already composes into `style`.

## Scope: which buttons get it

Verified against current code — only buttons that stay visible and interactive for the duration of their async call qualify. Two candidates from the original list were dropped after checking: `clubs/[id].tsx` and `tournaments/[id].tsx`'s delete-confirm buttons live inside the shared `Sheet` component's `actions` API (label/onPress pairs, not a standalone `Pressable` `BusyButton` can wrap), and both handlers already call `setConfirmingDelete(false)` synchronously before their `await` — the sheet is gone before the operation finishes, so there's no button left to show a spinner on. Same reasoning drops `profile.tsx`'s Save button — `saveDisplayName` closes its modal immediately, before `saveProfileName(...)` resolves. All three are intentional optimistic-close behavior, not a gap this design should change.

Buttons that do stay visible during their async work:

| File | Button | Current state |
|---|---|---|
| `app/new-session.tsx` | Create session | No busy state today — `save()` is `async`, nothing tracks in-flight |
| `app/(app)/index.tsx` | Create club (two `Pressable`s, both call `onCreate`, share one state) | No busy state today |
| `app/(app)/index.tsx` | Join (invite code) | No busy state today |
| `app/new-match.tsx` | Start scoring | No busy state today — `start()` is `async` |
| `src/components/TournamentConfigTab.tsx` | Save changes | Already has a local `busy` boolean — swap its manual disabled-styling for `BusyButton` |
| `src/components/TournamentConfigTab.tsx` | Start tournament | `onStart` is a prop (`() => void`) calling an `async` function owned by the parent (`app/(app)/tournaments/[id].tsx`) — needs a new `starting: boolean` prop threaded down alongside the existing `blocker`/`isDraft` props |
| `app/(auth)/sign-in.tsx` | Google sign-in button | Already has a local `busy` boolean + manual text-swap (`{busy ? "SAVING…" : "CONTINUE"}` pattern) — migrate to `BusyButton` for consistency, not because it's broken |

## Data flow

No new data flow — each screen already owns (or gains) a local `useState(false)` boolean, sets it `true` before its existing `async` call, `false` in a `finally`. `BusyButton` is purely presentational; it doesn't manage timing itself.

## Error handling

Unchanged — every one of these call sites already has its own `try/catch` + `toast()` on failure (or gains one where genuinely missing, e.g. `new-match.tsx`'s `start()` currently has no error handling at all — out of scope for this spec, since adding error handling there is a separate concern from adding a loading indicator; flagging it, not fixing it here).

## Testing

No RN component-test harness in this repo (consistent with every prior UI task this session). Verification is `tsc`/`npm test` as a regression gate, plus a manual device check per button: tap it, confirm the spinner shows and the button is inert until the operation resolves, confirm the button's size doesn't visibly shift when the spinner replaces its text.

## Out of scope

- Full-screen loading states for initial screen data fetches (a separate, larger concern per earlier discussion).
- The two Sheet-based delete confirms and the profile Save button (see above — different mechanism, already optimistic by design).
- Adding error handling to `new-match.tsx`'s `start()` (flagged above, not part of this spec).
- Any operation without an existing (or easily added) `busy`-style boolean to hook into.
