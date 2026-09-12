import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { parseJoinTarget, joinRouteFor } from "../../src/lib/joinLink";
import { toast } from "../../src/lib/toast";
import FormScreen from "../../src/components/FormScreen";
import PressableScale from "../../src/components/PressableScale";
import { useScreenInsets } from "../../src/hooks/useScreenInsets";
import { C, F } from "../../src/theme";

export default function GuestSpectate() {
  const router = useRouter();
  const { ctaPadding } = useScreenInsets();
  const [input, setInput] = useState("");

  const go = () => {
    const target = parseJoinTarget(input.trim());
    if (!target || target.kind !== "tournament") {
      toast("Couldn't find a tournament there. Check the link and try again.", "error");
      return;
    }
    router.push(joinRouteFor({ ...target, role: "spectator" }));
  };

  return (
    <FormScreen contentContainerStyle={[s.scroll, { paddingBottom: ctaPadding }]}>
      <Stack.Screen options={{ title: "Spectate" }} />
      <View style={s.hero}>
        <Text style={s.eyebrow}>SPECTATE</Text>
        <Text style={s.headline}>Watch a tournament</Text>
        <Text style={s.sub}>Paste the share link or tournament id someone sent you.</Text>
      </View>

      <TextInput
        style={s.input}
        placeholder="Link or tournament id"
        placeholderTextColor={C.text3}
        autoCapitalize="none"
        autoCorrect={false}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={go}
        returnKeyType="go"
      />

      <PressableScale accessibilityRole="button" style={[s.cta, !input.trim() && s.off]} disabled={!input.trim()} onPress={go}>
        <Text style={s.ctaText}>Watch</Text>
      </PressableScale>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 16 },
  hero: { gap: 8, marginBottom: 4 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  headline: { color: C.text, fontFamily: F.display, fontSize: 22 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14.5, lineHeight: 21 },
  input: {
    backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, fontFamily: F.body,
  },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
});
