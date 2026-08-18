import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  cancelRequest, listFriends, listIncomingRequests, listOutgoingRequests,
  removeFriend, respondToRequest, searchUsers, sendFriendRequest,
  type Friend, type FriendRequestRow,
} from "../../../src/repos/friendRepo";
import { toast } from "../../../src/lib/toast";
import Sheet from "../../../src/components/Sheet";
import PressableScale from "../../../src/components/PressableScale";
import Icon from "../../../src/components/Icon";
import { C, F } from "../../../src/theme";

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Friend | null>(null);
  const [results, setResults] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const pickedUsername = useRef("");

  const reload = useCallback(async () => {
    try {
      const [f, i, o] = await Promise.all([listFriends(), listIncomingRequests(), listOutgoingRequests()]);
      setFriends(f);
      setIncoming(i);
      setOutgoing(o);
    } catch (e) {
      toast((e as Error).message || "Could not load friends", "error");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 2) { setResults([]); setSearching(false); return; }
    if (trimmed === pickedUsername.current) { setResults([]); return; }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsers(trimmed)
        .then((r) => { if (!cancelled) setResults(r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [username]);

  const onAdd = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await sendFriendRequest(trimmed);
      setUsername("");
      toast(`Friend request sent to ${trimmed}`, "success");
      await reload();
    } catch (e) {
      toast((e as Error).message || "Could not send request", "error");
    } finally {
      setSending(false);
    }
  };

  const onAccept = async (profileId: string) => {
    setBusyId(profileId);
    try {
      await respondToRequest(profileId, true);
      await reload();
    } catch (e) {
      toast((e as Error).message || "Could not accept request", "error");
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = async (profileId: string) => {
    setBusyId(profileId);
    try {
      await respondToRequest(profileId, false);
      await reload();
    } catch (e) {
      toast((e as Error).message || "Could not decline request", "error");
    } finally {
      setBusyId(null);
    }
  };

  const onCancel = async (profileId: string) => {
    setBusyId(profileId);
    try {
      await cancelRequest(profileId);
      await reload();
    } catch (e) {
      toast((e as Error).message || "Could not cancel request", "error");
    } finally {
      setBusyId(null);
    }
  };

  const doRemove = async () => {
    const friend = pendingRemove;
    setPendingRemove(null);
    if (!friend) return;
    setBusyId(friend.id);
    try {
      await removeFriend(friend.id);
      setFriends((cur) => cur.filter((f) => f.id !== friend.id));
      toast(`${friend.displayName} removed`, "success");
    } catch (e) {
      toast((e as Error).message || "Could not remove friend", "error");
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
        data={friends}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={
          <>
            <Text style={s.fieldLabel}>Add by username</Text>
            <View style={s.addRow}>
              <TextInput
                style={s.input}
                placeholder="Search by username or name"
                placeholderTextColor={C.text3}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                onSubmitEditing={onAdd}
              />
              <PressableScale style={[s.addBtn, sending && s.off]} disabled={sending} onPress={onAdd}>
                <Icon name="person-add" color={C.text} size={16} />
                <Text style={s.addBtnText}>Add</Text>
              </PressableScale>
            </View>
            {searching && <Text style={s.searchHint}>Searching…</Text>}
            {!searching && results.length > 0 && (
              <View style={s.resultsBox}>
                {results.map((r) => (
                  <Pressable
                    key={r.id}
                    style={s.resultRow}
                    onPress={() => { pickedUsername.current = r.username; setUsername(r.username); setResults([]); }}
                  >
                    <Text style={s.resultName} numberOfLines={1}>{r.displayName}</Text>
                    <Text style={s.resultUsername} numberOfLines={1}>@{r.username}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {incoming.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Requests</Text>
                {incoming.map((r) => (
                  <View key={r.profileId} style={s.row}>
                    <Text style={s.name} numberOfLines={1}>{r.displayName}</Text>
                    <PressableScale
                      style={[s.chip, busyId === r.profileId && s.off]}
                      disabled={busyId === r.profileId}
                      onPress={() => onAccept(r.profileId)}
                    >
                      <Text style={s.chipText}>Accept</Text>
                    </PressableScale>
                    <PressableScale
                      style={[s.chip, s.chipMuted, busyId === r.profileId && s.off]}
                      disabled={busyId === r.profileId}
                      onPress={() => onDecline(r.profileId)}
                    >
                      <Text style={s.chipTextMuted}>Decline</Text>
                    </PressableScale>
                  </View>
                ))}
              </>
            )}

            {outgoing.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Sent</Text>
                {outgoing.map((r) => (
                  <View key={r.profileId} style={s.row}>
                    <Text style={s.name} numberOfLines={1}>{r.displayName}</Text>
                    <PressableScale
                      style={[s.chip, s.chipMuted, busyId === r.profileId && s.off]}
                      disabled={busyId === r.profileId}
                      onPress={() => onCancel(r.profileId)}
                    >
                      <Text style={s.chipTextMuted}>Cancel</Text>
                    </PressableScale>
                  </View>
                ))}
              </>
            )}

            <Text style={s.sectionTitle}>Friends</Text>
          </>
        }
        ListEmptyComponent={<Text style={s.empty}>No friends yet. Add one by username above.</Text>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Text style={s.name} numberOfLines={1}>{item.displayName}</Text>
            <PressableScale
              style={[s.remove, busyId === item.id && s.off]}
              disabled={busyId === item.id}
              onPress={() => setPendingRemove(item)}
            >
              <Icon name="trash-outline" color={C.text2} size={18} />
            </PressableScale>
          </View>
        )}
      />
      <Sheet
        visible={!!pendingRemove}
        title="Remove friend?"
        message={pendingRemove ? `${pendingRemove.displayName} will be removed from your friends.` : ""}
        actions={[
          { label: "Remove", onPress: doRemove, destructive: true },
          { label: "Cancel", onPress: () => setPendingRemove(null) },
        ]}
        onClose={() => setPendingRemove(null)}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  addRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  input: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontFamily: F.body, fontSize: 15,
  },
  addBtn: { flexDirection: "row", gap: 6, backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: C.text, fontFamily: F.semibold, fontSize: 15 },
  fieldLabel: { color: C.text2, fontSize: 12, fontFamily: F.medium, letterSpacing: 0.3, marginBottom: 6 },
  searchHint: { color: C.text2, fontSize: 12, fontFamily: F.body, marginTop: 4, marginBottom: 4 },
  resultsBox: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, marginTop: 4, marginBottom: 8, overflow: "hidden" },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  resultName: { flex: 1, color: C.text, fontFamily: F.semibold, fontSize: 14 },
  resultUsername: { color: C.text2, fontFamily: F.body, fontSize: 13, marginLeft: 8 },
  sectionTitle: { color: C.text2, fontFamily: F.medium, fontSize: 12, letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  empty: { color: C.text2, fontSize: 15, lineHeight: 22, padding: 24, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  name: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.semibold },
  remove: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.bgElev },
  chip: { backgroundColor: C.red, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { color: C.text, fontFamily: F.semibold, fontSize: 13 },
  chipMuted: { backgroundColor: C.bgElev, borderWidth: 1, borderColor: C.line },
  chipTextMuted: { color: C.text2, fontFamily: F.semibold, fontSize: 13 },
  off: { opacity: 0.45 },
});
