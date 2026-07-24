import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/stores/session";
import { C } from "../../src/theme";

export default function Profile() {
  const { session, offlineOnly } = useSession();

  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.name}>
          {session?.user.user_metadata?.full_name ?? session?.user.email ?? "Offline player"}
        </Text>
        <Text style={s.meta}>
          {offlineOnly
            ? "Offline mode — sign-in disabled until Supabase keys are configured."
            : session?.user.email ?? ""}
        </Text>
      </View>
      {session && (
        <Pressable style={s.btn} onPress={() => supabase?.auth.signOut()}>
          <Text style={s.btnText}>Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, gap: 4 },
  name: { color: C.text, fontSize: 20, fontWeight: "700" },
  meta: { color: C.text2, fontSize: 14 },
  btn: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    minHeight: 52, alignItems: "center", justifyContent: "center",
  },
  btnText: { color: C.red, fontSize: 16, fontWeight: "600" },
});
