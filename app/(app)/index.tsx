import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Club, createClub, joinClub, listClubs, refreshClubs } from "../../src/repos/clubRepo";
import { useSession } from "../../src/stores/session";
import { C } from "../../src/theme";

export default function Home() {
  const router = useRouter();
  const { offlineOnly } = useSession();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const reload = useCallback(() => {
    listClubs().then(setClubs);
    void refreshClubs().then(() => listClubs().then(setClubs));
  }, []);
  useFocusEffect(reload);

  const onCreate = async () => {
    try {
      await createClub(name);
      setName("");
      reload();
    } catch (e) {
      Alert.alert("Could not create club", (e as Error).message);
    }
  };
  const onJoin = async () => {
    try {
      await joinClub(inviteCode);
      setInviteCode("");
      reload();
    } catch (e) {
      Alert.alert("Could not join club", (e as Error).message);
    }
  };

  return (
    <View style={s.root}>
      <Pressable style={s.cta} onPress={() => router.push("/new-match")}>
        <Text style={s.ctaText}>▶  Start a match</Text>
      </Pressable>

      <Text style={s.h}>Your clubs</Text>
      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          <Text style={s.empty}>
            {offlineOnly
              ? "Offline mode — clubs need an account and Supabase setup."
              : "No clubs yet. Create one below or join with an invite code."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={s.club} onPress={() => router.push(`/(app)/clubs/${item.id}`)}>
            <View style={s.clubRow}>
              <Text style={s.clubName}>{item.name}</Text>
              <Text style={s.clubStats}>Stats ›</Text>
            </View>
            <Text style={s.clubMeta}>
              {item.role ?? "member"}
              {item.invite_code ? ` · invite code ${item.invite_code}` : ""}
            </Text>
          </Pressable>
        )}
      />

      {!offlineOnly && (
        <View style={s.forms}>
          <View style={s.row}>
            <TextInput
              style={s.input} placeholder="New club name" placeholderTextColor={C.text2}
              value={name} onChangeText={setName}
            />
            <Pressable style={s.btn} disabled={!name.trim()} onPress={onCreate}>
              <Text style={s.btnText}>Create</Text>
            </Pressable>
          </View>
          <View style={s.row}>
            <TextInput
              style={s.input} placeholder="Invite code" placeholderTextColor={C.text2}
              autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode}
            />
            <Pressable style={s.btn} disabled={!inviteCode.trim()} onPress={onJoin}>
              <Text style={s.btnText}>Join</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  cta: { backgroundColor: C.red, borderRadius: 14, minHeight: 60, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontSize: 20, fontWeight: "800" },
  h: { color: C.text, fontSize: 18, fontWeight: "700", marginTop: 6 },
  empty: { color: C.text2, fontSize: 15, paddingVertical: 12 },
  club: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  clubRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clubName: { color: C.text, fontSize: 17, fontWeight: "600" },
  clubStats: { color: C.red, fontSize: 14, fontWeight: "800" },
  clubMeta: { color: C.text2, fontSize: 13, marginTop: 2 },
  forms: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 12,
    borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16,
  },
  btn: { backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  btnText: { color: C.text, fontSize: 16, fontWeight: "600" },
});
