import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Club, listMyClubPlayers, listRealClubs, refreshClubs,
} from "../../src/repos/clubRepo";
import { ClubSession, listSessions, refreshSessions } from "../../src/repos/sessionRepo";
import { getMyProfile } from "../../src/repos/profileRepo";
import { getPlayerAnalytics, type PlayerAnalytics } from "../../src/repos/statsRepo";
import {
  isFirstRun, liveClubIds, pickNextSession, resolveMyPlayerName, resolveNextSessionTitle,
  sessionMetaLabel, shouldShowFeatureCopy, statTileValues,
} from "../../src/home/dashboard";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import StatTile from "../../src/components/StatTile";
import NextSessionCard from "../../src/components/NextSessionCard";
import ClubSheet from "../../src/components/ClubSheet";
import FirstRunPanel from "../../src/components/FirstRunPanel";
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
  // Three-valued gate for the blocks below the CTA: "pending" until the first
  // cache read resolves (nothing renders below the CTA, so there is no flash
  // and no spinner — just the CTA), "ready" once analytics/clubs reflect a
  // real cache read (isFirstRun decides panel vs dashboard), or "failed" if
  // the read itself threw, in which case we show the dashboard rather than
  // risk the first-run panel on an established user whose data just didn't load.
  const [status, setStatus] = useState<"pending" | "ready" | "failed">("pending");
  // Guards every setState below against a chain that resolves after a newer
  // focus (or after unmount) has already started. Bumped both at the start
  // of reload() and in the useFocusEffect cleanup.
  const epochRef = useRef(0);

  const emailPrefix = session?.user.email?.split("@")[0] ?? null;
  const greetName = displayName || emailPrefix || "Player";

  const reload = useCallback(() => {
    const epoch = ++epochRef.current;
    setNow(Date.now());

    // Reads the local cache and derives clubs, sessions, and the player's
    // name/analytics from it. Used once for an instant first paint (against
    // whatever is already cached) and once more after the network refresh
    // resolves, so a cold cache never leaves stale-wrong state on screen.
    const loadFromCache = async () => {
      // Clubs, sessions, profile, and club players are mutually independent —
      // only analytics depends on the resolved player name. Awaiting them in
      // series cost four sequential round trips for no ordering benefit.
      const [clubsNow, sessionsNow, profile, players] = await Promise.all([
        listRealClubs(), listSessions(), getMyProfile(), listMyClubPlayers(),
      ]);
      if (epoch !== epochRef.current) return;
      setClubs(clubsNow);
      setSessions(sessionsNow);
      setDisplayName(profile?.displayName ?? null);

      const name = resolveMyPlayerName(players, profile?.id ?? null, profile?.displayName ?? null);
      // Own try/catch rather than falling through to the chain's catch below:
      // a failing analytics read must not leave `status` stuck at "pending"
      // forever, which would blank everything under the CTA. A user whose
      // analytics fail but who has clubs still gets the dashboard, because
      // isFirstRun checks both.
      const stats = name
        ? await getPlayerAnalytics(name).catch(() => null)
        : null;
      if (epoch !== epochRef.current) return;
      setAnalytics(stats);
      setStatus("ready");
    };

    void loadFromCache()
      .then(() => refreshClubs())
      .then(() => refreshSessions())
      .then(() => {
        if (epoch !== epochRef.current) return;
        return loadFromCache();
      })
      .catch(() => {
        // A throw anywhere in the chain (e.g. getDb, listSessions, or
        // getMyProfile inside loadFromCache's Promise.all) must not surface
        // as an unhandled rejection. It also must not be treated as a
        // successful "ready" read: clubs/analytics are empty here because
        // nothing was read, not because the account is empty, so falling
        // through to "ready" could show the first-run panel to an
        // established user. Only promote a still-"pending" state to
        // "failed" (dashboard, never the panel); never clobber a "ready"
        // already set by this or a newer chain. Epoch-guarded like every
        // other setState above.
        if (epoch === epochRef.current) {
          setStatus((s) => (s === "pending" ? "failed" : s));
        }
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        epochRef.current += 1;
      };
    }, [reload])
  );

  const next = useMemo(() => pickNextSession(sessions, now), [sessions, now]);
  const live = useMemo(() => liveClubIds(sessions), [sessions]);
  const nextSessionTitle = resolveNextSessionTitle(clubs, next);
  const stats = statTileValues(analytics);
  const showCopy = shouldShowFeatureCopy(analytics);
  const firstRun = isFirstRun(analytics, clubs, status === "ready");

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.greetRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.greetEyebrow}>{firstRun ? "WELCOME" : "WELCOME BACK"}</Text>
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

        {status === "pending" ? null : firstRun ? (
          <FirstRunPanel onCreateClub={() => setSheetOpen(true)} />
        ) : (
          <>
            {showCopy && (
              <Text style={s.featureCopy}>
                Track points, serve orientation, rally history, and set points — live.
              </Text>
            )}

            {next && nextSessionTitle && (
              <NextSessionCard
                title={nextSessionTitle}
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
                  accessibilityRole="button"
                  accessibilityLabel={club.name}
                >
                  <View style={s.clubIcon}>
                    <Icon name="account-group" color={C.red} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.clubName}>{club.name}</Text>
                    <Text style={s.clubMeta}>
                      {club.role ?? "member"}
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
          </>
        )}
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
