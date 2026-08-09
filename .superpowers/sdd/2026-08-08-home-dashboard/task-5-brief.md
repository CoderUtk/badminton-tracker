### Task 5: Rewrite the home screen

**Files:**
- Rewrite: `app/(app)/index.tsx`

**Interfaces:**
- Consumes everything produced by Tasks 1–4.
- Produces: nothing consumed downstream.

Section order, top to bottom: greeting, CTA, feature copy (conditional), next
session (conditional), clubs, recent performance. The clubs list is mapped
inline — it no longer owns the scroll, so `AnimatedList` is dropped from this
screen.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/(app)/index.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Club, ClubPlayer, listRealClubs, refreshClubs,
} from "../../src/repos/clubRepo";
import { ClubSession, listSessions, refreshSessions } from "../../src/repos/sessionRepo";
import { getMyProfile } from "../../src/repos/profileRepo";
import { getPlayerAnalytics, type PlayerAnalytics } from "../../src/repos/statsRepo";
import {
  liveClubIds, pickNextSession, resolveMyPlayerName, sessionMetaLabel,
  shouldShowFeatureCopy, statTileValues,
} from "../../src/home/dashboard";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import StatTile from "../../src/components/StatTile";
import NextSessionCard from "../../src/components/NextSessionCard";
import ClubSheet from "../../src/components/ClubSheet";
import { useSession } from "../../src/stores/session";
import { C, F, GRAD, glow, press } from "../../src/theme";

export default function Home() {
  const router = useRouter();
  const { session } = useSession();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [analytics, setAnalytics] = useState<PlayerAnalytics | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Stamped once per load rather than read during render, so the memos below
  // actually memoize and "Today" cannot flip mid-render.
  const [now, setNow] = useState(() => Date.now());

  const emailPrefix = session?.user.email?.split("@")[0] ?? null;
  const greetName = displayName || emailPrefix || "Player";

  const reload = useCallback(() => {
    setNow(Date.now());
    void refreshClubs().then(() => listRealClubs().then(setClubs));
    void listRealClubs().then(setClubs);
    void refreshSessions().then(() => listSessions().then(setSessions));
    void listSessions().then(setSessions);
    void getMyProfile().then(async (profile) => {
      setDisplayName(profile?.displayName ?? null);
      const players = await listMyClubPlayers();
      const name = resolveMyPlayerName(players, profile?.id ?? null, profile?.displayName ?? null);
      setAnalytics(name ? await getPlayerAnalytics(name) : null);
    });
  }, []);
  useFocusEffect(reload);

  const next = useMemo(() => pickNextSession(sessions, now), [sessions, now]);
  const live = useMemo(() => liveClubIds(sessions), [sessions]);
  const nextClubName = next
    ? clubs.find((c) => c.id === next.club_id)?.name ?? "Session"
    : null;
  const stats = statTileValues(analytics);
  const showCopy = shouldShowFeatureCopy(analytics);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.greetRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.greetEyebrow}>WELCOME BACK</Text>
            <Text style={s.greetName} numberOfLines={1}>{greetName}</Text>
          </View>
          <Logo size={34} showWordmark={false} />
        </View>

        <Pressable
          style={({ pressed }) => [s.ctaWrap, pressed && press]}
          onPress={() => router.push("/new-match")}
          accessibilityRole="button"
          accessibilityLabel="Start a match"
        >
          <LinearGradient
            colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}
          >
            <Icon name="play" color={C.text} size={26} />
            <Text style={s.ctaText}>START A MATCH</Text>
          </LinearGradient>
        </Pressable>

        {showCopy && (
          <Text style={s.featureCopy}>
            Track points, serve orientation, rally history, and set points — live.
          </Text>
        )}

        {next && nextClubName && (
          <NextSessionCard
            title={nextClubName}
            meta={sessionMetaLabel(next, now)}
            onPress={() => router.push(`/(app)/sessions/${next.id}`)}
          />
        )}

        <View style={s.sectionRow}>
          <Text style={s.h}>Your clubs</Text>
          {clubs.length > 0 && (
            <Pressable
              style={({ pressed }) => [s.plusBtn, pressed && press]}
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Create or join a club"
            >
              <Icon name="add" color={C.text} size={18} />
            </Pressable>
          )}
        </View>

        {clubs.length === 0 ? (
          <Pressable
            style={({ pressed }) => [s.emptyCta, pressed && press]}
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
          >
            <Icon name="add" color={C.text} size={18} />
            <Text style={s.emptyCtaText}>Create or join a club</Text>
          </Pressable>
        ) : (
          clubs.map((club) => (
            <Pressable
              key={club.id}
              style={({ pressed }) => [s.club, pressed && press]}
              onPress={() => router.push(`/(app)/clubs/${club.id}`)}
            >
              <View style={s.clubIcon}>
                <Icon name="account-group" color={C.red} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.clubName}>{club.name}</Text>
                <Text style={s.clubMeta}>
                  {club.role ?? "member"}
                  {club.invite_code ? ` · code ${club.invite_code}` : ""}
                </Text>
              </View>
              {live.has(club.id) && (
                <View style={s.livePill}><Text style={s.livePillText}>LIVE</Text></View>
              )}
              <Icon name="chevron-forward" color={C.text2} size={20} />
            </Pressable>
          ))
        )}

        <Text style={[s.h, s.perfHeading]}>Recent performance</Text>
        <View style={s.statRow}>
          <StatTile label="Matches" value={stats.matches} />
          <StatTile
            label="Win Rate" value={stats.winRate}
            valueColor={stats.hasRates ? C.green : C.text2}
          />
          <StatTile
            label="Longest Streak" value={stats.streak}
            valueColor={stats.hasRates ? C.amber : C.text2}
          />
        </View>
      </ScrollView>

      {sheetOpen && (
        <ClubSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onChanged={reload} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  greetRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },
  greetEyebrow: { color: C.text3, fontSize: 11, fontFamily: F.medium, letterSpacing: 1.5 },
  greetName: { color: C.text, fontSize: 24, fontFamily: F.display, letterSpacing: 0.5 },
  ctaWrap: { borderRadius: 16, ...glow(C.red, 18, 0.5) },
  cta: {
    flexDirection: "row", gap: 12, borderRadius: 16, minHeight: 96,
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: C.text, fontSize: 22, fontFamily: F.display, letterSpacing: 1 },
  featureCopy: {
    color: C.text2, fontSize: 13, fontFamily: F.body, lineHeight: 19,
    textAlign: "center", paddingHorizontal: 8, marginTop: -4,
  },
  h: { color: C.text, fontSize: 17, fontFamily: F.bold, letterSpacing: 0.4 },
  perfHeading: { marginTop: 6 },
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6,
  },
  plusBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.red, alignItems: "center", justifyContent: "center",
  },
  emptyCta: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, height: 56,
  },
  emptyCtaText: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  club: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  clubIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,59,48,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  clubName: { color: C.text, fontSize: 17, fontWeight: "700" },
  clubMeta: { color: C.text2, fontSize: 13, marginTop: 2 },
  livePill: {
    backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  livePillText: { color: C.green, fontSize: 11, fontFamily: F.bold, letterSpacing: 0.5 },
  statRow: { flexDirection: "row", gap: 8 },
});
```

- [ ] **Step 2: Add the club-players lookup the screen needs**

The code above calls `listMyClubPlayers()`, which does not exist yet.
`clubRepo` already caches club players in `club_players_cache` with a
`profile_id` column (see `src/repos/clubRepo.ts:84`). Add this export to
`src/repos/clubRepo.ts`, next to the other `list*` functions:

```ts
/** Every club-player row on this device, across all clubs — used to work out
 *  which name the signed-in user appears under in match records. */
export async function listMyClubPlayers(): Promise<ClubPlayer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllAsync<ClubPlayer>("select * from club_players_cache");
}
```

Then add it to the import in `app/(app)/index.tsx`:

```ts
import {
  Club, ClubPlayer, listMyClubPlayers, listRealClubs, refreshClubs,
} from "../../src/repos/clubRepo";
```

- [ ] **Step 3: Check the profile and session repo signatures**

Confirm three things and adjust the screen if any differ — do not change the repos:

1. `getMyProfile()` returns an object with `id` and `displayName`. If the id field is named differently, use the actual name in the `resolveMyPlayerName` call.
2. `refreshSessions()` exists and is exported from `src/repos/sessionRepo`. If it takes a required `clubId`, drop the `refreshSessions()` call and rely on `listSessions()` against the local cache.
3. `getPlayerAnalytics` and `PlayerAnalytics` are both exported from `src/repos/statsRepo` — they are, at `src/repos/statsRepo.ts:6` and `:17`.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: silent. `ClubPlayer` is imported for the repo function's return type;
if tsc flags it as unused in the screen, remove it from the screen's import
list only.

- [ ] **Step 5: Run the full suite**

```bash
npx jest
```

Expected: PASS. Nothing here should touch existing tests; if
`tests/guestMatches.test.ts` or any routing test fails, the screen has changed
an export it should not have.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/index.tsx" src/repos/clubRepo.ts
git commit -m "feat(home): rebuild home as a dashboard with stats and next session"
```

---

