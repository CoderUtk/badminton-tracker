import React, { useCallback, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter, Stack } from "expo-router";
import { getGuestMatchIds, getUpgradeDismissedAt, setUpgradeDismissedAt } from "../../src/lib/guestMatches";
import { guestDaysLeft, isGuestExpiringSoon, shouldPromptUpgrade } from "../../src/lib/guestRetention";
import { getMatch, listMatches, MatchRecord } from "../../src/repos/matchRepo";
import type { TeamId } from "../../src/engine";
import Icon from "../../src/components/Icon";
import PressableScale from "../../src/components/PressableScale";
import { C, F } from "../../src/theme";

const names = (side: { name: string }[]) => side.map((p) => p.name).join(" / ");
const format = (m: MatchRecord) =>
  `${m.config.matchType === "singles" ? "Singles" : "Doubles"} · ${m.config.pointsToWin} pts`;

function TeamLine({ item, team }: { item: MatchRecord; team: TeamId }) {
  const side = team === "A" ? item.side_a : item.side_b;
  const won = item.winner === team;
  const games = item.score_summary?.games ?? [];
  const current = item.score_summary?.current;
  return (
    <View style={s.teamLine}>
      {won && <Icon name="trophy" color={C.green} size={14} />}
      <Text style={[s.teamName, won && s.teamWon]} numberOfLines={1}>{names(side)}</Text>
      {item.status === "live" && current ? (
        <Text style={s.liveScore}>{current[team]}</Text>
      ) : (
        <View style={s.scoreCells}>
          {games.map((g, i) => {
            const mine = team === "A" ? g.A : g.B;
            const gameWon = team === "A" ? g.A > g.B : g.B > g.A;
            return <Text key={i} style={[s.gameCell, gameWon && s.gameCellWon]}>{mine}</Text>;
          })}
        </View>
      )}
    </View>
  );
}

/** How long this match has before the guest purge takes it (0044). */
function ExpiryLine({ createdAt, now }: { createdAt: number; now: number }) {
  const days = guestDaysLeft(createdAt, now);
  const soon = isGuestExpiringSoon(days);
  // Only worth the line once it is close enough to act on. A month out it is
  // noise on every card.
  if (!soon) return null;
  return (
    <Text style={[s.expiry, days === 0 && s.expiryGone]}>
      {days === 0 ? "Expired — sign up to keep it" : `Saved for ${days} more day${days === 1 ? "" : "s"}`}
    </Text>
  );
}

export default function GuestMatches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [prompt, setPrompt] = useState(false);
  // Read once per focus so every row in a render shares one clock; recomputing
  // Date.now() per row makes two matches created a millisecond apart show
  // different day counts at the boundary.
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        // Web: RLS scopes listMatches() to this anon user, so no local id list.
        // Native: guest history is a session-scoped id list (native listMatches
        // would also return matches from a previous signed-in account on a
        // shared device).
        const rows =
          Platform.OS === "web"
            ? await listMatches()
            : (await Promise.all((await getGuestMatchIds()).map((id) => getMatch(id)))).filter(
                (m): m is MatchRecord => m !== null,
              );
        const dismissedAt = await getUpgradeDismissedAt();
        if (live) {
          setMatches(rows);
          setNow(Date.now());
          setPrompt(shouldPromptUpgrade(rows.length, dismissedAt));
          setLoaded(true);
        }
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  if (!loaded) return null;

  if (matches.length === 0) {
    return (
      <View style={s.emptyRoot}>
        <Stack.Screen options={{ title: "My matches" }} />
        <Icon name="badminton" color={C.text2} size={48} />
        <Text style={s.emptyTitle}>No matches yet</Text>
        <Text style={s.emptyText}>Quick matches you score this session show up here.</Text>
        <PressableScale accessibilityRole="button" style={s.emptyCta} onPress={() => router.push("/new-match")}>
          <Icon name="play" color={C.text} size={18} />
          <Text style={s.emptyCtaText}>Start a match</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "My matches" }} />
      <FlatList
        style={s.root}
        contentContainerStyle={s.list}
        data={matches}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={
          prompt ? (
            <View style={s.prompt}>
              <Text style={s.promptTitle}>Don&apos;t lose these</Text>
              <Text style={s.promptText}>
                Guest matches are deleted automatically. An email and password keeps
                every one of them — same history, nothing to re-enter.
              </Text>
              <View style={s.promptRow}>
                <PressableScale accessibilityRole="button"
                  style={s.promptCta}
                  onPress={() => router.push("/guest/save")}
                >
                  <Text style={s.promptCtaText}>Save my matches</Text>
                </PressableScale>
                <PressableScale accessibilityRole="button"
                  style={s.promptLater}
                  onPress={() => {
                    setPrompt(false);
                    void setUpgradeDismissedAt(matches.length);
                  }}
                >
                  <Text style={s.promptLaterText}>Not now</Text>
                </PressableScale>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <PressableScale accessibilityRole="button"
            style={[s.card, item.status === "live" && s.cardLive]}
            onPress={() => router.push(`/score/${item.id}`)}
          >
            <Text style={s.format}>{format(item)}</Text>
            <TeamLine item={item} team="A" />
            <Text style={s.vs}>vs</Text>
            <TeamLine item={item} team="B" />
            {item.status === "live" && <Text style={s.liveBadge}>● LIVE — tap to resume</Text>}
            <ExpiryLine createdAt={item.created_at} now={now} />
          </PressableScale>
        )}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line, gap: 4 },
  cardLive: { borderColor: C.green },
  format: { color: C.text2, fontSize: 12, fontFamily: F.bold, letterSpacing: 0.3 },
  teamLine: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  teamName: { flex: 1, color: C.text, fontSize: 16, fontFamily: F.bold },
  teamWon: { color: C.green, fontFamily: F.bold },
  scoreCells: { flexDirection: "row", alignItems: "center", gap: 6 },
  gameCell: { color: C.text2, fontSize: 15, fontFamily: F.bold, minWidth: 22, textAlign: "center", fontVariant: ["tabular-nums"] },
  gameCellWon: { color: C.text, fontFamily: F.bold },
  liveScore: { color: C.green, fontSize: 20, fontFamily: F.display, minWidth: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
  vs: { color: C.text3, fontSize: 12 },
  liveBadge: { color: C.green, fontSize: 12, fontFamily: F.bold, marginTop: 4 },
  expiry: { color: C.amber, fontSize: 12, fontFamily: F.medium, marginTop: 4 },
  expiryGone: { color: C.red },
  prompt: {
    backgroundColor: C.card, borderRadius: 14, padding: 16, gap: 8,
    borderWidth: 1, borderColor: C.red, marginBottom: 4,
  },
  promptTitle: { color: C.text, fontSize: 16, fontFamily: F.semibold },
  promptText: { color: C.text2, fontSize: 13, fontFamily: F.body, lineHeight: 19 },
  promptRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  promptCta: {
    flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: C.red,
    alignItems: "center", justifyContent: "center",
  },
  promptCtaText: { color: C.text, fontSize: 15, fontFamily: F.semibold },
  promptLater: { minHeight: 48, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  promptLaterText: { color: C.text2, fontSize: 14, fontFamily: F.medium },
  emptyRoot: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  emptyTitle: { color: C.text, fontSize: 20, marginTop: 4, fontFamily: F.display },
  emptyText: { color: C.text2, fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 8 },
  emptyCta: { flexDirection: "row", gap: 8, backgroundColor: C.red, borderRadius: 14, minHeight: 52, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  emptyCtaText: { color: C.text, fontSize: 17, fontFamily: F.bold },
});
