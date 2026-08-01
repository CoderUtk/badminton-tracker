import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Club, createClub, createLocalClub, joinClub, listClubs, refreshClubs } from "../../src/repos/clubRepo";
import { LinearGradient } from "expo-linear-gradient";
import { useSession } from "../../src/stores/session";
import { DISPLAY_NAME_KEY, getSetting } from "../../src/repos/settingsRepo";
import { toast } from "../../src/lib/toast";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import { C, F, GRAD, glow, press } from "../../src/theme";

export default function Home() {
  const router = useRouter();
  const { offlineOnly, session } = useSession();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);

  const authName = session?.user.user_metadata?.full_name ?? session?.user.email ?? null;
  const greetName = authName ?? displayName ?? "Player";

  const reload = useCallback(() => {
    listClubs().then(setClubs);
    void refreshClubs().then(() => listClubs().then(setClubs));
    void getSetting(DISPLAY_NAME_KEY).then(setDisplayName);
  }, []);
  useFocusEffect(reload);

  const onCreate = async () => {
    try {
      await (offlineOnly ? createLocalClub(name) : createClub(name));
      setName("");
      reload();
    } catch (e) {
      toast((e as Error).message || "Could not create club", "error");
    }
  };
  const onJoin = async () => {
    try {
      await joinClub(inviteCode);
      setInviteCode("");
      reload();
    } catch (e) {
      toast((e as Error).message || "Could not join club", "error");
    }
  };

  return (
    <View style={s.root}>
      <View style={s.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greetEyebrow}>WELCOME BACK</Text>
          <Text style={s.greetName} numberOfLines={1}>{greetName}</Text>
        </View>
        <Logo size={34} showWordmark={false} />
      </View>
      <Pressable style={({ pressed }) => [s.ctaWrap, pressed && press]} onPress={() => router.push("/new-match")}>
        <LinearGradient colors={GRAD.redCTA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
          <Icon name="play" color={C.text} size={22} />
          <Text style={s.ctaText}>START A MATCH</Text>
        </LinearGradient>
      </Pressable>

      <View style={s.row}>
        <Pressable style={({ pressed }) => [s.navPill, pressed && press]} onPress={() => router.push("/watch")}>
          <Icon name="play" color={C.accent} size={18} />
          <Text style={s.navPillText}>Watch live matches</Text>
        </Pressable>
      </View>

      <Text style={s.h}>Your clubs</Text>
      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          <Text style={s.empty}>No clubs yet. Create one below{offlineOnly ? "" : " or join with an invite code"}.</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [s.club, pressed && press]} onPress={() => router.push(`/(app)/clubs/${item.id}`)}>
            <View style={s.clubIcon}>
              <Icon name="account-group" color={C.red} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.clubName}>{item.name}</Text>
              <Text style={s.clubMeta}>
                {item.role ?? "member"}
                {item.invite_code ? ` · code ${item.invite_code}` : ""}
              </Text>
            </View>
            <Icon name="chevron-forward" color={C.text2} size={20} />
          </Pressable>
        )}
      />

      <View style={s.forms}>
        <View style={s.row}>
          <TextInput
            style={s.input} placeholder="New club name" placeholderTextColor={C.text2}
            value={name} onChangeText={setName}
          />
          <Pressable style={({ pressed }) => [s.btn, pressed && press, !name.trim() && s.btnOff]} disabled={!name.trim()} onPress={onCreate}>
            <Icon name="add" color={C.text} size={18} />
            <Text style={s.btnText}>Create</Text>
          </Pressable>
        </View>
        {!offlineOnly && (
          <View style={s.row}>
            <TextInput
              style={s.input} placeholder="Invite code" placeholderTextColor={C.text2}
              autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode}
            />
            <Pressable style={({ pressed }) => [s.btn, pressed && press, !inviteCode.trim() && s.btnOff]} disabled={!inviteCode.trim()} onPress={onJoin}>
              <Text style={s.btnText}>Join</Text>
            </Pressable>
          </View>
        )}
        {offlineOnly && (
          <Text style={s.note}>Offline mode — clubs stay on this device. Sign-in and sharing come with accounts.</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  greetRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2, marginBottom: 2 },
  greetEyebrow: { color: C.text3, fontSize: 11, fontFamily: F.medium, letterSpacing: 1.5 },
  greetName: { color: C.text, fontSize: 24, fontFamily: F.display, letterSpacing: 0.5 },
  ctaWrap: { borderRadius: 16, ...glow(C.red, 18, 0.5) },
  cta: { flexDirection: "row", gap: 10, borderRadius: 16, minHeight: 62, alignItems: "center", justifyContent: "center" },
  ctaText: { color: C.text, fontSize: 19, fontFamily: F.display, letterSpacing: 1 },
  navPill: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingVertical: 12 },
  navPillText: { color: C.text, fontSize: 15, fontFamily: F.semibold },
  h: { color: C.text, fontSize: 17, fontFamily: F.bold, letterSpacing: 0.4, marginTop: 6 },
  empty: { color: C.text2, fontSize: 15, paddingVertical: 12 },
  club: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  clubIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center" },
  clubName: { color: C.text, fontSize: 17, fontWeight: "700" },
  clubMeta: { color: C.text2, fontSize: 13, marginTop: 2 },
  forms: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1, backgroundColor: C.card, color: C.text, borderRadius: 12,
    borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16,
  },
  btn: { flexDirection: "row", gap: 4, backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  btnOff: { opacity: 0.5 },
  btnText: { color: C.text, fontSize: 16, fontWeight: "700" },
  note: { color: C.text2, fontSize: 13, lineHeight: 19, marginTop: 2 },
});
