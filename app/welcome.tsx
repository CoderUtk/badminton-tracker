import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { completeOnboarding, getMyProfile, type Hand } from "../src/repos/profileRepo";
import { validateName } from "../src/lib/validate";
import { toast } from "../src/lib/toast";
import { consumePendingLink } from "../src/lib/pendingLink";
import { joinRouteFor, parseJoinTarget } from "../src/lib/joinLink";
import FormScreen from "../src/components/FormScreen";
import Logo from "../src/components/Logo";
import PressableScale from "../src/components/PressableScale";
import { useScreenInsets } from "../src/hooks/useScreenInsets";
import { C, F, GRAD, glow } from "../src/theme";

/**
 * Blocking first-run screen: every account picks a display name before entering
 * the app. Seeded with whatever the signup trigger guessed, so Continue is
 * usually a single tap.
 */
export default function Welcome() {
  const router = useRouter();
  const { ctaPadding } = useScreenInsets();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState("");
  const [hand, setHand] = useState<Hand | null>(null);
  
  // Fluid entrance animation for hero content
  const heroOpacity = useSharedValue(0);
  const heroY = useSharedValue(20);
  
  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroY.value }],
  }));

  useEffect(() => {
    void getMyProfile().then((p) => { if (p?.displayName) setName(p.displayName); });
    
    // Staggered entrance: hero first, card follows
    heroOpacity.value = withTiming(1, { duration: 600 });
    heroY.value = withSpring(0, { dampingRatio: 0.86, duration: 500 });
  }, []);

  const error = validateName(name, "Display name", { requireLetter: true });

  const onContinue = async () => {
    if (error) { setTouched(true); toast(error, "error"); return; }
    if (!hand) { toast("Choose your playing hand", "error"); return; }
    setBusy(true);
    try {
      const ageValue = age.trim() ? Number(age.trim()) : null;
      await completeOnboarding(name, ageValue, hand);
      // Gate may have re-parked a join destination while this profile lacked a
      // display name — honour it instead of always landing on home.
      const path = consumePendingLink();
      const target = path ? parseJoinTarget(path) : null;
      router.replace(target ? joinRouteFor(target) : "/");
    } catch (e) {
      toast((e as Error).message || "Could not save your name", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen contentContainerStyle={[s.scroll, { paddingBottom: ctaPadding }]}>
      <Animated.View style={[s.hero, heroStyle]}>
        <Logo size={52} />
        <Text style={s.eyebrow}>ONE LAST THING</Text>
        <Text style={s.headline}>What should we{"\n"}call you?</Text>
        <Text style={s.sub}>This is the name your club sees on scoreboards.</Text>
      </Animated.View>

      <View style={s.card}>
        <Text style={s.label}>Display name</Text>
        <TextInput
          style={s.input}
          placeholder="Your name"
          placeholderTextColor={C.text3}
          value={name}
          onChangeText={setName}
          onBlur={() => setTouched(true)}
          onSubmitEditing={() => { if (!error && !busy) void onContinue(); }}
          returnKeyType="done"
          autoFocus
          maxLength={60}
        />
        {touched && error ? <Text style={s.err}>{error}</Text> : null}

        <Text style={[s.label, { marginTop: 4 }]}>Age (optional)</Text>
        <TextInput
          style={s.input}
          placeholder="Your age"
          placeholderTextColor={C.text3}
          keyboardType="number-pad"
          maxLength={3}
          value={age}
          onChangeText={setAge}
          returnKeyType="done"
        />

        <Text style={[s.label, { marginTop: 4 }]}>Playing hand</Text>
        <View style={s.handRow}>
          {(["left", "right"] as Hand[]).map((h) => (
            <PressableScale 
              key={h} 
              style={[s.handChip, hand === h && s.handChipOn]} 
              onPress={() => setHand(h)}
              scaleTo={0.96}
            >
              <Text style={[s.handChipText, hand === h && s.handChipTextOn]}>{h === "left" ? "Left" : "Right"}</Text>
            </PressableScale>
          ))}
        </View>

        <PressableScale
          style={[s.ctaWrap, (!!error || !hand || busy) && s.off]}
          disabled={!!error || !hand || busy}
          onPress={onContinue}
        >
          <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
            <Text style={s.ctaText}>{busy ? "SAVING…" : "CONTINUE"}</Text>
          </LinearGradient>
        </PressableScale>
      </View>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 22 },
  hero: { alignItems: "center", gap: 10 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  headline: {
    color: C.text, fontFamily: F.display, fontSize: 27, lineHeight: 34,
    textAlign: "center", letterSpacing: 0.2,
  },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
  card: {
    backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line,
    padding: 20, gap: 10,
  },
  label: { color: C.text, fontFamily: F.semibold, fontSize: 13, letterSpacing: 0.4 },
  input: {
    backgroundColor: C.bgElev, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, paddingHorizontal: 14, paddingVertical: 14, fontSize: 17, fontFamily: F.body,
  },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
  ctaWrap: { borderRadius: 14, marginTop: 4, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
  handRow: { flexDirection: "row", gap: 8 },
  handChip: { flex: 1, backgroundColor: C.bgElev, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingVertical: 14, alignItems: "center" },
  handChipOn: { backgroundColor: C.cardHi, borderColor: C.lineHi },
  handChipText: { color: C.text2, fontFamily: F.semibold, fontSize: 15 },
  handChipTextOn: { color: C.text },
});
