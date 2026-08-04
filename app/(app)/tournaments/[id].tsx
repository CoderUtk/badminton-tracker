import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteTournament, finishBracketMatch, getTournament, startBracketMatch, startTournament,
  type MatchType, type TournamentRow,
} from "../../../src/repos/tournamentRepo";
import { getMatch } from "../../../src/repos/matchRepo";
import { getClub } from "../../../src/repos/clubRepo";
import {
  getTournamentStaff, listPendingTournamentRequests, myStaffRole,
  type TournamentJoinRequest, type TournamentStaff,
} from "../../../src/repos/tournamentStaffRepo";
import { bracketStatus } from "../../../src/tournament/bracket";
import { startBlocker } from "../../../src/tournament/draw";
import type { BracketMatch, Entrant } from "../../../src/tournament/types";
import BracketView from "../../../src/components/BracketView";
import Sheet from "../../../src/components/Sheet";
import MenuButton from "../../../src/components/MenuButton";
import TournamentConfigTab from "../../../src/components/TournamentConfigTab";
import TournamentPlayersTab from "../../../src/components/TournamentPlayersTab";
import TournamentScorersTab from "../../../src/components/TournamentScorersTab";
import { toast } from "../../../src/lib/toast";
import { C, F, press } from "../../../src/theme";

type Tab = "config" | "players" | "scorers";

export default function TournamentBracket() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("config");
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [staff, setStaff] = useState<TournamentStaff[]>([]);
  const [requests, setRequests] = useState<TournamentJoinRequest[]>([]);
  const [pending, setPending] = useState<BracketMatch | null>(null); // cell awaiting start confirm
  const [clubRole, setClubRole] = useState<string | null>(null);
  const [isTournamentAdmin, setIsTournamentAdmin] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(() => {
    if (!id) return;
    (async () => {
      try {
        // Reconcile: any cell whose linked match has completed advances the winner.
        const { bracket: b0 } = await getTournament(id);
        for (const cell of b0) {
          if (cell.matchId && !cell.winnerEntrant) {
            const m = await getMatch(cell.matchId);
            if (m && m.status !== "live" && m.winner) {
              const winnerEntrant = m.winner === "A" ? cell.entrantA : cell.entrantB;
              if (winnerEntrant) await finishBracketMatch(cell.id, winnerEntrant);
            }
          }
        }
        const { tournament: t, entrants: ents, bracket: b } = await getTournament(id);
        setTournament(t);
        setEntrants(ents);
        setBracket(b);
        const club = await getClub(t.clubId);
        setClubRole(club?.role ?? null);
        const staffRole = await myStaffRole(id);
        setIsTournamentAdmin(staffRole === "admin");
        const isAdmin = club?.role === "owner" || club?.role === "admin" || staffRole === "admin";
        const [staffList, reqs] = await Promise.all([
          getTournamentStaff(id),
          isAdmin ? listPendingTournamentRequests(id) : Promise.resolve([]),
        ]);
        setStaff(staffList);
        setRequests(reqs);
      } catch (e) {
        toast((e as Error).message || "Could not load the tournament", "error");
      }
    })();
  }, [id]);
  useFocusEffect(reload);

  const onCellPress = (cell: BracketMatch) => {
    if (cell.matchId && !cell.winnerEntrant) {
      router.push(`/watch/${cell.matchId}`);
      return;
    }
    if (cell.winnerEntrant) return; // already decided
    if (!cell.entrantA || !cell.entrantB) return; // waiting on a feeder
    setPending(cell);
  };

  const doStart = async () => {
    const cell = pending;
    setPending(null);
    if (!cell) return;
    try {
      const matchId = await startBracketMatch(cell.id);
      router.push(`/score/${matchId}`);
    } catch (e) {
      toast((e as Error).message || "Could not start", "error");
    }
  };

  const champ = bracketStatus(bracket).champion;
  const champName = champ ? entrants.find((e) => e.id === champ)?.name : null;
  const isAdmin = clubRole === "owner" || clubRole === "admin" || isTournamentAdmin;
  // A legacy draft created before the two-phase split can already hold a
  // full bracket (status flipped to "live" only on the first finished
  // match). Such a tournament must render its bracket, not the Start flow.
  const isDraft = tournament?.status === "draft" && bracket.length === 0;
  const players = entrants.length * ((tournament?.matchType ?? "singles" as MatchType) === "doubles" ? 2 : 1);
  const blocker = startBlocker(players, tournament?.matchType ?? "singles");

  const onStart = async () => {
    if (!id) return;
    try {
      await startTournament(id);
      reload();
    } catch (e) {
      toast((e as Error).message || "Could not start the tournament", "error");
    }
  };

  const onDeleteTournament = async () => {
    if (!id) return;
    setConfirmingDelete(false);
    try {
      await deleteTournament(id);
      router.back();
    } catch (e) {
      toast((e as Error).message || "Could not delete tournament", "error");
    }
  };

  if (!tournament) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
      <Stack.Screen
        options={{
          // Trigger only. The menu Sheet is mounted in the body below: a Sheet
          // rendered here would position against the header and be clipped.
          headerRight: isAdmin ? () => <MenuButton onPress={() => setMenuOpen(true)} /> : undefined,
        }}
      />
      <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 18, marginBottom: 4 }}>{tournament.name}</Text>
      {champName ? (
        <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
      ) : null}

      {!isDraft ? (
        <BracketView bracket={bracket} entrants={entrants} onCellPress={onCellPress} />
      ) : null}

      <View style={s.tabRow}>
        {(["config", "players", "scorers"] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={({ pressed }) => [s.tabBtn, pressed && press, tab === t && s.tabOn]}>
            <Text style={[s.tabText, tab === t && s.tabTextOn]}>{t[0].toUpperCase() + t.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "config" ? (
        <TournamentConfigTab
          tournament={tournament}
          isAdmin={isAdmin}
          isDraft={!!isDraft}
          blocker={blocker}
          onStart={onStart}
          onChanged={reload}
        />
      ) : tab === "players" ? (
        <TournamentPlayersTab
          tournamentId={tournament.id}
          clubId={tournament.clubId}
          entrants={entrants}
          matchType={tournament.matchType}
          isAdmin={isAdmin}
          isDraft={!!isDraft}
          requests={requests}
          onChanged={reload}
        />
      ) : (
        <TournamentScorersTab
          tournamentId={tournament.id}
          tournamentName={tournament.name}
          isAdmin={isAdmin}
          staff={staff}
          requests={requests}
          onChanged={reload}
        />
      )}

      {isAdmin ? (
        <Pressable
          style={{ flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 12 }}
          onPress={() => router.push(`/tournaments/ops/${id}`)}
        >
          <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>Live Ops Dashboard</Text>
        </Pressable>
      ) : null}

      <Sheet
        visible={!!pending}
        title="Start match"
        message="Create and score this match now?"
        actions={[
          { label: "Start", onPress: doStart, primary: true },
          { label: "Cancel", onPress: () => setPending(null) },
        ]}
        onClose={() => setPending(null)}
      />
      <Sheet
        visible={menuOpen}
        title="Actions"
        actions={[
          { label: "Delete tournament", destructive: true, onPress: () => { setMenuOpen(false); setConfirmingDelete(true); } },
          { label: "Cancel", onPress: () => setMenuOpen(false) },
        ]}
        onClose={() => setMenuOpen(false)}
      />
      <Sheet
        visible={confirmingDelete}
        title="Delete tournament?"
        message={`This permanently deletes "${tournament.name}". Matches already played stay in history.`}
        actions={[
          { label: "Delete", onPress: onDeleteTournament, destructive: true },
          { label: "Cancel", onPress: () => setConfirmingDelete(false) },
        ]}
        onClose={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tabRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  tabOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
  tabText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  tabTextOn: { color: C.text },
});
