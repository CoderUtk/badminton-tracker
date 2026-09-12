import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import FormScreen from "../../src/components/FormScreen";
import PressableScale from "../../src/components/PressableScale";
import { upgradeGuestAccount, UPGRADE_CONFIRM_HINT } from "../../src/repos/guestUpgradeRepo";
import { GUEST_RETENTION_DAYS } from "../../src/lib/guestRetention";
import { toast } from "../../src/lib/toast";
import { C, F, MIN_TOUCH, radius } from "../../src/theme";

/**
 * Guest -> account, in place.
 *
 * Not a sign-up screen: it upgrades the anonymous session, which keeps the
 * same user id and therefore the match history. See guestUpgradeRepo.
 */
export default function SaveGuestAccount() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  // Matches the server's minimum and the promise in the placeholder below —
  // the sign-in screen's own rule, kept identical so one path cannot accept
  // what the other rejects.
  const canSubmit = emailValid && password.length >= 6 && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      await upgradeGuestAccount(email, password);
      toast(UPGRADE_CONFIRM_HINT);
      router.replace("/guest");
    } catch (e) {
      toast((e as Error).message || "Could not create the account", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Save my matches" }} />
      <View style={s.body}>
        <Text style={s.headline}>Keep your matches</Text>
        <Text style={s.sub}>
          Guest matches are deleted after {GUEST_RETENTION_DAYS} days. Add an email and
          password and everything you have scored stays — same history, same phone,
          plus clubs, sessions and stats.
        </Text>

        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={C.ghost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          accessibilityLabel="Email address"
        />
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={C.ghost}
          secureTextEntry
          autoCapitalize="none"
          textContentType="newPassword"
          autoComplete="new-password"
          accessibilityLabel="Password"
        />

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Create account and keep my matches"
          accessibilityState={{ disabled: !canSubmit }}
          style={[s.cta, !canSubmit && s.ctaOff]}
          disabled={!canSubmit}
          onPress={() => void submit()}
        >
          <Text style={s.ctaText}>{busy ? "Saving…" : "Save my matches"}</Text>
        </PressableScale>
      </View>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  body: { gap: 14, padding: 22 },
  headline: { color: C.text, fontFamily: F.display, fontSize: 24 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  input: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, paddingHorizontal: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    color: C.text, fontFamily: F.body, fontSize: 15,
  },
  cta: {
    minHeight: MIN_TOUCH, borderRadius: radius.md, alignItems: "center",
    justifyContent: "center", backgroundColor: C.red, marginTop: 6,
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
});
