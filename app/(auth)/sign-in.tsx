import React, { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import { toast } from "../../src/lib/toast";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import PressableScale from "../../src/components/PressableScale";
import { C, F, GRAD, glow } from "../../src/theme";

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) toast(error.message || "Could not send code", "error");
    else { setCodeSent(true); toast(`Code sent to ${email.trim()}`, "success"); }
  };

  const verifyCode = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) toast(error.message || "Sign-in failed", "error");
  };

  const googleSignIn = async () => {
    if (!supabase) return;
    const redirectTo = Linking.createURL("auth");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      toast(error?.message ?? "Google sign-in unavailable", "error");
      return;
    }
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type === "success") {
      const params = new URL(res.url.replace("#", "?")).searchParams;
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
      }
    }
  };

  // Online-only build: without keys the app cannot authenticate at all.
  if (!supabase) {
    return (
      <View style={[s.root, s.center]}>
        <Logo size={44} />
        <Text style={s.errTitle}>Not configured</Text>
        <Text style={s.sub}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart.
        </Text>
      </View>
    );
  }

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={s.hero}>
          <Logo size={52} />
          <Text style={s.eyebrow}>BADMINTON CLUB</Text>
          <Text style={s.headline}>Score. Compete.{"\n"}Keep the record.</Text>
        </View>

        {/* Auth card */}
        <View style={s.card}>
          {!codeSent ? (
            <>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={C.text3}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={() => emailValid && !busy && sendCode()}
                returnKeyType="go"
              />
              <PressableScale
                style={[s.ctaWrap, (!emailValid || busy) && s.off]}
                disabled={!emailValid || busy}
                onPress={sendCode}
              >
                <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
                  <Text style={s.ctaText}>{busy ? "SENDING…" : "SEND SIGN-IN CODE"}</Text>
                </LinearGradient>
              </PressableScale>
              <Text style={s.hint}>No password. We email you a 6-digit code.</Text>
            </>
          ) : (
            <>
              <Text style={s.label}>6-digit code</Text>
              <Text style={s.sentTo} numberOfLines={1}>sent to {email.trim()}</Text>
              <TextInput
                style={[s.input, s.codeInput]}
                placeholder="123456"
                placeholderTextColor={C.text3}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                value={code}
                onChangeText={setCode}
                onSubmitEditing={() => code.trim().length === 6 && !busy && verifyCode()}
              />
              <PressableScale
                style={[s.ctaWrap, (code.trim().length < 6 || busy) && s.off]}
                disabled={code.trim().length < 6 || busy}
                onPress={verifyCode}
              >
                <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
                  <Text style={s.ctaText}>{busy ? "VERIFYING…" : "VERIFY & SIGN IN"}</Text>
                </LinearGradient>
              </PressableScale>
              <Pressable onPress={() => { setCodeSent(false); setCode(""); }} hitSlop={8}>
                <Text style={s.link}>Use a different email</Text>
              </Pressable>
            </>
          )}

          <View style={s.dividerRow}>
            <View style={s.rule} />
            <Text style={s.dividerText}>OR</Text>
            <View style={s.rule} />
          </View>

          <PressableScale style={s.google} onPress={googleSignIn}>
            <Icon name="person" color={C.text} size={18} />
            <Text style={s.googleText}>Continue with Google</Text>
          </PressableScale>
        </View>

        <Text style={s.legal}>By continuing you agree to keep it friendly on court.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 22, gap: 22 },
  center: { alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },

  hero: { alignItems: "center", gap: 10 },
  eyebrow: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 2.4 },
  headline: {
    color: C.text, fontFamily: F.display, fontSize: 27, lineHeight: 34,
    textAlign: "center", letterSpacing: 0.2,
  },

  card: {
    backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line,
    padding: 20, gap: 10,
  },
  label: { color: C.text, fontFamily: F.semibold, fontSize: 13, letterSpacing: 0.4 },
  sentTo: { color: C.text2, fontFamily: F.body, fontSize: 13, marginTop: -6 },
  input: {
    backgroundColor: C.bgElev, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, paddingHorizontal: 14, paddingVertical: 14, fontSize: 17, fontFamily: F.body,
  },
  codeInput: {
    fontFamily: F.display, fontSize: 26, letterSpacing: 8, textAlign: "center",
    fontVariant: ["tabular-nums"],
  },

  ctaWrap: { borderRadius: 14, marginTop: 4, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
  hint: { color: C.text3, fontFamily: F.body, fontSize: 12.5, textAlign: "center", marginTop: 2 },
  link: { color: C.accent, fontFamily: F.medium, textAlign: "center", fontSize: 14, paddingVertical: 6 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.lineHi },
  dividerText: { color: C.text3, fontFamily: F.medium, fontSize: 11, letterSpacing: 1.5 },

  google: {
    flexDirection: "row", gap: 10, backgroundColor: C.cardHi, borderRadius: 14,
    borderWidth: 1, borderColor: C.lineHi, minHeight: 52,
    alignItems: "center", justifyContent: "center",
  },
  googleText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },

  errTitle: { color: C.red, fontFamily: F.display, fontSize: 20, marginTop: 4 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 15, textAlign: "center", lineHeight: 22 },
  legal: { color: C.text3, fontFamily: F.body, fontSize: 12, textAlign: "center" },
});
