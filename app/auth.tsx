import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Logo from "../src/components/Logo";
import { C, F } from "../src/theme";

/**
 * Landing route for `Linking.createURL("auth")` — the redirect Supabase sends
 * email-confirmation, password-recovery and OAuth links back to.
 *
 * Nothing here completes the sign-in: SessionProvider catches the same URL off
 * the Linking listener and exchanges the token, and Gate replaces this screen
 * once a session exists. This file exists only so the router has somewhere to
 * land in the meantime. Without it expo-router had no `/auth` route and showed
 * its "Unmatched Route" error page for the whole exchange — and permanently
 * when the URL arrived with its token stripped, since Gate's signed-out branch
 * deliberately leaves auth routes alone.
 */
export default function AuthCallback() {
  return (
    <View style={s.root}>
      <Logo size={44} />
      <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} />
      <Text style={s.sub}>Signing you in…</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  sub: { color: C.text2, fontFamily: F.body, fontSize: 15, textAlign: "center", lineHeight: 22 },
});
