import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listAllTournaments, type TournamentListRow } from "../../../src/repos/tournamentRepo";
import { toast } from "../../../src/lib/toast";
import { formatEntrantLabel } from "../../../src/lib/entrantLabel";
import Icon from "../../../src/components/Icon";
import { C, F, press, glow } from "../../../src/theme";

const STATUS_COLOR: Record<string, string> = {
  draft: C.accent,
  live: C.green,
  // Decorative value (border/tint/icon/dot) — old dim shade, kept off the
  // brightened AA text3. The status label overrides back to text3 below.
  done: C.ghost,
};

export default function TournamentsList() {
  const router = useRouter();
  const [rows, setRows] = useState<TournamentListRow[]>([]);

  const reload = useCallback(() => {
    (async () => {
      try {
        setRows(await listAllTournaments());
      } catch (e) {
        // Leave the previously loaded rows on screen. Blanking the list on a
        // read failure is what made a failed query look like deleted data.
        toast((e as Error).message || "Could not load tournaments", "error");
      }
    })();
  }, []);
  useFocusEffect(reload);

  return (
    <View style={s.root}>
      <Pressable
        style={({ pressed }) => [s.newBtn, pressed && press]}
        onPress={() => router.push("/tournaments/new")}
      >
        <Icon name="add" color={C.text} size={18} />
        <Text style={s.newText}>New tournament</Text>
      </Pressable>
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={<Text style={s.empty}>No tournaments yet.</Text>}
        renderItem={({ item }) => {
          const color = STATUS_COLOR[item.status] ?? C.accent;
          return (
            <Pressable
              style={({ pressed }) => [
                s.card,
                { borderLeftColor: color, borderLeftWidth: 4 },
                item.status === "live" && glow(C.green, 10, 0.35),
                pressed && press,
              ]}
              onPress={() => router.push(`/tournaments/${item.id}`)}
            >
              <View style={[s.iconWrap, { backgroundColor: color + "15" }]}>
                <Icon name="trophy" color={color} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.meta}>
                  {item.clubName ? `${item.clubName} · ` : ""}
                  {formatEntrantLabel(item.entrantCount)}
                </Text>
                <View style={[s.statusPill, { backgroundColor: color + "22" }]}>
                  <View style={[s.statusDot, { backgroundColor: color }]} />
                  {/* Label reads as text, not decoration — needs the AA text3 value even
                      when the shared status color (done) is the dimmer ghost shade. */}
                  <Text style={[s.status, { color: item.status === "done" ? C.text3 : color }]}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
              <Icon name="chevron-forward" color={C.text2} size={20} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  newBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 12, paddingVertical: 14 },
  newText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  empty: { color: C.text2, textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  meta: { color: C.text2, fontSize: 13, marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 11, fontFamily: F.bold, letterSpacing: 0.7 },
});
