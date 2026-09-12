import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Avatar from "../../src/components/share/Avatar";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import PressableScale from "../../src/components/PressableScale";
import { getPublicPlayerProfile, type PublicPlayerProfile } from "../../src/repos/publicProfileRepo";
import { formatWinRate } from "../../src/lib/winRate";
import { C, F, MIN_TOUCH, radius } from "../../src/theme";

/**
 * The app's only inbound link surface. Readable with no account — see 0052
 * for what it is allowed to show and why the not-found state is shared by
 * "no such player", "private" and "no username".
 */
export default function PublicPlayerPage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!username) return;
    let live = true;
    void getPublicPlayerProfile(username).then((p) => {
      if (!live) return;
      setProfile(p);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [username]);

  if (!loaded) return <View style={s.root} />;

  if (!profile) {
    return (
      <View style={[s.root, s.center]}>
        <Stack.Screen options={{ title: "Player" }} />
        <Logo size={44} />
        <Text style={s.notFound}>No public profile here</Text>
        <Text style={s.sub}>
          This player either doesn&apos;t exist or hasn&apos;t made their profile public.
        </Text>
      </View>
    );
  }

  // formatWinRate is the app's one rule for this: below five completed
  // matches it shows an em dash rather than a percentage nobody should read.
  const pct = profile.played > 0 ? Math.round((profile.won / profile.played) * 100) : 0;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      <Stack.Screen options={{ title: profile.displayName }} />

      <View style={s.hero}>
        <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} size={88} />
        <Text style={s.name}>{profile.displayName}</Text>
        <Text style={s.handle}>@{profile.username}</Text>
      </View>

      <View style={s.statRow}>
        <Stat label="Played" value={String(profile.played)} />
        <Stat label="Won" value={String(profile.won)} color={C.green} />
        <Stat label="Win rate" value={formatWinRate(profile.played, pct)} color={C.accent} />
      </View>

      {profile.clubs.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Club ratings</Text>
          {profile.clubs.map((c) => (
            <View key={c.club} style={s.clubRow}>
              <Text style={s.clubName} numberOfLines={1}>{c.club}</Text>
              <Text style={s.clubRank}>#{c.rank}</Text>
              <Text style={s.clubRating}>{c.rating}</Text>
            </View>
          ))}
        </View>
      )}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Get CourtSide"
        style={s.cta}
        onPress={() => router.push("/guest")}
      >
        <Icon name="badminton" color={C.text} size={20} />
        <Text style={s.ctaText}>Score your own matches</Text>
      </PressableScale>
    </ScrollView>
  );
}

function Stat({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { padding: 20, gap: 16 },
  center: { alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  notFound: { color: C.text, fontFamily: F.display, fontSize: 20, marginTop: 6 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14, textAlign: "center", lineHeight: 20 },
  hero: { alignItems: "center", gap: 6 },
  name: { color: C.text, fontFamily: F.display, fontSize: 26, marginTop: 6 },
  handle: { color: C.text2, fontFamily: F.body, fontSize: 14 },
  statRow: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1, backgroundColor: C.card, borderRadius: radius.md, paddingVertical: 14,
    alignItems: "center", gap: 4,
  },
  statValue: { fontFamily: F.display, fontSize: 24 },
  statLabel: { color: C.text2, fontFamily: F.medium, fontSize: 12, letterSpacing: 0.3 },
  card: { backgroundColor: C.card, borderRadius: radius.md, padding: 16, gap: 8 },
  cardTitle: { color: C.text, fontFamily: F.semibold, fontSize: 14, marginBottom: 2 },
  clubRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 },
  clubName: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 15 },
  clubRank: { color: C.text2, fontFamily: F.medium, fontSize: 13 },
  clubRating: { color: C.accent, fontFamily: F.bold, fontSize: 16, fontVariant: ["tabular-nums"] },
  cta: {
    flexDirection: "row", gap: 10, minHeight: MIN_TOUCH, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", backgroundColor: C.red, marginTop: 4,
  },
  ctaText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
});
