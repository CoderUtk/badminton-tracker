import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  finishBracketMatch, getTournament, startBracketMatch,
} from "../../../src/repos/tournamentRepo";
import { getMatch } from "../../../src/repos/matchRepo";
import { bracketStatus } from "../../../src/tournament/bracket";
import type { BracketMatch, Entrant } from "../../../src/tournament/types";
import BracketView from "../../../src/components/BracketView";
import Sheet from "../../../src/components/Sheet";
import { toast } from "../../../src/lib/toast";
import { C, F } from "../../../src/theme";

export default function TournamentBracket() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState<BracketMatch | null>(null); // cell awaiting start confirm

  const reload = useCallback(() => {
    if (!id) return;
    (async () => {
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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 12 }}>
      {title ? <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 18, marginBottom: 4 }}>{title}</Text> : null}
      {champName ? (
        <Text style={{ color: C.red, fontFamily: F.semibold, marginBottom: 8 }}>🏆 Champion: {champName}</Text>
      ) : null}
      <BracketView bracket={bracket} entrants={entrants} onCellPress={onCellPress} />
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
    </View>
  );
}
