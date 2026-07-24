import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import MatchScreen from "../../src/screens/MatchScreen";
import { getMatch, MatchRecord } from "../../src/repos/matchRepo";
import { C } from "../../src/theme";

export default function ScoreRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchRecord | null>(null);

  useEffect(() => {
    if (matchId) getMatch(matchId).then(setMatch);
  }, [matchId]);

  if (!matchId || !match) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <MatchScreen matchId={matchId} record={match} />;
}
