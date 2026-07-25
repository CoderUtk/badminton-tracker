import React, { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { generateMatchups, type GeneratedMatch, type MatchMode } from "../../../src/matchmaking/generator";
import { listMatchesForSession, replayMatch, type MatchRecord } from "../../../src/repos/matchRepo";
import type { TeamId } from "../../../src/engine";
import {
  endSession, getSession, getSessionStats, listAttendance, setAttendance, updateSessionStatus,
  type Attendance, type ClubSession, type SessionStats,
} from "../../../src/repos/sessionRepo";
import Icon from "../../../src/components/Icon";
import { C } from "../../../src/theme";

type Tab = "attendance" | "games";
type MatchRow = MatchRecord & { live?: Record<TeamId, number> };

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<ClubSession | null>(null);
  const [attendance, setAttendanceRows] = useState<Attendance[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [round, setRound] = useState(0);
  const [matchups, setMatchups] = useState<GeneratedMatch[]>([]);
  const [tab, setTab] = useState<Tab>("attendance");
  const [genMode, setGenMode] = useState<MatchMode>("doubles");

  const reload = useCallback(async () => {
    if (!id) return;
    const next = await getSession(id);
    setSession(next);
    if (next) {
      setAttendanceRows(await listAttendance(next.id, next.club_id));
      const rows = await listMatchesForSession(next.id);
      // Attach a live score snapshot so paused/in-progress games show their
      // current score rather than "not started".
      setMatches(await Promise.all(rows.map(async (m): Promise<MatchRow> => {
        if (m.status !== "live") return m;
        const st = await replayMatch(m.id);
        return st ? { ...m, live: st.score } : m;
      })));
      setStats(next.status === "done" ? await getSessionStats(next.id) : null);
      if (next.status === "done") setTab("games");
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const mark = async (player: Attendance, status: Attendance["status"]) => {
    if (!session) return;
    await setAttendance(session.id, player.id, status);
    await reload();
  };
  const checkedIn = attendance.filter((player) => player.status === "in");
  const liveCount = matches.filter((m) => m.status === "live").length;
  const canDoubles = checkedIn.length >= 4;
  // Fall back to singles automatically when there aren't enough for doubles.
  const effectiveMode: MatchMode = canDoubles ? genMode : "singles";

  const buildRound = () => {
    if (!session) return;
    const need = effectiveMode === "singles" ? 2 : 4;
    if (checkedIn.length < need) {
      return Alert.alert(`Need ${need} players`, `Check in at least ${need} players to build a ${effectiveMode} court.`);
    }
    const result = generateMatchups(checkedIn, session.courts, matchups, round, effectiveMode);
    setMatchups(result.matches);
    setRound((value) => value + 1);
    setTab("games");
  };
  const launch = (match: GeneratedMatch) => {
    if (!session) return;
    router.push({
      pathname: "/new-match",
      params: {
        clubId: session.club_id,
        sessionId: session.id,
        teamA: match.teamA.map((p) => p.name).join(","),
        teamB: match.teamB.map((p) => p.name).join(","),
      },
    });
  };
  const finishSession = () => {
    if (!session) return;
    const note = liveCount > 0
      ? `This will also end ${liveCount} live ${liveCount === 1 ? "match" : "matches"} and save their current scores.`
      : "Wrap up this session and see the summary.";
    Alert.alert("Finish session?", note, [
      { text: "Cancel", style: "cancel" },
      { text: "Finish", style: "destructive", onPress: async () => { await endSession(session.id); await reload(); } },
    ]);
  };
  const openMatch = (m: MatchRecord) =>
    m.status === "live" ? router.push(`/score/${m.id}`) : router.push(`/matches/${m.id}`);

  if (!session) return <View style={s.center}><Text style={s.muted}>Session not found.</Text></View>;
  const done = session.status === "done";
  const showAttendance = tab === "attendance" && !done;

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={s.content}
      data={showAttendance ? attendance : []}
      keyExtractor={(player) => player.id}
      ListHeaderComponent={
        <>
          <View style={s.hero}>
            <Text style={s.eyebrow}>{session.status.toUpperCase()} · {session.courts} {session.courts === 1 ? "COURT" : "COURTS"}</Text>
            <Text style={s.title}>{session.location || "Badminton session"}</Text>
            <Text style={s.date}>{new Date(session.starts_at).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
            {!done && (
              <View style={s.actions}>
                {session.status === "scheduled" && (
                  <Pressable style={[s.action, s.actionPrimary]} onPress={() => updateSessionStatus(session.id, "live").then(reload)}>
                    <Icon name="play" color={C.text} size={17} /><Text style={s.actionText}>Start</Text>
                  </Pressable>
                )}
                <Pressable style={[s.action, s.actionGhost]} onPress={buildRound}>
                  <Icon name="shuffle-variant" color={C.text} size={17} /><Text style={s.actionText}>Generate</Text>
                </Pressable>
                <Pressable style={[s.action, s.actionFinish]} onPress={finishSession}>
                  <Icon name="flag" color={C.red} size={17} /><Text style={[s.actionText, { color: C.red }]}>Finish</Text>
                </Pressable>
              </View>
            )}
          </View>

          {done && stats && (
            <View style={s.summary}>
              <View style={s.summaryTitleRow}>
                <Icon name="trophy" color={C.red} size={20} />
                <Text style={s.summaryTitle}>Session summary</Text>
              </View>
              <View style={s.statRow}>
                <View style={s.statBox}><Text style={s.statNum}>{stats.matchCount}</Text><Text style={s.statLbl}>matches</Text></View>
                <View style={s.statBox}><Text style={s.statNum}>{stats.gameCount}</Text><Text style={s.statLbl}>games</Text></View>
                <View style={s.statBox}><Text style={s.statNum}>{stats.players.length}</Text><Text style={s.statLbl}>players</Text></View>
              </View>
              {stats.players.length > 0 && (
                <View style={s.board}>
                  <Text style={s.boardHead}>Leaderboard</Text>
                  {stats.players.map((p, i) => (
                    <View key={p.name} style={s.boardRow}>
                      {i === 0 ? <Icon name="trophy" color={C.amber} size={16} /> : <Text style={s.rank}>{i + 1}</Text>}
                      <Text style={s.boardName} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.boardWl}>{p.wins}W · {p.losses}L</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pressable style={s.shareBtn} onPress={() => Alert.alert("Coming soon", "Sharing a session card to your story is on the way.")}>
                <Icon name="trophy-outline" color={C.text} size={17} />
                <Text style={s.shareText}>Share to story (soon)</Text>
              </Pressable>
            </View>
          )}

          {/* Sub-tabs */}
          {!done && (
            <View style={s.seg}>
              {(["attendance", "games"] as Tab[]).map((t) => (
                <Pressable key={t} style={[s.segBtn, tab === t && s.segOn]} onPress={() => setTab(t)}>
                  <Icon name={t === "attendance" ? "people-outline" : "scoreboard-outline"} size={16} color={tab === t ? C.text : C.text2} />
                  <Text style={[s.segText, tab === t && s.segTextOn]}>
                    {t === "attendance" ? `Attendance · ${checkedIn.length}` : `Games · ${matches.length}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Games tab: generated round + this session's matches */}
          {tab === "games" && (
            <View style={{ gap: 8 }}>
              {!done && (
                <View style={s.modeRow}>
                  {(["doubles", "singles"] as MatchMode[]).map((mode) => {
                    const disabled = mode === "doubles" && !canDoubles;
                    const on = effectiveMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        disabled={disabled}
                        style={[s.modeBtn, on && s.modeOn, disabled && s.modeDisabled]}
                        onPress={() => setGenMode(mode)}
                      >
                        <Text style={[s.modeText, on && s.modeTextOn]}>
                          {mode === "doubles" ? "Doubles" : "Singles"}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={s.genBtn} onPress={buildRound}>
                    <Icon name="shuffle-variant" color={C.text} size={16} />
                    <Text style={s.genText}>Generate</Text>
                  </Pressable>
                </View>
              )}
              {matchups.length > 0 && (
                <View style={s.games}>
                  <Text style={s.sectionTitle}>Round {round}</Text>
                  {matchups.map((match) => (
                    <View key={match.court} style={s.gameCard}>
                      <Text style={s.court}>COURT {match.court} · {match.mode === "singles" ? "SINGLES" : "DOUBLES"}</Text>
                      <Text style={s.teams}>{match.teamA.map((p) => p.name).join(" & ")}</Text>
                      <Text style={s.vs}>vs</Text>
                      <Text style={s.teams}>{match.teamB.map((p) => p.name).join(" & ")}</Text>
                      <Pressable style={s.scoreButton} onPress={() => launch(match)}>
                        <Icon name="play" color={C.text} size={15} />
                        <Text style={s.scoreText}>Score this game</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {matches.length === 0 && matchups.length === 0 && (
                <Text style={s.muted}>No games yet. Check players in, then tap Generate.</Text>
              )}
              {matches.map((m) => (
                <Pressable key={m.id} style={s.matchRow} onPress={() => openMatch(m)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.matchTeams} numberOfLines={1}>
                      {m.side_a.map((p) => p.name).join(" / ")} vs {m.side_b.map((p) => p.name).join(" / ")}
                    </Text>
                    <Text style={s.matchMeta}>
                      {m.live
                        ? `In progress · ${m.live.A}–${m.live.B}`
                        : m.score_summary?.games.map((g) => `${g.A}–${g.B}`).join(", ") || "not started"}
                    </Text>
                  </View>
                  {m.status === "live"
                    ? <Text style={s.matchLive}>● LIVE</Text>
                    : m.winner
                    ? <Icon name="trophy" color={C.green} size={18} />
                    : <Text style={s.matchDone}>—</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </>
      }
      renderItem={({ item }) => (
        <View style={s.playerRow}>
          <View style={[s.avatar, item.status === "in" && s.avatarIn]}><Text style={s.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={s.playerName}>{item.name}</Text>
          <View style={s.attendanceActions}>
            {(["in", "maybe", "out"] as const).map((status) => (
              <Pressable key={status} onPress={() => mark(item, status)} style={[s.attendanceChip, item.status === status && s.attendanceChipOn]}>
                <Text style={[s.attendanceText, item.status === status && s.attendanceTextOn]}>{status === "in" ? "In" : status === "maybe" ? "Maybe" : "Out"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 16, paddingBottom: 34, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }, muted: { color: C.text2, paddingVertical: 8 },
  hero: { backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 5, borderWidth: 1, borderColor: C.line },
  eyebrow: { color: C.red, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }, title: { color: C.text, fontSize: 23, fontWeight: "900" }, date: { color: C.text2, fontSize: 14 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  action: { flex: 1, flexDirection: "row", gap: 6, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  actionPrimary: { backgroundColor: C.red },
  actionGhost: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  actionFinish: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.red },
  actionText: { color: C.text, fontWeight: "800", fontSize: 14 },
  summary: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: C.line, marginTop: 4 },
  summaryTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryTitle: { color: C.text, fontSize: 19, fontWeight: "900" },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: C.cardHi, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  statNum: { color: C.red, fontSize: 26, fontWeight: "900" }, statLbl: { color: C.text2, fontSize: 12, fontWeight: "700", marginTop: 2 },
  board: { gap: 2 }, boardHead: { color: C.text2, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 },
  boardRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rank: { color: C.text2, width: 24, textAlign: "center", fontWeight: "800", fontSize: 15 }, boardName: { flex: 1, color: C.text, fontSize: 15, fontWeight: "700" }, boardWl: { color: C.text2, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  shareBtn: { flexDirection: "row", gap: 8, backgroundColor: C.cardHi, borderRadius: 11, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line }, shareText: { color: C.text, fontWeight: "800" },
  seg: { flexDirection: "row", backgroundColor: C.card, borderRadius: 12, padding: 4, gap: 4, marginTop: 6 },
  segBtn: { flex: 1, flexDirection: "row", gap: 6, minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.red },
  segText: { color: C.text2, fontSize: 14, fontWeight: "700" }, segTextOn: { color: C.text },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
  modeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  modeBtn: { paddingHorizontal: 14, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  modeOn: { backgroundColor: C.red, borderColor: C.red },
  modeDisabled: { opacity: 0.4 },
  modeText: { color: C.text2, fontWeight: "800", fontSize: 14 },
  modeTextOn: { color: C.text },
  genBtn: { flex: 1, flexDirection: "row", gap: 6, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  genText: { color: C.text, fontWeight: "800", fontSize: 14 },
  games: { gap: 8, marginVertical: 4 }, gameCard: { backgroundColor: "#211819", borderColor: "#5B2524", borderWidth: 1, padding: 14, borderRadius: 14, gap: 3 }, court: { color: C.red, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, teams: { color: C.text, fontSize: 16, fontWeight: "800" }, vs: { color: C.text2, fontSize: 13 }, scoreButton: { alignSelf: "flex-start", flexDirection: "row", gap: 6, marginTop: 7, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 9, backgroundColor: C.red, alignItems: "center" }, scoreText: { color: C.text, fontWeight: "900", fontSize: 13 },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: C.line }, matchTeams: { color: C.text, fontSize: 15, fontWeight: "700" }, matchMeta: { color: C.text2, fontSize: 13, marginTop: 2 }, matchLive: { color: C.green, fontWeight: "800", fontSize: 12 }, matchDone: { color: C.text2, fontWeight: "800" },
  playerRow: { minHeight: 66, paddingVertical: 9, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 10 }, avatar: { height: 34, width: 34, borderRadius: 17, backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" }, avatarIn: { backgroundColor: C.red }, avatarText: { color: C.text, fontWeight: "900" }, playerName: { flex: 1, color: C.text, fontSize: 16, fontWeight: "700" }, attendanceActions: { flexDirection: "row", gap: 4 }, attendanceChip: { minWidth: 43, minHeight: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: C.card }, attendanceChipOn: { backgroundColor: C.red }, attendanceText: { color: C.text2, fontWeight: "700", fontSize: 12 }, attendanceTextOn: { color: C.text },
});
