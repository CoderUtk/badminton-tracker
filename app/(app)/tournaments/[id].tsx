import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteTournament, finishBracketMatch, getTournament, startBracketMatch, startTournament,
  type MatchType, type TournamentRow,
} from "../../../src/repos/tournamentRepo";
import { getMatch, type MatchRecord } from "../../../src/repos/matchRepo";
import { getClub } from "../../../src/repos/clubRepo";
import {
  getTournamentStaff, listPendingTournamentRequests, myStaffRole,
  type TournamentJoinRequest, type TournamentStaff,
} from "../../../src/repos/tournamentStaffRepo";
import { bracketStatus } from "../../../src/tournament/bracket";
import { startBlocker } from "../../../src/tournament/draw";
import type { BracketMatch, Entrant } from "../../../src/tournament/types";
import BracketView, { type BracketLiveScore } from "../../../src/components/BracketView";
import Sheet from "../../../src/components/Sheet";
import BottomPanel from "../../../src/components/BottomPanel";
import MenuButton from "../../../src/components/MenuButton";
import Icon from "../../../src/components/Icon";
import PressableScale from "../../../src/components/PressableScale";
import TournamentConfigTab from "../../../src/components/TournamentConfigTab";
import TournamentPlayersTab from "../../../src/components/TournamentPlayersTab";
import TournamentScorersTab from "../../../src/components/TournamentScorersTab";
import { toast } from "../../../src/lib/toast";
import { C, F, press } from "../../../src/theme";

type Tab = "config" | "players" | "scorers";
const POLL_MS = 15000;

export default function TournamentBracket() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("config");
  // Only meaningful once the bracket is showing: the tab row stays pinned
  // below the bracket, and tapping a tab opens its panel as a bottom-sheet
  // overlay instead of squeezing the bracket for space.
  const [panelOpen, setPanelOpen] = useState(false);
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
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Cache of live/finished matches keyed by matchId, used to render bracket
  // cell scores. A ref (not just state) so reload() can check "have we
  // already fetched this finished match's score?" without reload itself
  // depending on — and being torn down/recreated by — the state it writes.
  const liveMatchesRef = useRef<Map<string, MatchRecord>>(new Map());
  const [liveMatches, setLiveMatches] = useState<Map<string, MatchRecord>>(new Map());

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const { tournament: t, entrants: ents, bracket: b0 } = await getTournament(id);

      // Fetch every cell that either (a) is still unresolved — it might have
      // just finished, or its live score changed — or (b) just finished and
      // we haven't fetched its final score yet. A finished cell's score
      // never changes again, so once cached it's never re-fetched. Checked
      // in parallel rather than one cell at a time — a sequential
      // await-per-cell loop turns a bracket with several unresolved matches
      // into that many stacked network round trips.
      const toFetch = b0.filter(
        (cell) => cell.matchId && (!cell.winnerEntrant || !liveMatchesRef.current.has(cell.matchId))
      );
      const fetched = await Promise.all(toFetch.map((cell) => getMatch(cell.matchId!)));
      const toReconcile: { cell: BracketMatch; match: MatchRecord }[] = [];
      toFetch.forEach((cell, i) => {
        const m = fetched[i];
        if (!m) return;
        liveMatchesRef.current.set(cell.matchId!, m);
        if (!cell.winnerEntrant) toReconcile.push({ cell, match: m });
      });
      setLiveMatches(new Map(liveMatchesRef.current));

      // Reconcile: any cell whose linked match has completed advances the winner.
      let changed = false;
      await Promise.all(toReconcile.map(async ({ cell, match: m }) => {
        if (m.status !== "live" && m.winner) {
          const winnerEntrant = m.winner === "A" ? cell.entrantA : cell.entrantB;
          if (winnerEntrant) {
            await finishBracketMatch(cell.id, winnerEntrant);
            changed = true;
          }
        }
      }));

      // Only re-fetch the full tournament if reconciliation actually
      // changed something — the common case (nothing to advance) skips a
      // second redundant getTournament call entirely.
      if (changed) {
        const fresh = await getTournament(id);
        setTournament(fresh.tournament);
        setEntrants(fresh.entrants);
        setBracket(fresh.bracket);
      } else {
        setTournament(t);
        setEntrants(ents);
        setBracket(b0);
      }

      const [club, staffRole] = await Promise.all([getClub(t.clubId), myStaffRole(id)]);
      setClubRole(club?.role ?? null);
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
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const interval = setInterval(() => { void reload(); }, POLL_MS);
      return () => clearInterval(interval);
    }, [reload])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const liveScores = useMemo(
    () => new Map<string, BracketLiveScore>(
      [...liveMatches].map(([mid, m]) => [mid, { status: m.status, scoreSummary: m.score_summary }])
    ),
    [liveMatches]
  );

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
    setStarting(true);
    try {
      await startTournament(id);
      reload();
    } catch (e) {
      toast((e as Error).message || "Could not start the tournament", "error");
    } finally {
      setStarting(false);
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

  const tabContent =
    tab === "config" ? (
      <TournamentConfigTab
        tournament={tournament}
        isAdmin={isAdmin}
        isDraft={!!isDraft}
        blocker={blocker}
        starting={starting}
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
    );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
      <Stack.Screen
        options={{
          // Trigger only. The menu Sheet is mounted in the body below: a Sheet
          // rendered here would position against the header and be clipped.
          headerRight: isAdmin ? () => <MenuButton onPress={() => setMenuOpen(true)} /> : undefined,
        }}
      />
      <View style={s.titleRow}>
        <Text style={s.titleText}>{tournament.name}</Text>
        {!isDraft ? (
          <PressableScale style={s.refreshBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color={C.text2} />
              : <Icon name="sync-outline" color={C.text2} size={16} />}
          </PressableScale>
        ) : null}
      </View>
      {champName ? (
        <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
      ) : null}

      {!isDraft ? (
        <>
          <View style={{ flex: 1, marginBottom: 8 }}>
            <BracketView bracket={bracket} entrants={entrants} onCellPress={onCellPress} liveScores={liveScores} />
          </View>

          <View style={s.tabRow}>
            {(["config", "players", "scorers"] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => { setTab(t); setPanelOpen(true); }}
                style={({ pressed }) => [s.tabBtn, pressed && press]}
              >
                <Text style={s.tabText}>{t[0].toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
            {isAdmin ? (
              <Pressable
                onPress={() => router.push(`/tournaments/ops/${id}`)}
                style={({ pressed }) => [s.tabBtn, pressed && press]}
              >
                <Icon name="cog" color={C.text2} size={16} />
                <Text style={s.tabText}>Ops</Text>
              </Pressable>
            ) : null}
          </View>

          <BottomPanel
            visible={panelOpen}
            title={tab[0].toUpperCase() + tab.slice(1)}
            onClose={() => setPanelOpen(false)}
          >
            {tabContent}
          </BottomPanel>
        </>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <View style={s.tabRow}>
            {(["config", "players", "scorers"] as Tab[]).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={({ pressed }) => [s.tabBtn, pressed && press, tab === t && s.tabOn]}>
                <Text style={[s.tabText, tab === t && s.tabTextOn]}>{t[0].toUpperCase() + t.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          {tabContent}
        </ScrollView>
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
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  titleText: { color: C.text, fontFamily: F.bold, fontSize: 18 },
  refreshBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: C.card },
  tabRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  tabOn: { borderColor: C.red, backgroundColor: "rgba(255,59,48,0.12)" },
  tabText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  tabTextOn: { color: C.text },
});
