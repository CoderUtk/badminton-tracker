import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteTournament, finishBracketMatch, getTournament, startBracketMatch, startTournament,
  type MatchType,
} from "../../../src/repos/tournamentRepo";
import { getMatch } from "../../../src/repos/matchRepo";
import { getClub } from "../../../src/repos/clubRepo";
import { bracketStatus } from "../../../src/tournament/bracket";
import { drawSizeFor, startBlocker } from "../../../src/tournament/draw";
import type { BracketMatch, Entrant } from "../../../src/tournament/types";
import BracketView from "../../../src/components/BracketView";
import Icon from "../../../src/components/Icon";
import Sheet from "../../../src/components/Sheet";
import MenuButton from "../../../src/components/MenuButton";
import { buildTournamentJoinPath } from "../../../src/lib/joinLink";
import { shareJoinLink } from "../../../src/lib/shareJoin";
import { toast } from "../../../src/lib/toast";
import { C, F } from "../../../src/theme";

export default function TournamentBracket() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");
  const [matchType, setMatchType] = useState<MatchType>("singles");
  const [pending, setPending] = useState<BracketMatch | null>(null); // cell awaiting start confirm
  const [clubRole, setClubRole] = useState<string | null>(null);
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
        const { tournament, entrants: ents, bracket } = await getTournament(id);
        setTitle(tournament.name);
        setEntrants(ents);
        setBracket(bracket);
        setStatus(tournament.status);
        setMatchType(tournament.matchType);
        const club = await getClub(tournament.clubId);
        setClubRole(club?.role ?? null);
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
  const isAdmin = clubRole === "owner" || clubRole === "admin";
  const isDraft = status === "draft";
  const players = entrants.length * (matchType === "doubles" ? 2 : 1);
  const blocker = startBlocker(players, matchType);

  const onStart = async () => {
    if (!id) return;
    try {
      await startTournament(id);
      reload();
    } catch (e) {
      toast((e as Error).message || "Could not start the tournament", "error");
    }
  };

  // Any member may share: joining still needs admin approval, so handing out
  // the link grants nothing on its own.
  const onShare = () =>
    shareJoinLink(buildTournamentJoinPath(id!), `Join "${title}" on CourtSide:`);

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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
      <Stack.Screen
        options={{
          // Trigger only. The menu Sheet is mounted in the body below: a Sheet
          // rendered here would position against the header and be clipped.
          headerRight: isAdmin ? () => <MenuButton onPress={() => setMenuOpen(true)} /> : undefined,
        }}
      />
      {title ? <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 18, marginBottom: 4 }}>{title}</Text> : null}
      {champName ? (
        <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
      ) : null}
      {isDraft ? (
        <View>
          {entrants.map((e) => (
            <Text key={e.id} style={s.entrant}>{e.name}</Text>
          ))}
          <Text style={s.drawInfo}>
            {entrants.length} entrants → {drawSizeFor(entrants.length)} draw
          </Text>
          {isAdmin && (
            <>
              <Pressable
                style={[s.start, !!blocker && s.off]}
                disabled={!!blocker}
                onPress={onStart}
              >
                <Text style={s.startText}>Start tournament</Text>
              </Pressable>
              {blocker ? <Text style={s.err}>{blocker}</Text> : null}
            </>
          )}
        </View>
      ) : (
        <BracketView bracket={bracket} entrants={entrants} onCellPress={onCellPress} />
      )}
      <Pressable
        style={{ flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 12 }}
        onPress={onShare}
      >
        <Icon name="share-social-outline" color={C.text} size={18} />
        <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>Share join link</Text>
      </Pressable>
      {isAdmin && (
        <>
          <Pressable
            style={{ flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 12 }}
            onPress={() => router.push(`/tournaments/requests/${id}`)}
          >
            <Icon name="person-add" color={C.text} size={18} />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>Pending requests</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: "row", gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 12 }}
            onPress={() => router.push(`/tournaments/ops/${id}`)}
          >
            <Icon name="cog" color={C.text} size={18} />
            <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>Live Ops Dashboard</Text>
          </Pressable>
        </>
      )}
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
          { label: "Edit tournament", onPress: () => { setMenuOpen(false); router.push(`/tournaments/edit/${id}`); } },
          { label: "Delete tournament", destructive: true, onPress: () => { setMenuOpen(false); setConfirmingDelete(true); } },
          { label: "Cancel", onPress: () => setMenuOpen(false) },
        ]}
        onClose={() => setMenuOpen(false)}
      />
      <Sheet
        visible={confirmingDelete}
        title="Delete tournament?"
        message={`This permanently deletes "${title}". Matches already played stay in history.`}
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
  entrant: { color: C.text, fontFamily: F.body, fontSize: 15, paddingVertical: 6 },
  drawInfo: { color: C.text2, fontFamily: F.body, fontSize: 13, marginTop: 8, marginBottom: 4 },
  start: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  startText: { color: C.text, fontFamily: F.semibold, fontSize: 16 },
  off: { opacity: 0.5 },
  err: { color: C.red, fontSize: 12.5, fontFamily: F.body, marginTop: 6 },
});
