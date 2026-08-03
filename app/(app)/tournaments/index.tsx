import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listAllTournaments, type TournamentListRow } from "../../../src/repos/tournamentRepo";
import { listClubs, type Club } from "../../../src/repos/clubRepo";
import { toast } from "../../../src/lib/toast";
import Icon from "../../../src/components/Icon";
import Sheet from "../../../src/components/Sheet";
import { C, F, press } from "../../../src/theme";

const statusColor = (s: string) => (s === "done" ? C.text3 : s === "live" ? C.red : C.accent);

export default function TournamentsList() {
  const router = useRouter();
  const [rows, setRows] = useState<TournamentListRow[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [pickingClub, setPickingClub] = useState(false);

  const reload = useCallback(() => {
    (async () => {
      setClubs(await listClubs());
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

  const create = (clubId: string) => {
    setPickingClub(false);
    router.push(`/tournaments/new?clubId=${clubId}`);
  };

  // With one club go straight there; with several ask, since the list spans
  // clubs and guessing would create in a club the user is not looking at.
  const onNew = () => {
    if (clubs.length === 1) { create(clubs[0].id); return; }
    setPickingClub(true);
  };

  return (
    <View style={s.root}>
      <Pressable
        style={({ pressed }) => [s.newBtn, pressed && press, clubs.length === 0 && s.off]}
        disabled={clubs.length === 0}
        onPress={onNew}
      >
        <Icon name="add" color={C.text} size={18} />
        <Text style={s.newText}>New tournament</Text>
      </Pressable>
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          <Text style={s.empty}>
            {clubs.length === 0 ? "Join or create a club first." : "No tournaments yet."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [s.card, pressed && press]} onPress={() => router.push(`/tournaments/${item.id}`)}>
            <Icon name="trophy" color={statusColor(item.status)} size={22} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>
                {item.clubName ? `${item.clubName} · ` : ""}{item.size}-player · {item.status}
              </Text>
            </View>
            <Icon name="chevron-forward" color={C.text2} size={20} />
          </Pressable>
        )}
      />
      <Sheet
        visible={pickingClub}
        title="Which club?"
        message="The new tournament is created in the club you pick."
        actions={[
          ...clubs.map((c) => ({ label: c.name, onPress: () => create(c.id) })),
          { label: "Cancel", onPress: () => setPickingClub(false) },
        ]}
        onClose={() => setPickingClub(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  newBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 12, paddingVertical: 14 },
  off: { opacity: 0.5 },
  newText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  empty: { color: C.text2, textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  name: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  meta: { color: C.text2, fontSize: 13, marginTop: 2 },
});
