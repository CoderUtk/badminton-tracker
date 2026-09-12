import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../../src/lib/supabase";
import { toast } from "../../src/lib/toast";
import { useSession } from "../../src/stores/session";
import GoogleMark from "../../src/components/GoogleMark";
import Logo from "../../src/components/Logo";
import FormScreen from "../../src/components/FormScreen";
import PressableScale from "../../src/components/PressableScale";
import BusyButton from "../../src/components/BusyButton";
import { C, F, GRAD, glow } from "../../src/theme";

WebBrowser.maybeCompleteAuthSession();

/** Served from public/privacy.html by the same Vercel deployment as the PWA. */
const PRIVACY_URL = "https://courtside-links.vercel.app/privacy";

export default function SignIn() {
  const { completingAuth, handleAuthCallback, beginAuthAttempt, cancelAuthAttempt } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Password is the primary path (also the one Play Store review needs a
  // reusable credential for); Google is the secondary option below it.
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);

  const passwordSignIn = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) toast(error.message || "Sign-in failed", "error");
  };

  const passwordSignUp = async () => {
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: Linking.createURL("auth") },
    });
    setBusy(false);
    if (error) { toast(error.message || "Could not create account", "error"); return; }

    // When an account with this email already exists (e.g., via Google OAuth),
    // Supabase returns a user with an empty identities array and no session.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      toast("An account with this email already exists. Try signing in or use Google.", "error");
      return;
    }

    // Confirm-email is on for this project, so a fresh signUp has no session
    // yet — the trigger that creates the profile/personal club runs on
    // confirmation, not on signUp itself.
    if (!data.session) toast(`Check ${email.trim()} to confirm your account`, "success");
  };

  const sendPasswordReset = async () => {
    if (!supabase) return;
    const addr = email.trim();
    if (!/\S+@\S+\.\S+/.test(addr)) {
      toast("Enter your email address first", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(addr, {
      redirectTo: Linking.createURL("auth"),
    });
    setBusy(false);
    // Always the same message: confirming whether an address has an account
    // here would leak account existence to anyone who can open the app.
    if (error) toast(error.message || "Could not send the reset email", "error");
    else toast(`If ${addr} has an account, a reset link is on its way`, "success");
  };

  const googleSignIn = async () => {
    if (!supabase) return;
    // Show the spinner from the moment of the tap, not from whenever the
    // callback happens to arrive later — closes the gap where the plain
    // sign-in form flashes for a moment on return from the browser.
    beginAuthAttempt();
    const redirectTo = Linking.createURL("auth");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      toast(error?.message ?? "Google sign-in unavailable", "error");
      cancelAuthAttempt();
      return;
    }
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // On Android the deep link reopens the app before this resolves, so this
    // is usually "dismiss" with no url — SessionProvider's own Linking
    // listener completes sign-in in that case. Handle "success" here too
    // (some platforms resolve this instead of firing the listener), routed
    // through the same handleAuthCallback so completingAuth stays centralized.
    if (res.type === "success") {
      handleAuthCallback(res.url);
    } else {
      // Not "success" — either a real cancel, or Android's redirect already
      // landed via the Linking listener. cancelAuthAttempt only clears the
      // spinner in the former case.
      cancelAuthAttempt();
    }
  };

  const continueAsGuest = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) toast(error.message || "Could not continue as guest", "error");
    // On success, Gate's session listener redirects to /guest automatically.
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
  // Sign-up promised "At least 6 characters" in the placeholder but accepted
  // one, so the rule was only enforced by a server round trip and a toast.
  const canSubmit = emailValid && password.length >= (isSignUp ? 6 : 1) && !busy;

  // Replaces the idle form for the gap between the OAuth browser closing and
  // Gate navigating home — that gap is a real network round trip, and an
  // interactive login form sitting there reads as "signed out again".
  if (completingAuth) {
    return (
      <View style={[s.root, s.center]}>
        <Logo size={44} />
        <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} />
        <Text style={s.sub}>Signing you in…</Text>
      </View>
    );
  }

  return (
    <FormScreen contentContainerStyle={s.scroll}>
        {/* Hero */}
        <View style={s.hero}>
          <Logo size={52} />
          <Text style={s.eyebrow}>BADMINTON CLUB</Text>
          <Text style={s.headline}>Score. Compete.{"\n"}Keep the record.</Text>
        </View>

        {/* Auth card */}
        <View style={s.card}>
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
            returnKeyType="next"
          />
          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder={isSignUp ? "At least 6 characters" : "Password"}
            placeholderTextColor={C.text3}
            secureTextEntry
            autoCapitalize="none"
            // Without these the OS keychain neither fills an existing password
            // nor offers to save a new one, which is half of why a forgotten
            // password used to be unrecoverable.
            autoComplete={isSignUp ? "new-password" : "current-password"}
            textContentType={isSignUp ? "newPassword" : "password"}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => canSubmit && (isSignUp ? passwordSignUp() : passwordSignIn())}
            returnKeyType="go"
          />
          <BusyButton
            busy={busy}
            disabled={!canSubmit}
            style={s.ctaWrap}
            onPress={isSignUp ? passwordSignUp : passwordSignIn}
          >
            <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
              <Text style={s.ctaText}>{isSignUp ? "CREATE ACCOUNT" : "SIGN IN"}</Text>
            </LinearGradient>
          </BusyButton>
          <Pressable onPress={() => setIsSignUp((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={s.link}>
              {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
            </Text>
          </Pressable>
          {!isSignUp && (
            <Pressable
              onPress={sendPasswordReset}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={[s.link, s.linkQuiet]}>Forgot password?</Text>
            </Pressable>
          )}

          <View style={s.dividerRow}>
            <View style={s.rule} />
            <Text style={s.dividerText}>OR</Text>
            <View style={s.rule} />
          </View>

          <PressableScale accessibilityRole="button" style={s.google} onPress={googleSignIn}>
            <GoogleMark size={18} />
            <Text style={s.googleText}>Continue with Google</Text>
          </PressableScale>

          <Pressable accessibilityRole="button" onPress={continueAsGuest} disabled={busy} hitSlop={8} style={{ marginTop: 4 }}>
            <Text style={s.link}>Continue as guest</Text>
          </Pressable>
        </View>

        {/* Was a placeholder joke sitting exactly where the policy link belongs.
            Play and the PWA both require a reachable privacy policy at the point
            of account creation, and public/privacy.html was already deployed and
            simply unlinked from the app. No terms page exists yet, so this
            promises only what there is. */}
        <Text style={s.legal}>
          By continuing you agree to our{" "}
          <Text
            style={s.legalLink}
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
          >
            Privacy Policy
          </Text>
          .
        </Text>
    </FormScreen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
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
  input: {
    backgroundColor: C.bgElev, color: C.text, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, paddingHorizontal: 14, paddingVertical: 14, fontSize: 17, fontFamily: F.body,
  },

  ctaWrap: { borderRadius: 14, marginTop: 4, ...glow(C.red, 16, 0.45) },
  cta: { borderRadius: 14, minHeight: 54, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontFamily: F.display, fontSize: 15, letterSpacing: 1.2 },
  off: { opacity: 0.45 },
  link: { color: C.accent, fontFamily: F.medium, textAlign: "center", fontSize: 14, paddingVertical: 6 },
  // Recovery is a secondary path — same target size, quieter than the primary
  // "create an account" link directly above it.
  linkQuiet: { color: C.text2, fontSize: 13 },

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
  legalLink: { color: C.accent, textDecorationLine: "underline" },
});
