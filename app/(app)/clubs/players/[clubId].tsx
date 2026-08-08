import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { addFriendToClub, getClub, listPlayers, removePlayer, type ClubPlayer } from "../../../../src/repos/clubRepo";
import { listFriends, type Friend } from "../../../../src/repos/friendRepo";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addableFriends, setAddableFriends] = useState<Friend[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

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

  const openPicker = async () => {
    try {
      const friends = await listFriends();
      const existingIds = new Set(players.map((p) => p.profile_id).filter(Boolean));
      setAddableFriends(friends.filter((f) => !existingIds.has(f.id)));
      setPickerOpen(true);
    } catch (e) {
      toast((e as Error).message || "Could not load friends", "error");
    }
  };

  const onAddFriend = async (friend: Friend) => {
    if (!clubId) return;
    setAddingId(friend.id);
    try {
      await addFriendToClub(clubId, friend.id);
      toast(`${friend.displayName} added`, "success");
      setPickerOpen(false);
      await reload();
    } catch (e) {
      toast((e as Error).message || "Could not add that friend", "error");
    } finally {
      setAddingId(null);
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
        ListHeaderComponent={
          isAdmin ? (
            <PressableScale style={s.addFriendBtn} onPress={openPicker}>
              <Icon name="person-add" color={C.text} size={18} />
              <Text style={s.addFriendText}>Add friend</Text>
            </PressableScale>
          ) : null
        }
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
        visible={pickerOpen}
        title="Add friend to club"
        actions={
          addableFriends.length > 0
            ? [
                ...addableFriends.map((f) => ({
                  label: addingId === f.id ? `Adding ${f.displayName}...` : f.displayName,
                  onPress: () => onAddFriend(f),
                })),
                { label: "Cancel", onPress: () => setPickerOpen(false) },
              ]
            : [{ label: "Cancel", onPress: () => setPickerOpen(false) }]
        }
        message={addableFriends.length === 0 ? "No friends available to add — everyone you're friends with is already in this club." : undefined}
        onClose={() => setPickerOpen(false)}
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
  addFriendBtn: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingVertical: 12, marginBottom: 8,
  },
  addFriendText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  name: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.semibold },
  remove: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.bgElev },
  off: { opacity: 0.45 },
});
