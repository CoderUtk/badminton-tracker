import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listSessions, refreshSessions, type ClubSession } from "../../../src/repos/sessionRepo";
import Icon from "../../../src/components/Icon";
import { C, F } from "../../../src/theme";
import { useHasRealClubs } from "../../../src/hooks/useHasRealClubs";
import { syncSessionReminders } from "../../../src/lib/reminders";

const STATUS_COLOR: Record<ClubSession["status"], string> = {
  scheduled: C.amber,
  live: C.green,
  done: C.text2,
  cancelled: C.red,
};

function dateLabel(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Today · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function Sessions() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const reload = useCallback(() => {
    void refreshSessions().then(() => listSessions().then((list) => {
      setSessions(list);
      void syncSessionReminders();
    }));
  }, []);
  useFocusEffect(reload);
  const hasRealClubs = useHasRealClubs();

  return (
    <View style={s.root}>
      {/* null while the first check is in flight — render neither branch
          rather than flashing "join a club" at someone who has one. */}
      {hasRealClubs === null ? null : hasRealClubs ? (
        <Pressable style={s.cta} onPress={() => router.push("/new-session")}>
          <Icon name="add" color={C.text} size={20} />
          <Text style={s.ctaText}>Plan a session</Text>
        </Pressable>
      ) : (
        <View style={s.explanatory}>
          <Icon name="information-circle-outline" color={C.text2} size={20} />
          <Text style={s.explanatoryText}>
            Join a club to plan sessions.{" "}
            <Text style={s.explanatoryLink} onPress={() => router.push("/(app)")}>
              Go to Home
            </Text>
          </Text>
        </View>
      )}
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={sessions.length ? s.list : s.emptyWrap}
        ListEmptyComponent={<Text style={s.empty}>No sessions yet. Plan your next club night.</Text>}
        renderItem={({ item }) => {
          const color = STATUS_COLOR[item.status];
          return (
            <Pressable style={[s.card, { borderLeftColor: color, borderLeftWidth: 4 }]} onPress={() => router.push(`/(app)/sessions/${item.id}`)}>
              <View style={s.dateBlock}>
                <Text style={s.date}>{dateLabel(item.starts_at)}</Text>
                <View style={s.badges}>
                  {item.open_join && (
                    <Text style={s.openMarker} accessibilityLabel="Open to anyone with the link">
                      OPEN
                    </Text>
                  )}
                  <View style={[s.statusPill, { backgroundColor: color + "22" }]}>
                    <View style={[s.statusDot, { backgroundColor: color }]} />
                    <Text style={[s.status, { color }]}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
              <Text style={s.location}>{item.location || "Badminton session"}</Text>
              <Text style={s.meta}>{item.courts} {item.courts === 1 ? "court" : "courts"} · Tap to manage attendance</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 14 },
  cta: { flexDirection: "row", gap: 8, minHeight: 56, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 14 },
  ctaText: { color: C.text, fontSize: 18, fontFamily: F.bold },
  explanatory: {
    flexDirection: "row",
    gap: 8,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  explanatoryText: {
    color: C.text2,
    fontSize: 16,
    fontFamily: F.semibold, textAlign: "center",
  },
  explanatoryLink: {
    color: C.accent,
    textDecorationLine: "underline",
    fontFamily: F.bold },
  list: { gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { color: C.text2, fontSize: 16, lineHeight: 24, textAlign: "center", padding: 28 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line, gap: 4 },
  dateBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: C.text2, fontSize: 13, fontFamily: F.bold },
  badges: { flexDirection: "row", alignItems: "center", gap: 6 },
  openMarker: { color: C.accent, fontFamily: F.semibold, fontSize: 11, letterSpacing: 0.7 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 11, fontFamily: F.bold, letterSpacing: 0.7 },
  location: { color: C.text, fontSize: 18, fontFamily: F.bold },
  meta: { color: C.text2, fontSize: 14 },
});
