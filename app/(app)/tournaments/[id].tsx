import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  deleteTournament, finishBracketMatch, readTournament, refreshTournament,
  startBracketMatch, startTournament,
  type MatchType, type TournamentRow,
} from "../../../src/repos/tournamentRepo";
import { getMatch, type MatchRecord } from "../../../src/repos/matchRepo";
import { getClub } from "../../../src/repos/clubRepo";
import type {
  TournamentJoinRequest, TournamentStaff,
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
import TournamentResultCard from "../../../src/components/share/TournamentResultCard";
import { captureAndShare } from "../../../src/lib/share/captureAndShare";
import { toast } from "../../../src/lib/toast";
import { C, F, press, selected } from "../../../src/theme";

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
  const shareCardRef = useRef<View>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Cache of live/finished matches keyed by matchId, used to render bracket
  // cell scores. A ref (not just state) so reload() can check "have we
  // already fetched this finished match's score?" without reload itself
  // depending on — and being torn down/recreated by — the state it writes.
  const liveMatchesRef = useRef<Map<string, MatchRecord>>(new Map());
  const [liveMatches, setLiveMatches] = useState<Map<string, MatchRecord>>(new Map());

  // Guards every setState against a chain that resolves after a newer focus
  // (or after unmount) has already started.
  const epochRef = useRef(0);

  const reload = useCallback(async () => {
    if (!id) return;
    const epoch = ++epochRef.current;

    // Paint from cache first — zero network. Null only on a first-ever open,
    // where the existing loading state still applies.
    const cached = await readTournament(id);
    if (cached && epoch === epochRef.current) {
      setTournament(cached.tournament);
      setEntrants(cached.entrants);
      setBracket(cached.bracket);
    }

    try {
      const full = await refreshTournament(id);
      if (!full || epoch !== epochRef.current) return;
      const { tournament: t, entrants: ents, bracket: b0 } = full;
      setStaff(full.staff);
      setRequests(full.requests);
      setIsTournamentAdmin(full.myStaffRole === "admin");

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

      // Only re-fetch if reconciliation actually advanced something — the
      // common case (nothing to advance) skips a second redundant RPC.
      if (changed) {
        const fresh = await refreshTournament(id);
        if (fresh && epoch === epochRef.current) {
          setTournament(fresh.tournament);
          setEntrants(fresh.entrants);
          setBracket(fresh.bracket);
        }
      } else if (epoch === epochRef.current) {
        setTournament(t);
        setEntrants(ents);
        setBracket(b0);
      }

      // getClub is a local cache read, so this costs no network.
      const club = await getClub(t.clubId);
      if (epoch !== epochRef.current) return;
      setClubRole(club?.role ?? null);
    } catch (e) {
      // Cached data stays on screen. Silent on the automatic refresh —
      // tournaments/index.tsx sets the precedent that a failed read must not
      // blank data already showing. onRefresh below toasts explicitly.
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      const interval = setInterval(() => { void reload(); }, POLL_MS);
      return () => {
        clearInterval(interval);
        epochRef.current += 1;
      };
    }, [reload])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const full = await refreshTournament(id!);
      if (full) {
        setTournament(full.tournament);
        setEntrants(full.entrants);
        setBracket(full.bracket);
        setStaff(full.staff);
        setRequests(full.requests);
        setIsTournamentAdmin(full.myStaffRole === "admin");
      }
    } catch (e) {
      // Explicit user action, so unlike the automatic refresh this one reports.
      toast((e as Error).message || "Could not refresh", "error");
    } finally {
      setRefreshing(false);
    }
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

  // Memoised together: these ran on every render, including two more Math.max
  // sweeps and two linear finds over the entrant list, and the 15s poll made
  // that a timer-driven cost even when nothing had changed.
  const { champ, champName, runnerUpName } = useMemo(() => {
    const c = bracketStatus(bracket).champion;
    const maxR = bracket.length ? Math.max(...bracket.map((m) => m.round)) : 0;
    const finalMatch = bracket.find((m) => m.round === maxR && m.index === 0);
    const runnerUpId = finalMatch && c
      ? (finalMatch.entrantA === c ? finalMatch.entrantB : finalMatch.entrantA)
      : null;
    const nameOf = new Map(entrants.map((e) => [e.id, e.name]));
    return {
      champ: c,
      champName: c ? nameOf.get(c) ?? null : null,
      runnerUpName: runnerUpId ? nameOf.get(runnerUpId) ?? "Runner-up" : "TBD",
    };
  }, [bracket, entrants]);
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

  // Built the active tab's entire element tree on every render, so
  // TournamentPlayersTab and friends were reconstructed on every 15s poll tick
  // even with the bottom sheet closed.
  //
  // The gate is `panelOpen || isDraft`, NOT `panelOpen` alone: the draft branch
  // renders this inline in a ScrollView with no panel at all, so gating on
  // panelOpen would blank the entire pre-start setup screen.
  const tabContent = !(panelOpen || isDraft) ? null :
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
        <>
          <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
          <PressableScale style={s.shareButton} onPress={() => void captureAndShare(shareCardRef)}>
            <Icon name="share-social-outline" size={18} color={C.text} />
            <Text style={s.shareButtonText}>Share Champion Card</Text>
          </PressableScale>
          <View ref={shareCardRef} collapsable={false} style={s.offscreenCard}>
            <TournamentResultCard
              tournamentName={tournament.name}
              date={tournament.createdAt}
              champion={{ name: champName }}
              runnerUp={{ name: runnerUpName }}
            />
          </View>
        </>
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
  tabOn: selected,
  tabText: { color: C.text2, fontFamily: F.semibold, fontSize: 14 },
  tabTextOn: { color: C.text },
  shareButton: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
    alignSelf: "flex-start", marginBottom: 8,
  },
  shareButtonText: { color: C.text, fontSize: 14, fontWeight: "700" },
  offscreenCard: { position: "absolute", top: -3000, left: 0 },
});
