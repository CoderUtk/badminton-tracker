import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  addGuestEntrant, pairEntrants, removeEntrant, type MatchType,
} from "../repos/tournamentRepo";
import { listPlayers, type ClubPlayer } from "../repos/clubRepo";
import {
  approveTournamentRequest, denyTournamentRequest, type TournamentJoinRequest,
} from "../repos/tournamentStaffRepo";
import { drawSizeFor } from "../tournament/draw";
import type { Entrant } from "../tournament/types";
import { validateName } from "../lib/validate";
import { toast } from "../lib/toast";
import Icon from "./Icon";
import PressableScale from "./PressableScale";
import { C, F, press } from "../theme";

/**
 * Entrant roster: add/remove/pair while the tournament is a draft, plus
 * pending player-role requests inline. Once live the roster is fixed — the
 * bracket already references these entrant ids.
 */
export default function TournamentPlayersTab({
  tournamentId, clubId, entrants, matchType, isAdmin, isDraft, requests, onChanged,
}: {
  tournamentId: string;
  clubId: string;
  entrants: Entrant[];
  matchType: MatchType;
  isAdmin: boolean;
  isDraft: boolean;
  requests: TournamentJoinRequest[];
  onChanged: () => void;
}) {
  const [roster, setRoster] = useState<ClubPlayer[]>([]);
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    void listPlayers(clubId).then(setRoster);
  }, [clubId, entrants]);

  const guestError = validateName(guestName, "Player name");
  const draw = drawSizeFor(entrants.length);
  const byes = draw - entrants.length;
  const playerRequests = requests.filter((r) => r.role === "player");

  const onAddGuest = async () => {
    if (guestError) { toast(guestError, "error"); return; }
    setBusy(true);
    try {
      await addGuestEntrant(tournamentId, clubId, guestName.trim());
      setGuestName("");
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not add that player", "error");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (entrantId: string) => {
    setBusy(true);
    try {
      await removeEntrant(entrantId);
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not remove that player", "error");
    } finally {
      setBusy(false);
    }
  };

  const onPickPartner = async (entrantId: string, partnerClubPlayerId: string | null) => {
    setBusy(true);
    try {
      await pairEntrants(entrantId, partnerClubPlayerId);
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not update that pair", "error");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (request: TournamentJoinRequest, approve: boolean) => {
    setBusy(true);
    try {
      if (approve) await approveTournamentRequest(request.id);
      else await denyTournamentRequest(request.id);
      toast(approve ? `${request.displayName} joined the draw` : "Request declined", approve ? "success" : "info");
      onChanged();
    } catch (e) {
      toast((e as Error).message || "Could not update the request", "error");
    } finally {
      setBusy(false);
    }
  };

  // Every club_player already used as someone's clubPlayerId or partner is
  // taken — a doubles partner can only be an unpaired roster member.
  const takenIds = new Set(entrants.flatMap((e) => [e.clubPlayerId, e.partnerClubPlayerId].filter((x): x is string => !!x)));

  return (
    <View style={s.root}>
      <Text style={s.drawInfo}>
        {entrants.length} entrants → {draw} draw, {byes} bye{byes === 1 ? "" : "s"}
      </Text>

      {entrants.map((e) => {
        const ownName = roster.find((p) => p.id === e.clubPlayerId)?.name ?? e.name;
        const partnerName = roster.find((p) => p.id === e.partnerClubPlayerId)?.name ?? null;
        const options = roster.filter((p) => p.id === e.clubPlayerId || !takenIds.has(p.id) || p.id === e.partnerClubPlayerId);
        const displayName = matchType === "doubles" ? ownName : e.name;
        return (
          <View key={e.id} style={s.row}>
            <Text style={s.name} numberOfLines={1}>{displayName}</Text>
            {isAdmin && isDraft && matchType === "doubles" ? (
              <View style={s.partnerRow}>
                {options.filter((p) => p.id !== e.clubPlayerId).map((p) => (
                  <Pressable accessibilityRole="button"
                    key={p.id}
                    disabled={busy}
                    onPress={() => onPickPartner(e.id, p.id === e.partnerClubPlayerId ? null : p.id)}
                    style={[s.chip, p.id === e.partnerClubPlayerId && s.chipOn]}
                  >
                    <Text style={[s.chipText, p.id === e.partnerClubPlayerId && s.chipTextOn]}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : matchType === "doubles" && partnerName ? (
              <Text style={s.partner}>{partnerName}</Text>
            ) : null}
            {isAdmin && isDraft ? (
              <PressableScale accessibilityRole="button" disabled={busy} onPress={() => onRemove(e.id)} style={s.remove}>
                <Icon name="trash-outline" color={C.text2} size={16} />
              </PressableScale>
            ) : null}
          </View>
        );
      })}

      {isAdmin && isDraft ? (
        <View style={s.guestRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Guest player name"
            placeholderTextColor={C.text2}
            value={guestName}
            onChangeText={setGuestName}
            onSubmitEditing={() => { if (!guestError && !busy) void onAddGuest(); }}
            returnKeyType="done"
          />
          <Pressable accessibilityRole="button" style={({ pressed }) => [s.addBtn, pressed && press, (!!guestError || busy) && s.off]} disabled={!!guestError || busy} onPress={onAddGuest}>
            <Icon name="add" color={C.text} size={20} />
          </Pressable>
        </View>
      ) : null}

      {isAdmin && playerRequests.length > 0 ? (
        <>
          <Text style={s.sectionTitle}>Pending requests</Text>
          {playerRequests.map((r) => (
            <View key={r.id} style={s.row}>
              <Text style={s.name} numberOfLines={1}>{r.displayName}</Text>
              <PressableScale accessibilityRole="button" disabled={busy} onPress={() => decide(r, false)} style={[s.reqBtn, s.deny]}>
                <Icon name="close" color={C.text2} size={16} />
              </PressableScale>
              <PressableScale accessibilityRole="button" disabled={busy} onPress={() => decide(r, true)} style={[s.reqBtn, s.approve]}>
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
  drawInfo: { color: C.text2, fontFamily: F.body, fontSize: 13, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.line },
  name: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 15 },
  partner: { color: C.text2, fontFamily: F.body, fontSize: 13 },
  partnerRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1, justifyContent: "flex-end" },
  chip: { backgroundColor: C.bgElev, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { borderColor: C.lineHi, backgroundColor: C.cardHi },
  chipText: { color: C.text2, fontFamily: F.body, fontSize: 12 },
  chipTextOn: { color: C.text },
  remove: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.bgElev },
  guestRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 15 },
  addBtn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" },
  off: { opacity: 0.5 },
  sectionTitle: { color: C.text, fontFamily: F.bold, fontSize: 14, marginTop: 10 },
  reqBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  deny: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  approve: { backgroundColor: C.green },
});
