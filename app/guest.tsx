import React from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { clearGuestMatchIds } from "../src/lib/guestMatches";
import { clearLastLineup } from "../src/lib/lastLineup";
import Icon from "../src/components/Icon";
import Logo from "../src/components/Logo";
import PressableScale from "../src/components/PressableScale";
import { C, F } from "../src/theme";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.navalo.courtside";

export default function GuestHome() {
  const router = useRouter();

  const signIn = async () => {
    if (Platform.OS === "web") {
      void Linking.openURL(PLAY_STORE_URL);
      return;
    }
    await clearGuestMatchIds();
    await clearLastLineup();
    await supabase?.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Logo size={48} />
        <Text style={s.eyebrow}>GUEST</Text>
        <Text style={s.headline}>Play now,{"\n"}no account needed</Text>
      </View>

      <PressableScale style={s.card} onPress={() => router.push("/new-match")}>
        <Icon name="play" color={C.red} size={28} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>Quick match</Text>
          <Text style={s.cardSub}>Score a match now. Saved on this phone only.</Text>
        </View>
        <Icon name="chevron-forward" color={C.text2} size={20} />
      </PressableScale>

      <PressableScale style={s.card} onPress={() => router.push("/guest/spectate")}>
        <Icon name="trophy-outline" color={C.accent} size={28} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>Spectate a tournament</Text>
          <Text style={s.cardSub}>Paste a link or tournament id to watch live.</Text>
        </View>
        <Icon name="chevron-forward" color={C.text2} size={20} />
      </PressableScale>

      <PressableScale style={s.card} onPress={() => router.push("/guest/matches")}>
        <Icon name="time-outline" color={C.text2} size={28} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>My matches</Text>
          <Text style={s.cardSub}>Quick matches you've scored this session.</Text>
        </View>
        <Icon name="chevron-forward" color={C.text2} size={20} />
      </PressableScale>

      <PressableScale style={s.signIn} onPress={signIn}>
        <Text style={s.signInText}>
          {Platform.OS === "web"
            ? "Get the app for clubs, tournaments, and more"
            : "Sign in for clubs, tournaments, and more"}
        </Text>
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 22, gap: 16, justifyContent: "center" },
  hero: { alignItems: "center", gap: 8, marginBottom: 12 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  headline: { color: C.text, fontFamily: F.display, fontSize: 24, lineHeight: 30, textAlign: "center" },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.card,
    borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16,
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  cardSub: { color: C.text2, fontFamily: F.body, fontSize: 13, lineHeight: 18 },
  signIn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  signInText: { color: C.accent, fontFamily: F.medium, fontSize: 14 },
});
