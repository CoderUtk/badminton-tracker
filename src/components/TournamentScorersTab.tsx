import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { buildTournamentScorerJoinPath } from "../lib/joinLink";
import { shareJoinLink } from "../lib/shareJoin";
import {
  approveTournamentRequest, denyTournamentRequest,
  type TournamentJoinRequest, type TournamentStaff,
} from "../repos/tournamentStaffRepo";
import { toast } from "../lib/toast";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import { C, F } from "../theme";

/** Staff roster plus pending scorer requests. Admin-only actions; everyone sees the roster. */
export default function TournamentScorersTab({
  tournamentId, tournamentName, isAdmin, staff, requests, onChanged,
}: {
  tournamentId: string;
  tournamentName: string;
  isAdmin: boolean;
  staff: TournamentStaff[];
  requests: TournamentJoinRequest[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const scorerRequests = requests.filter((r) => r.role === "scorer");

  const onShareScorer = () =>
    shareJoinLink(buildTournamentScorerJoinPath(tournamentId), `Score "${tournamentName}" on CourtSide:`);

  const decide = async (request: TournamentJoinRequest, approve: boolean) => {
    setBusy(true);
    try {
      if (approve) await approveTournamentRequest(request.id);
      else await denyTournamentRequest(request.id);
      toast(approve ? `${request.displayName} added as staff` : "Request declined", approve ? "success" : "info");
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not update the request", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      {isAdmin ? (
        <Pressable style={s.share} onPress={onShareScorer}>
          <Icon name="share-social-outline" color={C.text} size={18} />
          <Text style={s.shareText}>Share scorer link</Text>
        </Pressable>
      ) : null}

      {staff.map((m) => (
        <View key={m.id} style={s.row}>
          <Text style={s.name} numberOfLines={1}>{m.displayName}</Text>
          <Text style={s.role}>{m.role === "admin" ? "Admin" : "Scorer"}</Text>
        </View>
      ))}

      {isAdmin && scorerRequests.length > 0 ? (
        <>
          <Text style={s.sectionTitle}>Pending requests</Text>
          {scorerRequests.map((r) => (
            <View key={r.id} style={s.row}>
              <Text style={s.name} numberOfLines={1}>{r.displayName}</Text>
              <PressableScale disabled={busy} onPress={() => decide(r, false)} style={[s.reqBtn, s.deny]}>
                <Icon name="close" color={C.text2} size={16} />
              </PressableScale>
              <PressableScale disabled={busy} onPress={() => decide(r, true)} style={[s.reqBtn, s.approve]}>
                <Icon name="account-plus" color={C.text} size={16} />
              </PressableScale>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 8, paddingVertical: 12 },
  share: { flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  shareText: { color: C.text, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.line },
  name: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 15 },
  role: { color: C.text2, fontFamily: F.semibold, fontSize: 12, textTransform: "uppercase" },
  sectionTitle: { color: C.text, fontFamily: F.bold, fontSize: 14, marginTop: 10 },
  reqBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  deny: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  approve: { backgroundColor: C.green },
});
