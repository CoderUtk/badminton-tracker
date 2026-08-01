import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/stores/session";
import { listAllPlayerNames } from "../../src/repos/clubRepo";
import { DISPLAY_NAME_KEY, getSetting, setSetting } from "../../src/repos/settingsRepo";
import { getPlayerAnalytics, type PlayerAnalytics } from "../../src/repos/statsRepo";
import Icon from "../../src/components/Icon";
import { C, F, glow } from "../../src/theme";

const DEFAULT_ME = "Utkarsh"; // dummy identity until sign-in lands

export default function Profile() {
  const { session, offlineOnly } = useSession();
  const router = useRouter();
  const authName = session?.user.user_metadata?.full_name ?? session?.user.email ?? null;

  const [names, setNames] = useState<string[]>([]);
  const [me, setMe] = useState<string>(authName ?? DEFAULT_ME);
  const [a, setA] = useState<PlayerAnalytics | null>(null);
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => { void getSetting(DISPLAY_NAME_KEY).then((v) => setDisplayName(v ?? "")); }, []);
  const saveDisplayName = () => { const v = displayName.trim(); if (v) void setSetting(DISPLAY_NAME_KEY, v); };

  useEffect(() => {
    void listAllPlayerNames().then((n) => {
      setNames(n);
      if (!authName) setMe((cur) => (n.includes(cur) ? cur : n.includes(DEFAULT_ME) ? DEFAULT_ME : n[0] ?? cur));
    });
  }, [authName]);

  const load = useCallback(() => { void getPlayerAnalytics(me).then(setA); }, [me]);
  useFocusEffect(load);
  useEffect(load, [load]);

  const initial = me.slice(0, 1).toUpperCase();

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      {/* Identity */}
      <View style={s.hero}>
        <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{me}</Text>
          <Text style={s.sub}>{offlineOnly ? "Local profile · dummy mode" : session?.user.email ?? ""}</Text>
        </View>
        <Icon name="badminton" color={C.red} size={30} />
      </View>

      {/* Display name (shown on Home; used when signed out) */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Display name</Text>
        <TextInput
          style={s.nameInput}
          placeholder="Your name"
          placeholderTextColor={C.text2}
          value={displayName}
          onChangeText={setDisplayName}
          onBlur={saveDisplayName}
          onSubmitEditing={saveDisplayName}
          returnKeyType="done"
        />
      </View>

      {/* Viewing-as picker (dummy mode only) */}
      {offlineOnly && names.length > 0 && (
        <View style={s.pickerWrap}>
          <Text style={s.pickerLbl}>Viewing as</Text>
          <View style={s.chips}>
            {names.map((n) => (
              <Pressable key={n} style={[s.chip, n === me && s.chipOn]} onPress={() => setMe(n)}>
                <Text style={[s.chipText, n === me && s.chipTextOn]}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Headline stats */}
      <View style={s.statGrid}>
        <Stat label="Played" value={a?.played ?? 0} />
        <Stat label="Won" value={a?.wins ?? 0} accent />
        <Stat label="Lost" value={a?.losses ?? 0} />
        <Stat label="Win %" value={`${a?.winPct ?? 0}%`} accent />
      </View>

      {a && a.played === 0 ? (
        <View style={s.emptyCard}>
          <Icon name="scoreboard-outline" color={C.text2} size={30} />
          <Text style={s.emptyText}>No completed matches for {me} yet.</Text>
          <Pressable style={s.startBtn} onPress={() => router.push("/new-match")}>
            <Icon name="play" color={C.text} size={16} />
            <Text style={s.startText}>Start a match</Text>
          </Pressable>
        </View>
      ) : (
        a && (
          <>
            {/* Recent form */}
            {a.form.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Recent form</Text>
                <View style={s.formRow}>
                  {a.form.map((r, i) => (
                    <View key={i} style={[s.formPill, r === "W" ? s.pillW : s.pillL]}>
                      <Text style={s.formPillText}>{r}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Secondary stats */}
            <View style={s.card}>
              <Row icon="scoreboard-outline" label="Games (W–L)" value={`${a.gamesWon}–${a.gamesLost}`} />
              <Row icon="trophy-outline" label="Points (for–against)" value={`${a.pointsFor}–${a.pointsAgainst}`} />
              {a.bestPartner && (
                <Row icon="account-group" label="Best partner" value={`${a.bestPartner.name} · ${a.bestPartner.wins}W`} />
              )}
              {a.toughestOpponent && (
                <Row icon="badminton" label="Toughest opponent" value={`${a.toughestOpponent.name} · ${a.toughestOpponent.losses}L`} last />
              )}
            </View>

            {/* Recent matches */}
            {a.recent.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Recent matches</Text>
                {a.recent.map((m) => (
                  <Pressable key={m.id} style={s.matchRow} onPress={() => router.push(`/matches/${m.id}`)}>
                    <View style={[s.resultBadge, m.result === "W" ? s.pillW : m.result === "L" ? s.pillL : s.pillN]}>
                      <Text style={[s.resultText, m.result === "—" && { color: C.text2 }]}>{m.result}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.matchOpp} numberOfLines={1}>
                        vs {m.opponents}{m.partner ? `  ·  w/ ${m.partner}` : ""}
                      </Text>
                      <Text style={s.matchMeta}>{m.summary || "—"}</Text>
                    </View>
                    <Icon name="chevron-forward" color={C.text2} size={18} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )
      )}

      {session && (
        <Pressable style={s.signOut} onPress={() => supabase?.auth.signOut()}>
          <Icon name="log-out-outline" color={C.red} size={18} />
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statNum, accent && { color: C.red }]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, value, last }: { icon: React.ComponentProps<typeof Icon>["name"]; label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.infoRow, !last && s.infoDivider]}>
      <Icon name={icon} color={C.text2} size={18} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.red, alignItems: "center", justifyContent: "center", ...glow(C.red, 12, 0.4) },
  avatarText: { color: C.text, fontSize: 24, fontFamily: F.display },
  name: { color: C.text, fontSize: 22, fontFamily: F.display, letterSpacing: 0.5 },
  sub: { color: C.text2, fontSize: 13, marginTop: 2, fontFamily: F.body },
  pickerWrap: { gap: 8 },
  pickerLbl: { color: C.text2, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.red, borderColor: C.red },
  chipText: { color: C.text2, fontWeight: "700" },
  chipTextOn: { color: C.text },
  statGrid: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: C.line },
  statNum: { color: C.text, fontSize: 24, fontFamily: F.display, fontVariant: ["tabular-nums"] },
  statLbl: { color: C.text2, fontSize: 11, fontFamily: F.medium, marginTop: 3, letterSpacing: 0.5 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 8 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  nameInput: { backgroundColor: C.bgElev, color: C.text, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 16 },
  formRow: { flexDirection: "row", gap: 6 },
  formPill: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pillW: { backgroundColor: C.green },
  pillL: { backgroundColor: C.red },
  pillN: { backgroundColor: C.cardHi },
  formPillText: { color: C.bg, fontWeight: "900", fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  infoDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  infoLabel: { flex: 1, color: C.text2, fontSize: 14, fontWeight: "600" },
  infoValue: { color: C.text, fontSize: 15, fontWeight: "800" },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  resultBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  resultText: { color: C.bg, fontWeight: "900", fontSize: 14 },
  matchOpp: { color: C.text, fontSize: 15, fontWeight: "700" },
  matchMeta: { color: C.text2, fontSize: 13, marginTop: 1, fontVariant: ["tabular-nums"] },
  emptyCard: { backgroundColor: C.card, borderRadius: 14, padding: 22, alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.line },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center" },
  startBtn: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 20, minHeight: 46, alignItems: "center", justifyContent: "center" },
  startText: { color: C.text, fontWeight: "800", fontSize: 15 },
  signOut: { flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 4 },
  signOutText: { color: C.red, fontSize: 16, fontWeight: "700" },
});
