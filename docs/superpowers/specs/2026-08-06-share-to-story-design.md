# Share-to-Story Design

**Goal:** Let users share match, session, and tournament results as branded image cards to Instagram Stories (or a generic share sheet fallback), driving social engagement and app discovery.

## Scope

Three result-card types, four entry points, one capture/share pipeline. No dependency additions — `react-native-view-shot` and `expo-sharing` are already installed.

## Content Types

### MatchResultCard
- Two team blocks: small avatar circle beside each player name (see Avatars below), player names (`F.semibold`), winning team gets `C.accent` cyan glow (`textGlow()`) + "WINNER" pill in `C.red`.
- Score: huge `F.display` (RussoOne) numerals, `C.text` white, visual centerpiece.
- Date + club/session name below score, `C.text3`.

### SessionResultCard
- Same shell/watermark as match card.
- Center: session name (`F.display`, smaller than match score) + top 3 standings rows (rank, avatar, name, win-loss) styled like existing card-list rows (`radius.md`, `C.card` background), avatar sized/positioned like the existing row avatar in `sessions/[id].tsx`.

### TournamentResultCard (champion card, v1 scope — no bracket rendering)
- Trophy icon + "CHAMPION" pill (`C.accent` glow).
- Larger hero avatar above the champion name(s) (see Avatars below).
- Champion name(s): huge `F.display`.
- Runner-up below, smaller.
- Tournament name + date.
- Shown only when tournament status is complete.

### Avatars (forward-compat for the upcoming profile-picture feature)
No avatar/photo field exists in the schema yet — it's a separate upcoming feature. Each card accepts an optional `avatarUrl?: string | null` per player, so no rework is needed once it ships:
- Present → circular `Image` at the card's avatar slot.
- Absent (current default, always today) → same initials-circle fallback already used throughout the app (`C.cardHi` background, first-letter initial in `F.display`, e.g. `app/(app)/profile.tsx:130`, `app/(app)/sessions/[id].tsx:366`) — not a blank space, just the existing avatar pattern.

### Shared card shell (all three types)
- Canvas: 1080×1920 (native IG Story size).
- Safe content zone: 1080×1420 centered — avoid top ~250px / bottom ~250px reserved for IG's own UI chrome.
- Background: `GRAD.court` gradient, full bleed, existing net-texture treatment.
- Top: `Logo.tsx` + "CourtSide" wordmark, `C.text2`, minimal.
- Bottom watermark band (inside safe zone): logo mark + `courtside-links.vercel.app/join` link text, `C.text2`.

## Entry Points

1. Post-match end screen (new UI, added as part of this feature).
2. `app/score/[matchId].tsx` — match detail/history, available anytime after the fact.
3. `app/guest/matches.tsx` — guest (non-logged-in) match history; guests get sharing too since it drives signups.
4. `app/(app)/sessions/[id].tsx` — session detail screen.
5. `app/(app)/tournaments/ops/[tournamentId].tsx` — only when tournament is complete.

## Architecture

**Components** (`src/components/share/`):
- `MatchResultCard.tsx`, `SessionResultCard.tsx`, `TournamentResultCard.tsx` — off-screen-rendered card views, each wrapped in a `react-native-view-shot` `ViewShot` ref.

**Capture/share pipeline** (`src/lib/share/`):
- `captureAndShare.ts` — calls `viewShotRef.capture()` → PNG file URI → passes to `shareToInstagramStory()`.
- `shareToInstagramStory.ts` — platform-branched:
  - iOS: `Linking.openURL('instagram-stories://share?...')`, image passed via `UIPasteboard`. True one-tap-to-Stories.
  - Android: no direct IG-Stories intent (that requires a `content://` URI via FileProvider + Intent extras, which needs `expo-intent-launcher` — a new dependency this feature doesn't take on). Android goes straight to `expo-sharing`'s `shareAsync(uri)` generic OS share sheet; the user picks Instagram from it, which opens IG's own share composer (one extra tap vs iOS, no new dep or native config).
  - On iOS, if the `instagram-stories://` scheme is unavailable (IG not installed) or `Linking.openURL` fails → falls back to `expo-sharing`'s `shareAsync(uri)`. Failure is silent to the user (no error shown) — they just see the generic sheet instead.

**Data flow:** tap share icon → render hidden card with real match/session/tournament data → capture PNG → `shareToInstagramStory(uri)` → IG Stories opens pre-filled with the image, or fallback sheet.

## Motion

Per existing `src/theme.ts` emil-style tokens — no new animation system:
- Share icon button uses existing `press` token (`scale: 0.97`) on tap.
- On capture-complete, brief fade/scale transition (`easing.snappy`, under 200ms, CSS-transition-style not keyframe) before the share sheet/IG opens.

## Error Handling

- View-shot capture failure → toast error, no share attempt.
- IG intent failure/unavailable → silent fallback to generic share sheet (see above), not surfaced as an error.

## Testing

- Unit tests for card data formatting: score display, name truncation for long player/team names, win-loss standings sort for session cards.
- Manual QA on iOS and Android, both with and without Instagram installed, to verify the fallback path.
