import React, { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { generateMatchups, type GeneratedMatch, type MatchMode } from "../../../src/matchmaking/generator";
import { listMatchesForSession, replayMatch, type MatchRecord } from "../../../src/repos/matchRepo";
import type { TeamId } from "../../../src/engine";
import {
  deleteSession, endSession, getSession, getSessionStats, listAttendance, setAttendance, updateSessionStatus,
  type Attendance, type ClubSession, type SessionStats,
} from "../../../src/repos/sessionRepo";
import { getClub, listMyClubPlayers } from "../../../src/repos/clubRepo";
import AppDialog from "../../../src/components/AppDialog";
import Icon from "../../../src/components/Icon";
import Chip from "../../../src/components/Chip";
import Sheet from "../../../src/components/Sheet";
import SegmentedControl from "../../../src/components/SegmentedControl";
import SessionResultCard from "../../../src/components/share/SessionResultCard";
import { captureAndShare } from "../../../src/lib/share/captureAndShare";
import { avatarMap, preloadAvatars } from "../../../src/lib/share/avatars";
import { topStandings } from "../../../src/lib/share/cardData";
import { C, selected, selectedText, space } from "../../../src/theme";
import { toast } from "../../../src/lib/toast";
import { useSession } from "../../../src/stores/session";

type Tab = "attendance" | "games";
type MatchRow = MatchRecord & { live?: Record<TeamId, number> };

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session: authSession } = useSession();
  const [session, setSession] = useState<ClubSession | null>(null);
  const [attendance, setAttendanceRows] = useState<Attendance[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string | null>>({});
  const [round, setRound] = useState(0);
  const [matchups, setMatchups] = useState<GeneratedMatch[]>([]);
  const [tab, setTab] = useState<Tab>("attendance");
  const [genMode, setGenMode] = useState<MatchMode>("doubles");
  const [clubRole, setClubRole] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualPicks, setManualPicks] = useState<Attendance[]>([]);
  const [manualCourts, setManualCourts] = useState<{ teamA: Attendance[]; teamB: Attendance[] }[]>([]);
  const shareCardRef = useRef<View>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const next = await getSession(id);
    setSession(next);
    if (next) {
      const club = await getClub(next.club_id);
      setClubRole(club?.role ?? null);
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
      if (next.status === "done") {
        setTab("games");
        setAvatarUrls(avatarMap(await listMyClubPlayers()));
      }
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

  const manualUsedIds = new Set(manualCourts.flatMap((c) => [...c.teamA, ...c.teamB]).map((p) => p.id));

  const pickManualPlayer = (p: Attendance) => {
    if (manualUsedIds.has(p.id)) return;
    if (manualPicks.some((x) => x.id === p.id)) {
      setManualPicks(manualPicks.filter((x) => x.id !== p.id));
      return;
    }
    if (manualPicks.length >= 4) return;
    setManualPicks([...manualPicks, p]);
  };
  const addManualCourt = () => {
    if (manualPicks.length !== 4) return;
    setManualCourts([...manualCourts, { teamA: manualPicks.slice(0, 2), teamB: manualPicks.slice(2, 4) }]);
    setManualPicks([]);
  };
  const removeManualCourt = (i: number) => setManualCourts(manualCourts.filter((_, idx) => idx !== i));

  const buildRound = () => {
    if (!session) return;
    const remainingPlayers = checkedIn.filter((p) => !manualUsedIds.has(p.id));
    const remainingCourts = Math.max(0, session.courts - manualCourts.length);
    const autoResult = remainingCourts > 0
      ? generateMatchups(remainingPlayers, remainingCourts, matchups, round, effectiveMode)
      : { matches: [] };
    const manualMatches: GeneratedMatch[] = manualCourts.map((c, i) => ({
      court: i + 1, mode: "doubles", teamA: c.teamA, teamB: c.teamB,
    }));
    const autoMatches: GeneratedMatch[] = autoResult.matches.map((m, i) => ({ ...m, court: manualCourts.length + i + 1 }));
    const combined = [...manualMatches, ...autoMatches];
    if (combined.length === 0) {
      const need = effectiveMode === "singles" ? 2 : 4;
      toast(`Check in at least ${need} players to build a ${effectiveMode} court.`, "info");
      return;
    }
    setMatchups(combined);
    setRound((value) => value + 1);
    setTab("games");
    setManualCourts([]);
    setManualPicks([]);
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
  const shareSummary = async () => {
    if (!stats) return;
    const top = topStandings(stats.players, 3);
    await preloadAvatars(top.map((p) => avatarUrls[p.id]));
    await captureAndShare(shareCardRef);
  };
  const finishSession = () => setConfirmingFinish(true);
  const onConfirmFinish = async () => {
    setConfirmingFinish(false);
    if (!session) return;
    await endSession(session.id);
    await reload();
  };
  const openMatch = (m: MatchRecord) =>
    m.status === "live" ? router.push(`/score/${m.id}`) : router.push(`/matches/${m.id}`);
  const onDeleteSession = async () => {
    if (!session) return;
    setConfirmingDelete(false);
    try {
      await deleteSession(session.id);
      router.back();
    } catch (e) {
      toast((e as Error).message || "Could not delete session", "error");
    }
  };

  if (!session) return <View style={s.center}><Text style={s.muted}>Session not found.</Text></View>;
  const isCreator = !!authSession && authSession.user.id === session.created_by;
  const done = session.status === "done";
  const showAttendance = tab === "attendance" && !done;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={s.root}
        contentContainerStyle={s.content}
        data={showAttendance ? attendance : []}
        keyExtractor={(player) => player.id}
        ListHeaderComponent={
        <>
          <View style={s.hero}>
            {isCreator && (
              <Pressable style={s.deleteIconBtn} accessibilityLabel="Delete session" hitSlop={10} onPress={() => setConfirmingDelete(true)}>
                <Icon name="trash-outline" color={C.red} size={17} />
              </Pressable>
            )}
            <Text style={s.eyebrow}>{session.status.toUpperCase()} · {session.courts} {session.courts === 1 ? "COURT" : "COURTS"}</Text>
            <Text style={[s.title, isCreator && s.titleWithBtn]}>{session.location || "Badminton session"}</Text>
            <Text style={s.date}>{new Date(session.starts_at).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
            {!done && (
              <View style={s.actions}>
                {session.status === "scheduled" && (
                  <Pressable style={[s.action, s.actionPrimary]} onPress={() => updateSessionStatus(session.id, "live").then(reload)}>
                    <Icon name="play" color={C.text} size={17} /><Text style={s.actionText}>Start</Text>
                  </Pressable>
                )}
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
              <Pressable style={s.shareBtn} onPress={() => void shareSummary()}>
                <Icon name="trophy-outline" color={C.text} size={17} />
                <Text style={s.shareText}>Share to story</Text>
              </Pressable>
            </View>
          )}
          {done && stats && (
            <View ref={shareCardRef} collapsable={false} style={s.offscreenCard}>
              <SessionResultCard session={session} stats={stats} avatarUrls={avatarUrls} />
            </View>
          )}

          {/* Sub-tabs — real navigation between attendance and games, so it
              uses the same shared control as every other tab switch in the
              app (audit M9: this used to share a visual style with the mode
              toggle below, which is a different kind of control). */}
          {!done && (
            <View style={{ marginTop: 6 }}>
              <SegmentedControl
                options={[
                  { label: `Attendance · ${checkedIn.length}`, value: "attendance" as Tab },
                  { label: `Games · ${matches.length}`, value: "games" as Tab },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
          )}

          {/* Games tab: generated round + this session's matches */}
          {tab === "games" && (
            <View style={{ gap: 8 }}>
              {!done && (
                <View style={s.modeToggleRow}>
                  <Chip label="Auto" isSelected={!manualMode} onPress={() => setManualMode(false)} />
                  <Chip
                    label="Manual pair"
                    isSelected={manualMode}
                    onPress={() => setManualMode(true)}
                    disabled={!canDoubles}
                  />
                </View>
              )}
              {!done && manualMode && (
                <View style={s.manualBox}>
                  <Text style={s.hint}>Tap two players for Team A, two for Team B.</Text>
                  <View style={s.manualTeamRow}>
                    {[0, 1].map((i) => (
                      <View key={i} style={[s.manualSlot, manualPicks[i] && s.manualSlotOn]}>
                        <Text style={[s.manualSlotText, manualPicks[i] && s.manualSlotTextOn]}>{manualPicks[i]?.name ?? "Team A"}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={s.vs}>vs</Text>
                  <View style={s.manualTeamRow}>
                    {[2, 3].map((i) => (
                      <View key={i} style={[s.manualSlot, manualPicks[i] && s.manualSlotOn]}>
                        <Text style={[s.manualSlotText, manualPicks[i] && s.manualSlotTextOn]}>{manualPicks[i]?.name ?? "Team B"}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    style={[s.addCourtBtn, manualPicks.length !== 4 && s.modeDisabled]}
                    disabled={manualPicks.length !== 4}
                    onPress={addManualCourt}
                  >
                    <Text style={s.addCourtText}>Add to round</Text>
                  </Pressable>
                  {manualCourts.length > 0 && (
                    <View style={{ gap: 6 }}>
                      {manualCourts.map((c, i) => (
                        <Pressable key={i} style={s.manualCourtRow} onPress={() => removeManualCourt(i)}>
                          <Text style={s.manualCourtText} numberOfLines={1}>
                            Court {i + 1}: {c.teamA.map((p) => p.name).join(" & ")} vs {c.teamB.map((p) => p.name).join(" & ")}
                          </Text>
                          <Icon name="close" color={C.text2} size={16} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Text style={s.boardHead}>Checked in</Text>
                  <View style={s.chips}>
                    {checkedIn.map((p) => {
                      const used = manualUsedIds.has(p.id);
                      const picked = manualPicks.some((x) => x.id === p.id);
                      return (
                        <Pressable
                          key={p.id}
                          disabled={used}
                          style={[s.playerChip, picked && s.playerChipOn, used && s.modeDisabled]}
                          onPress={() => pickManualPlayer(p)}
                        >
                          <Text style={[s.playerChipText, picked && s.playerChipTextOn]}>{p.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              {!done && (
                <View style={s.modeRow}>
                  <View style={{ flex: 1 }}>
                    <SegmentedControl
                      options={[
                        { label: "Doubles", value: "doubles" as MatchMode, disabled: !canDoubles },
                        { label: "Singles", value: "singles" as MatchMode },
                      ]}
                      value={effectiveMode}
                      onChange={setGenMode}
                    />
                  </View>
                  <Pressable style={s.genBtn} onPress={buildRound}>
                    <Icon name="shuffle-variant" color={C.text} size={16} />
                    <Text style={s.genText}>{manualCourts.length > 0 ? "Generate rest" : "Generate"}</Text>
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
            {(["in", "maybe", "out"] as const).map((status) => {
              const label = status === "in" ? "In" : status === "maybe" ? "Maybe" : "Out";
              return (
                <Chip
                  key={status}
                  label={label}
                  isSelected={item.status === status}
                  onPress={() => mark(item, status)}
                  accessibilityLabel={`${label}, ${item.name}`}
                  style={s.attendanceChip}
                />
              );
            })}
          </View>
        </View>
      )}
      />
      {isCreator && (
        <Sheet
          visible={confirmingDelete}
          title="Delete session?"
          message={`This permanently deletes "${session.location || "this session"}". Matches already played stay in history.`}
          actions={[
            { label: "Delete", onPress: onDeleteSession, destructive: true },
            { label: "Cancel", onPress: () => setConfirmingDelete(false) },
          ]}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
      <AppDialog
        visible={confirmingFinish}
        title="Finish session?"
        message={
          liveCount > 0
            ? `This will also end ${liveCount} live ${liveCount === 1 ? "match" : "matches"} and save their current scores.`
            : "Wrap up this session and see the summary."
        }
        confirmLabel="Finish"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirmFinish}
        onCancel={() => setConfirmingFinish(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 16, paddingBottom: 34, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }, muted: { color: C.text2, paddingVertical: 8 },
  hero: { backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 5, borderWidth: 1, borderColor: C.line, position: "relative" },
  deleteIconBtn: {
    position: "absolute", top: 14, right: 14, zIndex: 1,
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line,
  },
  eyebrow: { color: C.red, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }, title: { color: C.text, fontSize: 23, fontWeight: "900" }, titleWithBtn: { paddingRight: 44 }, date: { color: C.text2, fontSize: 14 },
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
  offscreenCard: { position: "absolute", top: -3000, left: 0 },
  modeToggleRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
  modeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  modeDisabled: { opacity: 0.4 },
  genBtn: { flex: 1, flexDirection: "row", gap: 6, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  genText: { color: C.text, fontWeight: "800", fontSize: 14 },
  hint: { color: C.text2, fontSize: 12, lineHeight: 17 },
  manualBox: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, gap: 8 },
  manualTeamRow: { flexDirection: "row", gap: 8 },
  manualSlot: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line, borderStyle: "dashed" },
  manualSlotOn: { ...selected, borderStyle: "solid" },
  manualSlotText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  manualSlotTextOn: selectedText,
  addCourtBtn: { minHeight: 42, borderRadius: 10, backgroundColor: C.redDeep, alignItems: "center", justifyContent: "center" },
  addCourtText: { color: C.text, fontWeight: "800", fontSize: 14 },
  manualCourtRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.cardHi, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  manualCourtText: { flex: 1, color: C.text, fontSize: 13, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  playerChip: { minHeight: 36, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: 18, backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line },
  playerChipOn: selected,
  playerChipText: { color: C.text, fontWeight: "700", fontSize: 13 },
  playerChipTextOn: selectedText,
  games: { gap: 8, marginVertical: 4 }, gameCard: { backgroundColor: "#211819", borderColor: "#5B2524", borderWidth: 1, padding: 14, borderRadius: 14, gap: 3 }, court: { color: C.red, fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, teams: { color: C.text, fontSize: 16, fontWeight: "800" }, vs: { color: C.text2, fontSize: 13 }, scoreButton: { alignSelf: "flex-start", flexDirection: "row", gap: 6, marginTop: 7, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 9, backgroundColor: C.red, alignItems: "center" }, scoreText: { color: C.text, fontWeight: "900", fontSize: 13 },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: C.line }, matchTeams: { color: C.text, fontSize: 15, fontWeight: "700" }, matchMeta: { color: C.text2, fontSize: 13, marginTop: 2 }, matchLive: { color: C.green, fontWeight: "800", fontSize: 12 }, matchDone: { color: C.text2, fontWeight: "800" },
  playerRow: { minHeight: 66, paddingVertical: 9, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: 10 }, avatar: { height: 34, width: 34, borderRadius: 17, backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" }, avatarIn: { backgroundColor: C.red }, avatarText: { color: C.text, fontWeight: "900" }, playerName: { flex: 1, color: C.text, fontSize: 16, fontWeight: "700" }, attendanceActions: { flexDirection: "row", gap: space.sm },
  // Sizing, selected styling and accessibilityState all live in Chip. This
  // only tightens horizontal padding so three chips fit a 360dp row.
  attendanceChip: { paddingHorizontal: space.sm },
});
