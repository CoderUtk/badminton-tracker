import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Icon, { type IconName } from "../src/components/Icon";
import Logo from "../src/components/Logo";
import { ONBOARDING_SEEN_KEY, setSetting } from "../src/repos/settingsRepo";
import { C, F, glow } from "../src/theme";

const CARDS: { icon: IconName; title: string; body: string }[] = [
  { icon: "play", title: "Score in seconds", body: "Tap +1 for each rally. Full-screen, umpire-accurate scoring with undo and live serve calls." },
  { icon: "calendar", title: "Run sessions", body: "Plan a club session, check players in, and auto-generate fair rotating matchups." },
  { icon: "trophy", title: "Host tournaments", body: "Singles or doubles brackets up to 64 players. Winners advance automatically to a champion." },
  { icon: "badminton", title: "Watch & track", body: "Follow live matches, review every result, and see your stats and achievements on Profile." },
];

export default function Onboarding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);

  const finish = () => { void setSetting(ONBOARDING_SEEN_KEY, "1"); router.replace("/"); };
  const next = () => {
    if (page >= CARDS.length - 1) return finish();
    ref.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={s.root}>
      <View style={s.top}>
        <Logo size={30} />
        <Pressable onPress={finish} hitSlop={12}><Text style={s.skip}>Skip</Text></Pressable>
      </View>

      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {CARDS.map((c) => (
          <View key={c.title} style={[s.card, { width: width - 32 }]}>
            <View style={s.iconWrap}><Icon name={c.icon} color={C.red} size={54} /></View>
            <Text style={s.title}>{c.title}</Text>
            <Text style={s.body}>{c.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.dots}>
        {CARDS.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotOn]} />
        ))}
      </View>

      <Pressable style={s.cta} onPress={next}>
        <Text style={s.ctaText}>{page >= CARDS.length - 1 ? "Get started" : "Next"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  skip: { color: C.text2, fontFamily: F.medium, fontSize: 15 },
  card: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, gap: 16 },
  iconWrap: { width: 108, height: 108, borderRadius: 54, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center", ...glow(C.red, 20, 0.4) },
  title: { color: C.text, fontFamily: F.display, fontSize: 26, textAlign: "center", letterSpacing: 0.4 },
  body: { color: C.text2, fontFamily: F.body, fontSize: 16, lineHeight: 24, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.line },
  dotOn: { backgroundColor: C.red, width: 22 },
  cta: { backgroundColor: C.red, borderRadius: 14, paddingVertical: 16, alignItems: "center", ...glow(C.red, 16, 0.4) },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 17, letterSpacing: 0.5 },
});
