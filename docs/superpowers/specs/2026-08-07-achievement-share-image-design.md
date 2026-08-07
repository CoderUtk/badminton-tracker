# Achievement Share-Image

## Problem

The Profile screen's badge grid (`src/components/BadgeGrid.tsx`) shows 20
achievements but gives no way to show them off. The app already has a
share-to-story pipeline (`docs/superpowers/specs/2026-08-06-share-to-story-design.md`)
for match/session/tournament results — capture an off-screen branded card as
PNG, push it to Instagram Stories (or the OS share sheet as fallback). This
extends that same pipeline to earned badges: tap an earned badge on Profile,
get a popup with a preview card and a share button.

## Scope

Tap-to-share only. No moment-of-unlock auto-popup — badges are computed
fresh on every profile view with no persisted "previously seen" state
(per the existing achievement-system design), and adding that tracking is
out of scope for this feature. Only earned badges are tappable; locked and
in-progress chips stay inert, matching today's `BadgeGrid` behavior.

## Design

### 1. `src/components/share/BadgeResultCard.tsx` — new

Follows the exact pattern of `SessionResultCard.tsx`: wraps `CardShell`
(existing 1080×1920 canvas, `GRAD.court` background, logo top bar, QR/link
watermark bottom band — all unchanged, zero edits to `CardShell`).

```tsx
export default function BadgeResultCard({
  badge, playerName,
}: {
  badge: { title: string; description: string; icon: string };
  playerName: string;
}): JSX.Element
```

Content inside the safe zone: badge icon rendered large (`Icon` component,
`C.red`, size ~120) centered, title below in `F.display` (huge, matching
`SessionResultCard`'s title treatment), description in `F.body`/`C.text2`
below that, and player name small at the bottom (`F.medium`, `C.text3`) —
same visual weight as the date line on `SessionResultCard`.

### 2. `src/components/BadgeSharePopup.tsx` — new

A centered modal popup (backdrop + card), not the existing `Sheet.tsx`
bottom-sheet component — `Sheet`'s API is action-list only and has no slot
for embedding a live card preview, so this is a new small component rather
than a `Sheet` variant.

```tsx
export default function BadgeSharePopup({
  badge, playerName, onClose,
}: {
  badge: EarnedBadge | null;
  playerName: string;
  onClose: () => void;
}): JSX.Element | null
```

Renders `null` when `badge` is `null` (mirrors `Sheet`'s `visible` gate).
When open:
- Backdrop (`Pressable`, dismiss on tap) + centered panel.
- A scaled-down preview of `BadgeResultCard` (`transform: [{ scale }]` sized
  to fit within screen width, matching the pattern other screens use to
  preview an off-screen 1080-wide card).
- A second, full-size, actually-off-screen instance of `BadgeResultCard`
  (`position: absolute, left: -9999`, `ref={shareCardRef}`, `collapsable:
  false`) — this is the one `captureRef` reads, matching the
  `sessions/[id].tsx` off-screen-card pattern exactly. Two instances (one
  scaled for preview, one full-size off-screen for capture) because
  `captureRef` needs the untransformed, full-resolution view.
- "Share to story" button (primary style, matching `Sheet`'s `btnPrimary`
  token) calling `captureAndShare(shareCardRef)` — the existing, unmodified
  pipeline function.
- "Close" button (secondary style) calling `onClose`.

No new capture/share logic — `captureAndShare` and `shareToInstagramStory`
are reused as-is.

### 3. `BadgeGrid.tsx` — add optional tap handler

```tsx
export default function BadgeGrid({
  badges, onPressBadge,
}: {
  badges: EarnedBadge[];
  onPressBadge?: (badge: EarnedBadge) => void;
})
```

Earned chips (`b.earned === true`) get wrapped in `Pressable` calling
`onPressBadge?.(b)` when provided; locked/in-progress chips are unchanged
(no press handler — same as today). Prop is optional so `BadgeGrid` still
works standalone with no behavior change if a caller doesn't pass it.

### 4. `app/(app)/profile.tsx` — wire it up

- New state: `const [selectedBadge, setSelectedBadge] = useState<EarnedBadge | null>(null)`.
- `<BadgeGrid badges={badges} onPressBadge={setSelectedBadge} />`.
- `<BadgeSharePopup badge={selectedBadge} playerName={/* existing profile display name in scope */} onClose={() => setSelectedBadge(null)} />` rendered once near the bottom of the screen tree, same placement convention as other modal-style overlays.

## Testing

No new unit-testable logic beyond `BadgeGrid`'s tap wiring (locked chips
still fire nothing, earned chips call `onPressBadge` with the right badge)
— that gets one new test in `tests/` alongside the existing `BadgeGrid`
coverage if any exists, otherwise added as a new small test file. Capture
and share behavior (`captureAndShare`, `shareToInstagramStory`) is already
covered by the prior share-to-story feature's tests and is not touched
here. Manual QA: tap each of several earned badges on Profile, verify
preview renders correct icon/title/description/name, verify "Share to
story" produces a PNG and opens IG Stories (or falls back to the OS share
sheet when Instagram isn't installed).

## Out of scope

- Auto-popup at the moment a badge newly unlocks (needs persisted
  previously-earned-badge state; a future feature on its own).
- Tap behavior for locked/in-progress badges (stays inert, matching today).
- Any change to `CardShell`, `captureAndShare`, or `shareToInstagramStory`
  — all reused unmodified.
