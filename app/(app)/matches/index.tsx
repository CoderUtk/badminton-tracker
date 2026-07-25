import React, { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { endMatchEarly, listMatches, MatchRecord, replayMatch } from "../../../src/repos/matchRepo";
import type { TeamId } from "../../../src/engine";
import { syncNow } from "../../../src/sync/runner";
import Icon from "../../../src/components/Icon";
import { C, F, glow, textGlow } from "../../../src/theme";

/** A completed match's per-game scores, or a live snapshot from replaying its log. */
type Row = MatchRecord & {
  live?: { score: Record<TeamId, number>; game: number; gamesWon: Record<TeamId, number> };
};

function relDate(ms: number): string {
  const d = new Date(ms);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t0.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return `Today · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
const format = (m: MatchRecord) =>
  `${m.config.matchType === "singles" ? "Singles" : "Doubles"} · ${m.config.pointsToWin} pts${m.config.bestOf === 3 ? " · Bo3" : ""}`;

export default function Matches() {
  const router = useRouter();
  const [live, setLive] = useState<Row[]>([]);
  const [done, setDone] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await listMatches();
    const rows: Row[] = await Promise.all(
      list.map(async (m) => {
        if (m.status !== "live") return m;
        const st = await replayMatch(m.id);
        return st ? { ...m, live: { score: st.score, game: st.game, gamesWon: st.gamesWon } } : m;
      })
    );
    setLive(rows.filter((m) => m.status === "live"));
    setDone(rows.filter((m) => m.status !== "live"));
  }, []);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const endLive = (m: Row) => {
    Alert.alert("End match?", "Finish now and save the current score to history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End match",
        style: "destructive",
        onPress: async () => {
          const state = await replayMatch(m.id);
          if (state) await endMatchEarly(m.id, state);
          void syncNow();
          void reload();
        },
      },
    ]);
  };

  // Distinct player names across all matches, for the opponent filter.
  const players = useMemo(() => {
    const set = new Set<string>();
    for (const m of [...live, ...done]) {
      for (const p of [...m.side_a, ...m.side_b]) set.add(p.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [live, done]);

  const has = (m: Row) => !filter || [...m.side_a, ...m.side_b].some((p) => p.name === filter);
  const fLive = live.filter(has);
  const fDone = done.filter(has);
  const sections = [
    ...(fLive.length ? [{ title: "Live now", data: fLive }] : []),
    ...(fDone.length ? [{ title: "Completed", data: fDone }] : []),
  ];

  const TeamLine = ({ m, team }: { m: Row; team: TeamId }) => {
    const side = team === "A" ? m.side_a : m.side_b;
    const won = m.winner === team;
    const games = m.score_summary?.games ?? [];
    return (
      <View style={s.teamLine}>
        {won && <Icon name="trophy" color={C.green} size={16} />}
        <Text style={[s.teamName, won && s.teamWon]} numberOfLines={1}>
          {names(side)}
        </Text>
        {m.live ? (
          <View style={s.scoreCells}>
            {m.live.gamesWon[team] > 0 && <Text style={s.gamesWonPill}>{m.live.gamesWon[team]}</Text>}
            <Text style={s.liveScore}>{m.live.score[team]}</Text>
          </View>
        ) : (
          <View style={s.scoreCells}>
            {games.map((g, i) => {
              const mine = team === "A" ? g.A : g.B;
              const gameWon = team === "A" ? g.A > g.B : g.B > g.A;
              return (
                <Text key={i} style={[s.gameCell, gameWon && s.gameCellWon]}>{mine}</Text>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {players.length > 1 && (
        <View style={s.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            <Pressable style={[s.fChip, !filter && s.fChipOn]} onPress={() => setFilter(null)}>
              <Text style={[s.fChipText, !filter && s.fChipTextOn]}>All players</Text>
            </Pressable>
            {players.map((name) => (
              <Pressable key={name} style={[s.fChip, filter === name && s.fChipOn]} onPress={() => setFilter(filter === name ? null : name)}>
                <Text style={[s.fChipText, filter === name && s.fChipTextOn]}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={sections.length ? s.list : s.emptyWrap}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          filter ? (
            <View style={s.emptyBox}>
              <Icon name="badminton" color={C.text2} size={40} />
              <Text style={s.emptyTitle}>No matches for {filter}</Text>
              <Pressable style={s.emptyCta} onPress={() => setFilter(null)}>
                <Text style={s.emptyCtaText}>Show all</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.emptyBox}>
              <Icon name="badminton" color={C.text2} size={48} />
              <Text style={s.emptyTitle}>No matches yet</Text>
              <Text style={s.emptyText}>Start one from the Home tab and it’ll show up here.</Text>
              <Pressable style={s.emptyCta} onPress={() => router.push("/new-match")}>
                <Icon name="play" color={C.text} size={18} />
                <Text style={s.emptyCtaText}>Start a match</Text>
              </Pressable>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isLive = item.status === "live";
          return (
            <Pressable
              style={[s.card, isLive && s.cardLive]}
              onPress={() => (isLive ? router.push(`/score/${item.id}`) : router.push(`/matches/${item.id}`))}
            >
              <View style={s.cardTop}>
                <Text style={s.format}>{format(item)}</Text>
                {isLive
                  ? <View style={s.liveBadge}><Text style={s.liveBadgeText}>● LIVE · Game {item.live?.game ?? 1}</Text></View>
                  : <Text style={s.date}>{relDate(item.created_at)}</Text>}
              </View>

              <TeamLine m={item} team="A" />
              <View style={s.divider} />
              <TeamLine m={item} team="B" />

              {isLive && (
                <View style={s.actions}>
                  <Pressable style={s.resume} onPress={() => router.push(`/score/${item.id}`)}>
                    <Icon name="play" color={C.bg} size={16} />
                    <Text style={s.resumeText}>Resume</Text>
                  </Pressable>
                  <Pressable style={s.stop} onPress={() => endLive(item)}>
                    <Icon name="stop" color={C.red} size={16} />
                    <Text style={s.stopText}>End</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  filterBar: { paddingTop: 12, paddingBottom: 4 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  fChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  fChipOn: { backgroundColor: C.red, borderColor: C.red },
  fChipText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  fChipTextOn: { color: C.text },
  list: { padding: 16, paddingBottom: 32 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", padding: 24 },

  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  sectionTitle: { color: C.text, fontSize: 18, fontFamily: F.display, letterSpacing: 0.5 },
  sectionCount: { color: C.text2, fontSize: 14, fontWeight: "800", backgroundColor: C.card, minWidth: 26, textAlign: "center", borderRadius: 13, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },

  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  cardLive: { borderColor: C.green, ...glow(C.green, 12, 0.35) },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  format: { color: C.text2, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  date: { color: C.text2, fontSize: 12, fontWeight: "600" },
  liveBadge: { backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  liveBadgeText: { color: C.green, fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  teamLine: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 30 },
  teamName: { flex: 1, color: C.text, fontSize: 16, fontWeight: "700" },
  teamWon: { color: C.green, fontWeight: "900" },
  scoreCells: { flexDirection: "row", alignItems: "center", gap: 6 },
  gameCell: { color: C.text2, fontSize: 15, fontWeight: "700", minWidth: 24, textAlign: "center", fontVariant: ["tabular-nums"] },
  gameCellWon: { color: C.text, fontWeight: "900" },
  liveScore: { color: C.text, fontSize: 24, fontFamily: F.display, minWidth: 34, textAlign: "right", fontVariant: ["tabular-nums"], ...textGlow(C.green, 10) },
  gamesWonPill: { color: C.bg, backgroundColor: C.green, fontSize: 12, fontWeight: "900", minWidth: 20, textAlign: "center", borderRadius: 10, paddingVertical: 1, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 4 },

  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  resume: { flex: 1, flexDirection: "row", gap: 6, backgroundColor: C.green, borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" },
  resumeText: { color: C.bg, fontWeight: "900", fontSize: 15 },
  stop: { flex: 1, flexDirection: "row", gap: 6, backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.red, borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" },
  stopText: { color: C.red, fontWeight: "900", fontSize: 15 },

  emptyBox: { alignItems: "center", gap: 8 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: "900", marginTop: 4 },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 8 },
  emptyCta: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 14, minHeight: 52, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { color: C.text, fontSize: 17, fontWeight: "800" },
});
