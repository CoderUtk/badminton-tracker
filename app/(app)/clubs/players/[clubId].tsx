import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { getClub, listPlayers, removePlayer, type ClubPlayer } from "../../../../src/repos/clubRepo";
import { toast } from "../../../../src/lib/toast";
import Sheet from "../../../../src/components/Sheet";
import Icon from "../../../../src/components/Icon";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function ClubPlayers() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<ClubPlayer | null>(null);

  const reload = useCallback(async () => {
    if (!clubId) return;
    try {
      const [list, club] = await Promise.all([listPlayers(clubId), getClub(clubId)]);
      setPlayers(list);
      setIsAdmin(club?.role === "owner" || club?.role === "admin");
    } catch (e) {
      toast((e as Error).message || "Could not load players", "error");
    } finally {
      setLoading(false);
    }
  }, [clubId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const doRemove = async () => {
    const player = pending;
    setPending(null);
    if (!player) return;
    setBusyId(player.id);
    try {
      await removePlayer(player.id);
      setPlayers((cur) => cur.filter((p) => p.id !== player.id));
      toast(`${player.name} removed`, "success");
    } catch (e) {
      toast((e as Error).message || "Could not remove that player", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  return (
    <>
      <FlatList
        style={s.root}
        contentContainerStyle={s.content}
        data={players}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={s.empty}>No players yet.</Text>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Text style={s.name} numberOfLines={1}>{item.name}</Text>
            {isAdmin ? (
              <PressableScale
                style={[s.remove, busyId === item.id && s.off]}
                disabled={busyId === item.id}
                onPress={() => setPending(item)}
              >
                <Icon name="trash-outline" color={C.text2} size={18} />
              </PressableScale>
            ) : null}
          </View>
        )}
      />
      <Sheet
        visible={!!pending}
        title="Remove player?"
        message={pending ? `${pending.name} will be removed from the roster. They can't have any tournament history.` : ""}
        actions={[
          { label: "Remove", onPress: doRemove, destructive: true },
          { label: "Cancel", onPress: () => setPending(null) },
        ]}
        onClose={() => setPending(null)}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  empty: { color: C.text2, fontSize: 15, lineHeight: 22, padding: 24, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  name: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.semibold },
  remove: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.bgElev },
  off: { opacity: 0.45 },
});
