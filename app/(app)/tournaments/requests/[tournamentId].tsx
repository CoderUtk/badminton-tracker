import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { approveTournamentRequest, denyTournamentRequest, listPendingTournamentRequests, type TournamentJoinRequest } from "../../../../src/repos/tournamentStaffRepo";
import { toast } from "../../../../src/lib/toast";
import Icon from "../../../../src/components/Icon";
import PressableScale from "../../../../src/components/PressableScale";
import { C, F } from "../../../../src/theme";

export default function TournamentRequests() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const [requests, setRequests] = useState<TournamentJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setRequests(await listPendingTournamentRequests(tournamentId));
    } catch (e) {
      toast((e as Error).message || "Could not load requests", "error");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const decide = async (request: TournamentJoinRequest, approve: boolean) => {
    setBusyId(request.id);
    try {
      if (approve) {
        // Tournament entrants require a club_player_id mapping. For now, since the 
        // request originates from a profile, the RPC should handle looking up or creating
        // a corresponding club_player. The UI just triggers the approval. 
        // We will pass the profile_id as the club_player_id in this context if they match.
        await approveTournamentRequest(request.id, request.profileId);
      } else {
        await denyTournamentRequest(request.id);
      }
      setRequests((cur) => cur.filter((r) => r.id !== request.id));
      toast(approve ? `${request.displayName} joined bracket` : "Request declined", approve ? "success" : "info");
    } catch (e) {
      toast((e as Error).message || "Could not update the request", "error");
      void reload();
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = (request: TournamentJoinRequest) => {
    setConfirmingId(null);
    void decide(request, true);
  };

  const onDenyTap = (request: TournamentJoinRequest) => {
    if (confirmingId !== request.id) {
      setConfirmingId(request.id);
      return;
    }
    setConfirmingId(null);
    void decide(request, false);
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={s.content}
      data={requests}
      keyExtractor={(r) => r.id}
      ListEmptyComponent={<Text style={s.empty}>No pending requests. Share the tournament link to invite players.</Text>}
      renderItem={({ item }) => (
        <View style={s.row}>
          <View style={s.avatar}><Text style={s.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={s.name} numberOfLines={1}>{item.displayName}</Text>
          <PressableScale
            style={[s.btn, s.deny, confirmingId === item.id && s.denyConfirm, busyId === item.id && s.off]}
            disabled={busyId === item.id}
            onPress={() => onDenyTap(item)}
          >
            <Icon name="close" color={confirmingId === item.id ? C.text : C.text2} size={18} />
          </PressableScale>
          <PressableScale
            style={[s.btn, s.approve, busyId === item.id && s.off]}
            disabled={busyId === item.id}
            onPress={() => onApprove(item)}
          >
            <Icon name="account-plus" color={C.text} size={18} />
          </PressableScale>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  empty: { color: C.text2, fontSize: 15, lineHeight: 22, padding: 24, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.text, fontFamily: F.display, fontSize: 16 },
  name: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.semibold },
  btn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deny: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  denyConfirm: { backgroundColor: C.red, borderColor: C.red },
  approve: { backgroundColor: C.green },
  off: { opacity: 0.45 },
});
