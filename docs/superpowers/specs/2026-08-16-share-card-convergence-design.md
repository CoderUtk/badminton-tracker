# Share-Card System Convergence

**Goal:** Make the four share cards read as one designed family, restore the QR code
the match card lost, and put real profile photos on every card — including fixing the
name-keyed aggregation that makes photos (and standings) wrong for duplicate names.

Scope is the share-image system only. The in-app achievements tab is a separate project
with its own spec.

## Problem

The app has two card architectures fighting each other.

`SessionResultCard`, `TournamentResultCard` and `BadgeResultCard` are built on
`CardShell`, which renders a true 1080×1920 canvas, a top wordmark, and a bottom
watermark band containing a QR code and the join link.

`ShareCard` — rebuilt on 2026-08-15 and now used by *both* the match-history screen and
the post-match screen — is not. It hand-rolls its own shell at 360×640 and relies on
`captureRef` scaling it 3× at capture time. Consequences:

1. **No QR code.** The watermark that every other card carries is simply absent, because
   the QR lives in `CardShell` and `ShareCard` never adopted it. This is the reported
   "stories are missing the QR code" defect, and its fix is convergence, not a bolt-on.
2. **No avatar slot**, while `Avatar.tsx` already exists and handles `avatarUrl` with an
   initials fallback and a deterministic ring colour.
3. **A resolution strategy nothing else uses**, which is also the only reason the
   outstanding `captureRef` crop-vs-scale device gate exists at all.

Beyond that, the four cards share no design rules: no common type scale, no rule for when
red versus cyan means something, radius literals instead of `radius` tokens, and
`tabular-nums` on some numbers but not others.

### The aggregation defect

`aggregate()` in `src/repos/sessionRepo.ts:206` groups players with
`new Map<string, PlayerStat>()` keyed on **display name**, and `PlayerStat` carries no
identifier:

```ts
export interface PlayerStat { name: string; wins: number; losses: number; played: number; }
```

Two players with the same display name in one session therefore merge into a single
standings row with combined wins and losses. This is a live bug in shipped standings,
independent of sharing. `SessionResultCard`'s `avatarUrls?: Record<string, string | null>`
inherits the same key and would hand one player's photo to another.

Fixing avatars correctly requires fixing the key. Papering over it by threading a
name-keyed avatar map would encode the defect into a second place.

## Scope

- Fold `ShareCard` onto `CardShell`; re-derive its layout at native 1080×1920.
- Add shared card design tokens to `src/theme.ts` and apply them across all four cards.
- Give `PlayerStat` a stable identity and re-key `aggregate()`.
- Thread real avatar URLs from all four call sites.
- Add an avatar to `BadgeResultCard` and to the match card.

Out of scope: the achievements tab, `BadgeGrid`, in-app list rows, the home dashboard,
and any change to `shareToInstagramStory` or the capture pipeline beyond deleting the
now-unnecessary resize options.

## Design rules (new, in `src/theme.ts`)

These exist so the family is enforced by import rather than by memory. All values are in
points on the 1080×1920 card canvas.

### `CARD_TYPE`

```ts
export const CARD_TYPE = {
  hero: 180,      // the single dominant numeral or name on a card
  title: 56,      // card headline (SESSION RESULTS, badge title, champion name)
  subtitle: 30,   // secondary name, standings row name
  body: 26,       // descriptive copy
  label: 22,      // stat captions, eyebrows, runner-up labels
  caption: 18,    // date, watermark sub-line
} as const;
```

`hero` is set at 180, not the match card's current ~324 effective. 324 was chosen against
a 360-wide layout and is wildly out of family with every other card's 56pt maximum; 180
keeps the match score dominant while staying in the same system.

**Minimum size rule:** no text on any card below `caption` (18). On in-app surfaces the
floor is 12, per the platform guidance; the cards are captured at 1080 so their floor is
proportionally higher.

### Accent rule

Exactly one rule, applied everywhere:

- **`C.red` = identity and framing.** Eyebrows, category pills, the brand mark.
- **`C.accent` (cyan) = the earned thing.** The winning score, the champion's name, an
  unlocked badge, a standout stat.

Today Tournament glows its champion cyan while Badge rings its icon red for the same
semantic role. Under this rule, `BadgeResultCard`'s earned icon and ring become cyan;
`ShareCard`'s eyebrow stays red and its hero numeral stays cyan-glowed.

`textGlow(C.accent)` is reserved for the single hero element on a card. Never more than
one glowing element per card.

### Radius and numerals

- Every radius comes from `radius` in `theme.ts`. No numeric literals in card styles.
- Every rendered number uses `fontVariant: ["tabular-nums"]`. This currently holds in
  `ShareCard` and not in `SessionResultCard`'s win-loss record.

### Dates

One formatter. `formatMatchDate` from `src/lib/matchDetail.ts` replaces the
`new Date(...).toLocaleDateString()` calls in `TournamentResultCard:35` and
`SessionResultCard:24`. That module documents why: `toLocaleDateString` depends on the
runtime's ICU data, which makes output vary by device and defeats deterministic tests.

## Player identity

`PlayerStat` gains a stable id, and `aggregate()` keys on it:

```ts
export interface PlayerStat {
  /** club_player_id when the player is on a club roster; otherwise `guest:<name>`. */
  id: string;
  name: string;
  wins: number;
  losses: number;
  played: number;
}
```

`MatchRecord.side_a` / `side_b` are `SidePlayer[]`, which already carries
`club_player_id: string | null` alongside `name`. `aggregate()` derives the key as
`club_player_id ?? \`guest:${name}\``.

Guests genuinely have no identity beyond their name, so two same-named guests still
merge. That is a real remaining limitation and is accepted: guests are transient,
un-rostered entries, and giving them synthetic identity would change what a guest is.
Rostered players — the ones with photos — are fully disambiguated.

Avatar maps become `Record<string, string | null>` keyed by that same `id`.

## Avatar data availability

Avatars are **not** available locally today. `avatar_url` exists in exactly one local
place, `profile_cache` (`src/db/schema.ts:101`), which holds only the signed-in user's own
profile. `ClubPlayer` has no avatar field at all — only `profile_id: string | null`
pointing at a remote `profiles` row. Rendering photos from local data as-is would put the
signed-in user's face on their own cards and initials on everyone else's.

The fix rides the roster sync that already exists, and needs **no Supabase migration**:

1. `clubRepo.ts:66` currently selects `"id, club_id, profile_id, name"` from
   `club_players`. It gains an embedded resource: `profiles(avatar_url)`. PostgREST
   resolves it through the existing `club_players.profile_id` foreign key.
2. `club_players_cache` (`src/db/db.ts:34`) gains an `avatar_url text` column, and the
   cache write at `clubRepo.ts:99` flattens the embedded value into it. This is a local
   SQLite change only.
3. `ClubPlayer` gains `avatarUrl: string | null`.

Cards then read the avatar straight off the roster row they already load. Capture stays
synchronous with no network round trip, which is what the offline-first design requires.

**RLS is already permissive enough.** `supabase/migrations/0018_anon_rls_restrictions.sql:24-26`
makes `public.profiles` selectable by any authenticated, non-anonymous user. No policy
change is needed, and none should be made — widening profile visibility is a
security-sensitive change and this feature does not require one.

Two groups get initials, permanently and by design:
- **Anonymous / guest sessions**, which policy `0018` blocks from reading `profiles`.
- **Roster-only players** with `profile_id = null`, who are not app users and have no
  profile to draw from.

`Avatar.tsx` already renders a deterministic coloured initials circle for both cases. A
card mixing photos and initials is the expected steady state, not a degraded one.

## Card-by-card changes

### `ShareCard` (match)

Wrapped in `CardShell`, laid out at native canvas scale, and losing its hand-rolled
gradient, wordmark and footer — `CardShell` owns all three, and with them the QR.

Content, top to bottom inside the shell's safe zone: `MATCH WON` eyebrow (`label`, red) →
hero score numeral (`hero`, cyan glow) → foil numeral (`title`, `C.ghost`) → hairline →
the two team rows, each an `Avatar` (size 72) beside the team name (`subtitle`) → game
chip strip → the four stat tiles.

The local stat tile stays local (it was deliberately decoupled from the home screen's
`StatTile` on 2026-08-15) but its type sizes come from `CARD_TYPE`.

Doubles teams have two players. The team row shows up to two overlapping avatars
(second offset left by 40% of its size), then the joined team name. Singles shows one.

### `TournamentResultCard`

Already the closest to correct. Changes: `CARD_TYPE` sizes, `formatMatchDate`, and the
`CHAMPION` pill's `glow(C.accent)` on a `C.red` background resolves to the accent rule —
pill stays red (identity/framing), champion name keeps its cyan glow (the earned thing),
and the pill's cyan glow is removed so only one element glows.

### `SessionResultCard`

`CARD_TYPE` sizes, `formatMatchDate`, `tabular-nums` on the win-loss record, and
`avatarUrls` re-keyed to `PlayerStat.id`.

### `BadgeResultCard`

Gains an `Avatar` beside the player name, and its icon ring moves from `C.red` to
`C.accent` under the accent rule — an earned badge is the archetypal "earned thing".

## Call sites

Four screens must supply avatar data they currently do not:

| Screen | Card | Needs |
|---|---|---|
| `app/(app)/matches/[id].tsx` | `ShareCard` | avatar URL per player in `side_a` / `side_b` |
| `src/screens/MatchScreen.tsx` | `ShareCard` | same, from live match config |
| `app/(app)/sessions/[id].tsx` | `SessionResultCard` | `Record<PlayerStat.id, url>` |
| `app/(app)/tournaments/[id].tsx` | `TournamentResultCard` | champion + runner-up URLs |

No new fetch helper is needed. Once `ClubPlayer` carries `avatarUrl` (see Avatar data
availability), every one of these screens already loads the roster or the match record it
needs, and reads the avatar off the row it has.

The one screen without a roster in hand is `src/screens/MatchScreen.tsx`, which works from
live `MatchConfig.teams`. Those are `Player` records (`id`, `name`), and the id is the
`club_player_id` when the player came from a roster — so it looks up the same
`club_players_cache` rows the match setup screen already used.

Players who resolve to no avatar are simply passed `avatarUrl: null`, and `Avatar` falls
back to initials — its existing, already-correct behaviour.

## Capture pipeline

Once every card renders at native 1080×1920, `captureRef`'s `width`/`height` options
become redundant and are removed from both `src/lib/shareMatch.ts` and
`src/lib/share/captureAndShare.ts`. Captures become 1:1.

This retires the outstanding crop-vs-scale device gate from the 2026-08-15 plan, whose
entire risk was that `react-native-view-shot` may crop rather than scale on some Android
versions. Nothing will ask it to scale any more.

## Error handling

Unchanged. `captureAndShare` already toasts on failure; `shareMatchCard` failures are
caught at the call site. `getAvatarUrls` returning an empty map is a normal outcome, not
an error — every card already renders correctly with initials.

## Testing

Pure-logic tests only, per this repo's node-env Jest setup. Components are not unit
tested here.

- `aggregate()` re-keying: two rostered players sharing a display name produce two
  standings rows with separate records; two same-named guests still merge; a rostered
  player and a guest sharing a name stay separate.
- Roster cache round-trip: a `club_players` row with an embedded profile avatar flattens
  to `avatarUrl` on read; a row with `profile_id = null` reads back `avatarUrl: null`; an
  existing cache row written before the column was added reads back null rather than
  throwing.
- Existing `tests/share/cardData.test.ts` and `tests/clubStats.test.ts` must be updated
  for the new `PlayerStat` shape, not deleted.
- Manual: one share from each of the four cards, confirming a scannable QR on all four,
  a real photo where one exists, and initials where one does not.

## Risks

- **`PlayerStat` is a published shape.** `getClubStats` shares it with `getSessionStats`,
  and `tests/clubStats.test.ts` and `tests/share/cardData.test.ts` both construct it.
  Adding a required `id` is a breaking change across those consumers; every construction
  site must be updated in the same task.
- **`ShareCard` is rebuilt, not adjusted.** Its 2026-08-15 layout was derived against a
  360-point canvas. Re-deriving at 1080 is a rewrite of the StyleSheet, and the resulting
  proportions will not match the current card exactly.
- **`club_players_cache` gains a column.** Existing installs have the old table. The
  local schema change must be additive and tolerate rows written before it, or the roster
  breaks for every current user on upgrade. No Supabase migration is involved, so this
  risk is confined to the device.
- **Remote avatar images are loaded during capture.** `Avatar` renders a network `Image`
  when given a URL. If the image has not finished loading when `captureRef` fires, the
  card captures an empty circle instead of the photo. The implementation must confirm
  whether the existing cards already have this problem (they accept `avatarUrl` today,
  just never receive one) and, if so, preload or gate capture on image load. This is the
  most likely source of a silently wrong shared image.
