# Avatars on Share Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each player's real profile photo on every share card, falling back to the existing initials circle when there isn't one, without capturing a card before its images have loaded.

**Architecture:** Two small helpers do the shared work: one resolves a player id to a cached avatar URL, and one preloads a set of URLs so `captureRef` never fires against an unloaded `Image`. Each of the four cards then renders the existing `Avatar` component, and each of the five call sites resolves and preloads before it captures.

**Tech Stack:** React Native, Expo SDK 57, `react-native-view-shot`, Jest with `ts-jest` in a `node` environment.

**Spec:** `docs/superpowers/specs/2026-08-16-share-card-convergence-design.md` (sub-project C)

**Depends on both:**
- **Sub-project A** — `PlayerStat.id` and `ClubPlayer.avatar_url` must exist. Without A there is no avatar data and no stable key.
- **Sub-project B** — `CARD_TYPE` must exist, and `ShareCard` must already be on `CardShell` at native 1080, because avatar sizes here are chosen against that canvas.

Do not start this sub-project until both are merged.

## Global Constraints

- Expo has changed — read https://docs.expo.dev/versions/v57.0.0/ before writing any Expo API code.
- **No new dependencies.**
- **No Supabase migration.** Do not create or edit any file under `supabase/migrations/`, and do not change any RLS policy. `profiles` is already readable to authenticated non-anonymous users via `0018_anon_rls_restrictions.sql:24-26`.
- **No network fetch during capture.** Avatars come from `club_players_cache`, populated by the roster sync in sub-project A. Sharing must keep working offline.
- Jest is `testEnvironment: "node"` with `roots: ["<rootDir>/tests"]`. Pure logic only; never unit-test a React Native component here.
- Colours, fonts, spacing, radii and type sizes come from `src/theme.ts`. No hardcoded hex, no font-size literals in cards.
- Commit with an explicit pathspec. Never `git add -A`, `git add .`, or `git commit -a`. Quote paths with parentheses: `git add "app/(app)/sessions/[id].tsx"`.
- Do not add a `Co-Authored-By` trailer.
- `npx tsc --noEmit` clean, `npm test` green.

**What `Avatar` already does** (`src/components/share/Avatar.tsx`, do not modify): takes `{ name, avatarUrl?, size? }`, renders a network `Image` when given a URL and a deterministic coloured initials circle otherwise. The fallback is already correct — this sub-project feeds it, it does not change it.

---

## File Structure

**Create:**
- `src/lib/share/avatars.ts` — id-to-URL resolution and image preloading.
- `tests/share/avatars.test.ts`.

**Modify:**
- `src/components/ShareCard.tsx` — team rows with avatars.
- `src/components/share/SessionResultCard.tsx` — re-key `avatarUrls` to `PlayerStat.id`.
- `src/components/share/BadgeResultCard.tsx` — add an avatar beside the player name.
- `app/(app)/matches/[id].tsx`, `src/screens/MatchScreen.tsx`, `app/(app)/sessions/[id].tsx`, `app/(app)/tournaments/[id].tsx`, `src/components/BadgeSharePopup.tsx` — resolve, preload, pass.

---

## Task 1: Avatar resolution and preloading

**Files:**
- Create: `src/lib/share/avatars.ts`
- Test: `tests/share/avatars.test.ts`

**Interfaces:**
- Consumes: `ClubPlayer` from `src/repos/clubRepo.ts`, which carries `id` and `avatar_url: string | null` after sub-project A.
- Produces:
  - `avatarMap(players: ClubPlayer[]): Record<string, string | null>`
  - `preloadAvatars(urls: (string | null | undefined)[]): Promise<void>`

**Why preloading matters.** `Avatar` renders `<Image source={{ uri }} />`, and `captureRef` fires synchronously when the user taps share. If the image has not decoded yet, the card captures an empty circle — a silently wrong shared image that no test in this repo can catch. `preloadAvatars` resolves before capture so the pixels exist.

- [ ] **Step 1: Write the failing tests**

Create `tests/share/avatars.test.ts`:

```ts
const prefetch = jest.fn().mockResolvedValue(true);
jest.mock("react-native", () => ({ Image: { prefetch: (u: string) => prefetch(u) } }));

import { avatarMap, preloadAvatars } from "../../src/lib/share/avatars";
import type { ClubPlayer } from "../../src/repos/clubRepo";

function player(id: string, name: string, avatar_url: string | null): ClubPlayer {
  return { id, club_id: "c-1", profile_id: avatar_url ? "p-1" : null, name, avatar_url };
}

afterEach(() => prefetch.mockClear());

test("avatarMap keys by player id, not name", () => {
  const map = avatarMap([player("cp-1", "Rahul", "u1"), player("cp-2", "Rahul", "u2")]);
  expect(map).toEqual({ "cp-1": "u1", "cp-2": "u2" });
});

test("avatarMap keeps players with no avatar, mapped to null", () => {
  expect(avatarMap([player("cp-3", "Bob", null)])).toEqual({ "cp-3": null });
});

test("avatarMap of an empty roster is an empty map", () => {
  expect(avatarMap([])).toEqual({});
});

test("preloadAvatars prefetches each real url exactly once", async () => {
  await preloadAvatars(["u1", "u2", "u1"]);
  expect(prefetch).toHaveBeenCalledTimes(2);
});

test("preloadAvatars skips null and undefined without calling prefetch", async () => {
  await preloadAvatars([null, undefined]);
  expect(prefetch).not.toHaveBeenCalled();
});

test("preloadAvatars resolves even when a prefetch rejects", async () => {
  prefetch.mockRejectedValueOnce(new Error("offline"));
  await expect(preloadAvatars(["u1"])).resolves.toBeUndefined();
});
```

The last test is the important one: a share must not be blocked by an unreachable image. The card falls back to initials and the user still gets their card.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/share/avatars.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/share/avatars.ts`:

```ts
import { Image } from "react-native";
import type { ClubPlayer } from "../../repos/clubRepo";

/**
 * Roster rows to an id-keyed avatar lookup.
 *
 * Keyed by club player id, never by display name: two players in one club can
 * share a name, and a name-keyed map hands one of them the other's photo.
 */
export function avatarMap(players: ClubPlayer[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const p of players) out[p.id] = p.avatar_url;
  return out;
}

/**
 * Warm the image cache before a card is captured.
 *
 * Avatar renders a network Image, and captureRef fires synchronously on tap.
 * Without this the capture can win the race and bake an empty circle into the
 * shared PNG - wrong, and silent. A failed prefetch is deliberately swallowed:
 * an unreachable avatar should degrade to the initials fallback, not block the
 * share.
 */
export async function preloadAvatars(urls: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  await Promise.all(unique.map((u) => Image.prefetch(u).catch(() => false)));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest tests/share/avatars.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck, suite, commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/lib/share/avatars.ts tests/share/avatars.test.ts
git commit -m "feat(share): resolve and preload player avatars for card capture"
```

---

## Task 2: Avatars on the match card

**Files:**
- Modify: `src/components/ShareCard.tsx`
- Modify: `app/(app)/matches/[id].tsx`
- Modify: `src/screens/MatchScreen.tsx`

**Interfaces:**
- Consumes: `avatarMap` and `preloadAvatars` from Task 1; `Avatar` from `src/components/share/Avatar.tsx`; `CARD_TYPE` from sub-project B.
- Produces: `ShareCardProps` gains two fields, replacing the reserved-but-unused `avatarUrl`:

```ts
  /** Per-side players, in display order, for avatar rendering. */
  sideA: { name: string; avatarUrl: string | null }[];
  sideB: { name: string; avatarUrl: string | null }[];
```

The existing `teamA` / `teamB` joined-name strings stay — they remain the truncated display label. Delete the now-superseded `avatarUrl?: string | null` reserved prop and its comment; this is the feature it was reserved for.

- [ ] **Step 1: Render avatar rows**

In `ShareCard`, replace the single `winner` / `loser` name lines with two team rows. The winning side's row comes first. Each row is: the side's avatars, then the joined team name.

```tsx
function TeamRow({ players, label, winning }: {
  players: { name: string; avatarUrl: string | null }[];
  label: string;
  winning: boolean;
}) {
  return (
    <View style={s.teamRow}>
      <View style={s.avatars}>
        {players.map((p, i) => (
          <View key={i} style={i > 0 ? s.avatarOverlap : undefined}>
            <Avatar name={p.name} avatarUrl={p.avatarUrl} size={96} />
          </View>
        ))}
      </View>
      <Text style={winning ? s.winner : s.loser} numberOfLines={2}>{label}</Text>
    </View>
  );
}
```

with styles:

```ts
  teamRow: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 12 },
  avatars: { flexDirection: "row" },
  // Doubles pairs overlap so two 96pt avatars read as one team unit rather
  // than as two unrelated players.
  avatarOverlap: { marginLeft: -32 },
```

The loser row keeps its `def.` prefix in the label passed by the caller, not in the component.

- [ ] **Step 2: Wire the match-history call site**

In `app/(app)/matches/[id].tsx`, build the per-side player arrays from `match.side_a` / `match.side_b` and the roster avatar map, and preload before capturing.

`SidePlayer` is `{ club_player_id: string | null; name: string }`. Load the roster with `listAllPlayers()` from `src/repos/clubRepo.ts` in the existing `useEffect`, hold it in state, and derive:

```ts
  const avatars = useMemo(() => avatarMap(roster), [roster]);
  const withAvatars = (side: SidePlayer[]) =>
    side.map((p) => ({ name: p.name, avatarUrl: p.club_player_id ? avatars[p.club_player_id] ?? null : null }));
```

Change `onShare` to preload first:

```ts
  const onShare = async () => {
    try {
      await preloadAvatars([...withAvatars(match.side_a), ...withAvatars(match.side_b)].map((p) => p.avatarUrl));
      await shareMatchCard(cardRef);
    } catch {
      toast("Couldn't share", "error");
    }
  };
```

Pass `sideA={withAvatars(match.side_a)}` and `sideB={withAvatars(match.side_b)}` to `ShareCard`.

- [ ] **Step 3: Wire the post-match call site**

`src/screens/MatchScreen.tsx` works from live `MatchConfig.teams`, which are `Player` records (`{ id, name }`) where `id` is the `club_player_id` for rostered players. Apply the same pattern: load the roster once, build the map, preload inside the share handler before `captureAndShare`.

- [ ] **Step 4: Typecheck, suite, commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/components/ShareCard.tsx "app/(app)/matches/[id].tsx" src/screens/MatchScreen.tsx
git commit -m "feat(share): show player photos on the match card"
```

---

## Task 3: Re-key session avatars and feed them

**Files:**
- Modify: `src/components/share/SessionResultCard.tsx`
- Modify: `app/(app)/sessions/[id].tsx`

`SessionResultCard` already accepts `avatarUrls?: Record<string, string | null>` but keys it by player **name** (`avatarUrls[p.name]`, line 29) and no caller has ever passed it.

- [ ] **Step 1: Re-key the lookup**

Change line 29 from `avatarUrls[p.name]` to `avatarUrls[p.id]`. `PlayerStat.id` exists after sub-project A. Update the prop's doc to state that it is keyed by `PlayerStat.id`, and why:

```ts
  /** Keyed by PlayerStat.id, never by name - two players in a club can share
   *  a display name, and a name key hands one of them the other's photo. */
  avatarUrls?: Record<string, string | null>;
```

- [ ] **Step 2: Feed it from the session screen**

In `app/(app)/sessions/[id].tsx`, load the roster, build `avatarMap(roster)`, preload before `captureAndShare`, and pass `avatarUrls`. The card renders at most three standings rows (`topStandings(stats.players, 3)`), so preload only those three URLs rather than the whole roster.

- [ ] **Step 3: Typecheck, suite, commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/components/share/SessionResultCard.tsx "app/(app)/sessions/[id].tsx"
git commit -m "feat(share): key session card avatars by player id and feed them"
```

---

## Task 4: Tournament and badge cards

**Files:**
- Modify: `src/components/share/BadgeResultCard.tsx`
- Modify: `src/components/BadgeSharePopup.tsx`
- Modify: `app/(app)/tournaments/[id].tsx`

`TournamentResultCard` already renders `Avatar` for both champion and runner-up and already accepts `avatarUrl` on each — the call site simply never passes one (`champion={{ name: champName }}`, line 331).

- [ ] **Step 1: Feed the tournament card**

In `app/(app)/tournaments/[id].tsx`, resolve the champion's and runner-up's avatar URLs from the roster map, preload both, and pass them through the existing `champion` / `runnerUp` props. No change to `TournamentResultCard` itself.

- [ ] **Step 2: Add an avatar to the badge card**

`BadgeResultCard` currently renders `playerName` as bare text. Give it an optional avatar and show it beside the name:

```tsx
export default function BadgeResultCard({
  badge, playerName, avatarUrl = null,
}: {
  badge: { title: string; description: string; icon: string };
  playerName: string;
  avatarUrl?: string | null;
}) {
```

and in the render, replace the lone `name` Text with a row:

```tsx
        <View style={s.playerRow}>
          <Avatar name={playerName} avatarUrl={avatarUrl} size={72} />
          <Text style={s.name}>{playerName}</Text>
        </View>
```

```ts
  playerRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 12 },
```

- [ ] **Step 3: Feed the badge card**

`src/components/BadgeSharePopup.tsx` renders `BadgeResultCard` twice (preview and capture). A badge belongs to the signed-in user, so its avatar is the user's own — read it from `getMyProfile()` in `src/repos/profileRepo.ts`, which already exposes `avatarUrl`. This is the one card that does not need the roster. Preload it before capture.

- [ ] **Step 4: Typecheck, suite, commit**

Run: `npx tsc --noEmit && npm test`

```bash
git add src/components/share/BadgeResultCard.tsx src/components/BadgeSharePopup.tsx "app/(app)/tournaments/[id].tsx"
git commit -m "feat(share): show photos on the tournament and badge cards"
```

---

## Manual verification

Nothing here is covered by the node-env suite, and the capture race in particular can only be seen on a device.

- [ ] **Photos appear.** With a club containing at least two members who have set profile photos, share from all five surfaces and confirm real photos render.
- [ ] **The race is closed.** Cold-start the app (so no image is in memory), open a match, and tap share *immediately*. The captured PNG must contain the photo, not an empty circle. Repeat three times — this is a race, so a single pass proves little.
- [ ] **Airplane mode still shares.** With no network and a cold image cache, sharing must still produce a card, with initials in place of photos, and must not hang or toast an error.
- [ ] **Same-named players get their own faces.** Two rostered players sharing a display name must show different photos on the session card. This is the bug the id re-key exists to fix.
- [ ] **Roster-only players show initials**, not a blank circle.
- [ ] **Doubles avatar overlap** reads as one team unit and does not collide with the team name.

---

## Self-Review

**Spec coverage (sub-project C only):**

| Spec requirement | Task |
|---|---|
| Avatars keyed by stable id, never name | 1, 3 |
| Match card shows player photos | 2 |
| Session card shows photos, re-keyed | 3 |
| Tournament card fed real URLs | 4 |
| Badge card gains an avatar | 4 |
| Roster-only and anonymous users fall back to initials | 1 (null mapping) + `Avatar` unchanged |
| No network fetch during capture | Global Constraints; data comes from cache |
| Image-load-during-capture race handled | 1 (`preloadAvatars`), 2-4 (call sites), manual check |

**Deviation from the spec:** the spec described a single `getAvatarUrls` repo helper. That was written before I confirmed `ClubPlayer` would carry `avatar_url` directly (sub-project A), so no repo query is needed — `avatarMap` is a pure transform over rows the screens already load. Simpler, and testable in the node environment.

**Reserved prop retired:** `ShareCardProps.avatarUrl?` was added on 2026-08-15 as forward-compat for exactly this feature. Task 2 replaces it with `sideA` / `sideB`, because a match has up to four players and one optional URL was never going to be enough.

**Type consistency:** `avatarMap` returns `Record<string, string | null>`, matching `SessionResultCard.avatarUrls` and the lookups in Task 2. `preloadAvatars` accepts `(string | null | undefined)[]`, which is what `.map((p) => p.avatarUrl)` produces at every call site.

**Placeholder scan:** none. Tasks 2 step 3, 3 step 2 and 4 steps 1 and 3 describe call-site wiring as a named pattern rather than full file bodies, because each screen's surrounding data-loading code differs and the pattern (load roster, `avatarMap`, `preloadAvatars`, pass) is given explicitly in Task 2 step 2 with real code.
