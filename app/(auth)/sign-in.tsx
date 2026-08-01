import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { toast } from "../../src/lib/toast";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import Icon from "../../src/components/Icon";
import { C } from "../../src/theme";

function Brand() {
  return (
    <View style={s.brand}>
      <Icon name="badminton" color={C.red} size={30} />
      <Text style={s.title}>CourtSide</Text>
    </View>
  );
}

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
    else setCodeSent(true);
  };

  const verifyCode = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
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

  if (!supabase) {
    return (
      <View style={s.root}>
        <Brand />
        <Text style={s.sub}>
          Running offline — scoring and local history work without an account.
          To enable clubs and sync, add Supabase keys to .env and restart.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Brand />
      {!codeSent ? (
        <>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={C.text2}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={s.btn} disabled={busy || !email.includes("@")} onPress={sendCode}>
            <Text style={s.btnText}>{busy ? "Sending…" : "Send sign-in code"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={s.sub}>Enter the 6-digit code sent to {email.trim()}</Text>
          <TextInput
            style={s.input}
            placeholder="123456"
            placeholderTextColor={C.text2}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Pressable style={s.btn} disabled={busy || code.trim().length < 6} onPress={verifyCode}>
            <Text style={s.btnText}>{busy ? "Verifying…" : "Verify and sign in"}</Text>
          </Pressable>
          <Pressable onPress={() => setCodeSent(false)}>
            <Text style={s.link}>Use a different email</Text>
          </Pressable>
        </>
      )}
      <View style={s.divider} />
      <Pressable style={[s.btn, s.google]} onPress={googleSignIn}>
        <Text style={s.btnText}>Continue with Google</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 24, gap: 14 },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 },
  title: { color: C.text, fontSize: 28, fontWeight: "800", textAlign: "center" },
  sub: { color: C.text2, fontSize: 15, textAlign: "center" },
  input: {
    backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, padding: 14, fontSize: 17,
  },
  btn: {
    backgroundColor: C.red, borderRadius: 12, minHeight: 52,
    alignItems: "center", justifyContent: "center",
  },
  google: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  btnText: { color: C.text, fontSize: 17, fontWeight: "600" },
  link: { color: C.blue, textAlign: "center", fontSize: 15, padding: 6 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 6 },
});
