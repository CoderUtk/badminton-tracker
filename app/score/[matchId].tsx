import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Platform, View } from "react-native";
import { setStatusBarHidden } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import MatchScreen from "../../src/screens/MatchScreen";
import { getMatch, MatchRecord } from "../../src/repos/matchRepo";
import { C } from "../../src/theme";

export default function ScoreRoute() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [match, setMatch] = useState<MatchRecord | null>(null);

  useEffect(() => {
    if (matchId) getMatch(matchId).then(setMatch);
  }, [matchId]);

  // Fullscreen immersive while scoring so system bars never cover the +1 rails.
  useEffect(() => {
    setStatusBarHidden(true, "fade");
    // Edge-to-edge (SDK 54 default) doesn't support setBehaviorAsync; visibility
    // still hides the nav bar. Swiping from the edge reveals bars temporarily.
    if (Platform.OS === "android") void NavigationBar.setVisibilityAsync("hidden");
    return () => {
      setStatusBarHidden(false, "fade");
      if (Platform.OS === "android") void NavigationBar.setVisibilityAsync("visible");
    };
  }, []);

  if (!matchId || !match) return <View style={{ flex: 1 }} />;
  return <MatchScreen matchId={matchId} record={match} />;
}
