import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { deleteClub, getClub, type Club } from "../../../src/repos/clubRepo";
import { getClubStats, type PlayerStat, type SessionStats } from "../../../src/repos/sessionRepo";
import { buildClubJoinPath } from "../../../src/lib/joinLink";
import { shareJoinLink } from "../../../src/lib/shareJoin";
import { toast } from "../../../src/lib/toast";
import Sheet from "../../../src/components/Sheet";
import MenuButton from "../../../src/components/MenuButton";
import { LogoMark } from "../../../src/components/Logo";
import { C, F } from "../../../src/theme";

function winPct(p: PlayerStat): string {
  return p.played ? `${Math.round((p.wins / p.played) * 100)}%` : "—";
}

export default function ClubDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    setClub(await getClub(id));
    setStats(await getClubStats(id));
  }, [id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const isAdmin = club?.role === "owner" || club?.role === "admin";
  // Owners only: deleting a club takes every member's history with it.
  const isOwner = club?.role === "owner";

  const onDeleteClub = async () => {
    setConfirmingDelete(false);
    if (!id) return;
    try {
      await deleteClub(id);
      router.replace("/");
    } catch (e) {
      toast((e as Error).message || "Could not delete club", "error");
    }
  };

  if (!club) return <View style={s.center}><Text style={s.muted}>Club not found.</Text></View>;

  return (
    <>
      {/* The clubs stack sets a global headerRight (the logo); a per-screen
          headerRight replaces it outright, so render both here. */}
      <Stack.Screen
        options={{
          headerRight: isOwner
            ? () => (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <MenuButton
                    actions={[{ label: "Delete club", destructive: true, onPress: () => setConfirmingDelete(true) }]}
                  />
                  <View style={{ paddingRight: 16 }}><LogoMark size={26} /></View>
                </View>
              )
            : undefined,
        }}
      />
    <FlatList
      style={s.root}
      contentContainerStyle={s.content}
      data={stats?.players ?? []}
      keyExtractor={(p) => p.name}
      ListHeaderComponent={
        <>
          <View style={s.hero}>
            <Text style={s.eyebrow}>CLUB</Text>
            <Text style={s.title}>{club.name}</Text>
            {club.invite_code ? <Text style={s.code}>Invite code · {club.invite_code}</Text> : null}
            <View style={s.statRow}>
              <View style={s.statBox}><Text style={s.statNum}>{stats?.matchCount ?? 0}</Text><Text style={s.statLbl}>matches</Text></View>
              <View style={s.statBox}><Text style={s.statNum}>{stats?.gameCount ?? 0}</Text><Text style={s.statLbl}>games</Text></View>
              <View style={s.statBox}><Text style={s.statNum}>{stats?.players.length ?? 0}</Text><Text style={s.statLbl}>players</Text></View>
            </View>
            <Pressable style={s.cta} onPress={() => router.push({ pathname: "/new-match", params: { clubId: club.id } })}>
              <Text style={s.ctaText}>▶  Start a match</Text>
            </Pressable>
            <Pressable
              style={s.secondary}
              onPress={() => shareJoinLink(buildClubJoinPath(club.id), `Join ${club.name} on CourtSide:`)}
            >
              <Text style={s.secondaryText}>Share join link</Text>
            </Pressable>
            <Pressable style={s.secondary} onPress={() => router.push(`/(app)/clubs/${club.id}/live`)}>
              <Text style={s.secondaryText}>Live now</Text>
            </Pressable>
            {isAdmin ? (
              <Pressable
                style={s.secondary}
                onPress={() => router.push(`/(app)/clubs/requests/${club.id}`)}
              >
                <Text style={s.secondaryText}>Pending requests</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={s.boardHeadRow}>
            <Text style={s.rank}>#</Text>
            <Text style={[s.boardName, s.colHead]}>Player</Text>
            <Text style={s.colHead}>W–L</Text>
            <Text style={[s.colHead, s.pctCol]}>Win%</Text>
          </View>
        </>
      }
      ListEmptyComponent={
        <Text style={s.empty}>No completed matches yet. Play some games and the leaderboard fills in here.</Text>
      }
      renderItem={({ item, index }) => (
        <View style={s.row}>
          <Text style={s.rank}>{index === 0 ? "🏆" : `${index + 1}`}</Text>
          <Text style={s.boardName} numberOfLines={1}>{item.name}</Text>
          <Text style={s.wl}>{item.wins}–{item.losses}</Text>
          <Text style={[s.pct, s.pctCol]}>{winPct(item)}</Text>
        </View>
      )}
    />
      <Sheet
        visible={confirmingDelete}
        title="Delete club?"
        message={`This permanently deletes "${club.name}" for every member, including its sessions, matches, and tournaments.`}
        actions={[
          { label: "Delete", onPress: onDeleteClub, destructive: true },
          { label: "Cancel", onPress: () => setConfirmingDelete(false) },
        ]}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 34, gap: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  muted: { color: C.text2 },
  hero: { backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 6, borderWidth: 1, borderColor: C.line },
  eyebrow: { color: C.red, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: C.text, fontSize: 24, fontFamily: F.display, letterSpacing: 0.5 },
  code: { color: C.text2, fontSize: 13, fontFamily: F.body },
  statRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  statBox: { flex: 1, backgroundColor: C.cardHi, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  statNum: { color: C.red, fontSize: 26, fontFamily: F.display },
  statLbl: { color: C.text2, fontSize: 12, fontFamily: F.medium, marginTop: 2, letterSpacing: 0.4 },
  cta: { backgroundColor: C.red, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ctaText: { color: C.text, fontSize: 17, fontWeight: "800" },
  secondary: { backgroundColor: C.cardHi, borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryText: { color: C.text, fontSize: 15, fontWeight: "700" },
  boardHeadRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, marginTop: 14, marginBottom: 2 },
  colHead: { color: C.text2, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  pctCol: { width: 52, textAlign: "right" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rank: { color: C.text2, width: 26, textAlign: "center", fontWeight: "800", fontSize: 15 },
  boardName: { flex: 1, color: C.text, fontSize: 16, fontWeight: "700" },
  wl: { color: C.text, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pct: { color: C.text2, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] },
  empty: { color: C.text2, fontSize: 15, lineHeight: 22, padding: 20, textAlign: "center" },
});
