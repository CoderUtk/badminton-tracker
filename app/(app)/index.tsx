import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Club, createClub, joinClub, listClubs, refreshClubs } from "../../src/repos/clubRepo";
import { LinearGradient } from "expo-linear-gradient";
import { useSession } from "../../src/stores/session";
import { getMyProfile } from "../../src/repos/profileRepo";
import { toast } from "../../src/lib/toast";
import { validateName } from "../../src/lib/validate";
import Icon from "../../src/components/Icon";
import Logo from "../../src/components/Logo";
import { C, F, GRAD, glow, press } from "../../src/theme";

export default function Home() {
  const router = useRouter();
  const { session } = useSession();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const nameError = validateName(name, "Club name");

  const emailPrefix = session?.user.email?.split("@")[0] ?? null;
  const greetName = displayName || emailPrefix || "Player";

  const reload = useCallback(() => {
    listClubs().then(setClubs);
    void refreshClubs().then(() => listClubs().then(setClubs));
    void getMyProfile().then((p) => setDisplayName(p?.displayName ?? null));
  }, []);
  useFocusEffect(reload);

  const onCreate = async () => {
    if (nameError) { toast(nameError, "error"); return; }
    try {
      await createClub(name.trim());
      setName("");
      setNameTouched(false);
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
    // The club/invite forms live in the list footer rather than below it: one
    // scrollable surface lets RN scroll the focused input into view, which with
    // android.softwareKeyboardLayoutMode "resize" keeps it above the keyboard.
    // A KeyboardAvoidingView here was a no-op — behavior is undefined on Android.
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

      <Text style={s.h}>Your clubs</Text>
      <FlatList
        data={clubs}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={s.empty}>No clubs yet. Create one below or join with an invite code.</Text>
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
        ListFooterComponent={
          <View style={s.forms}>
            <View style={s.row}>
              <TextInput
                style={s.input} placeholder="New club name" placeholderTextColor={C.text2}
                value={name} onChangeText={setName} onBlur={() => setNameTouched(true)}
              />
              <Pressable style={({ pressed }) => [s.btn, pressed && press, !!nameError && s.btnOff]} disabled={!!nameError} onPress={onCreate}>
                <Icon name="add" color={C.text} size={18} />
                <Text style={s.btnText}>Create</Text>
              </Pressable>
            </View>
            {nameTouched && nameError ? <Text style={s.err}>{nameError}</Text> : null}
            <View style={s.row}>
              <TextInput
                style={s.input} placeholder="Invite code" placeholderTextColor={C.text2}
                autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode}
              />
              <Pressable style={({ pressed }) => [s.btn, pressed && press, !inviteCode.trim() && s.btnOff]} disabled={!inviteCode.trim()} onPress={onJoin}>
                <Text style={s.btnText}>Join</Text>
              </Pressable>
            </View>
          </View>
        }
      />
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
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body },
  note: { color: C.text2, fontSize: 13, lineHeight: 19, marginTop: 2 },
});
