import React, { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import ShuttlecockSvg from "./ShuttlecockSvg";
import BadmintonRacketSvg from "./BadmintonRacketSvg";
import { C, F, easing, glow } from "../theme";

const ease = (curve: readonly [number, number, number, number]) => Easing.bezier(...curve);

/**
 * Boot splash shown over the app while it loads. A racket swings in from the
 * left and recedes, a shuttlecock flies to center and settles, then the
 * wordmark fades up — one continuous beat, not a sequence of separate stings,
 * since this plays on every cold start and has to stay fast.
 */
export default function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();

  const racketX = useSharedValue(-width * 0.8);
  const racketY = useSharedValue(-height * 0.35);
  const racketScale = useSharedValue(0.8);
  const racketRotate = useSharedValue("-30deg");
  const racketOpacity = useSharedValue(0);

  const shuttleX = useSharedValue(-width * 0.6);
  const shuttleY = useSharedValue(-height * 0.25);
  const shuttleScale = useSharedValue(0.45);
  const shuttleRotate = useSharedValue("55deg");
  const shuttleOpacity = useSharedValue(0);

  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(20);

  const fade = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      racketOpacity.value = 0;
      shuttleOpacity.value = 1;
      shuttleX.value = 0;
      shuttleY.value = -22;
      shuttleScale.value = 1;
      shuttleRotate.value = "0deg";
      textOpacity.value = 1;
      textY.value = 0;
      fade.value = withDelay(500, withTiming(0, { duration: 250 }, (f) => f && runOnJS(onFinish)()));
      return;
    }

    // Racket swings in from off-screen, then recedes as the shuttle takes over.
    racketOpacity.value = withTiming(1, { duration: 120 });
    racketX.value = withTiming(-width * 0.35, { duration: 300, easing: ease(easing.standard) });
    racketY.value = withTiming(-height * 0.2, { duration: 300, easing: ease(easing.standard) });
    racketScale.value = withTiming(1.05, { duration: 300, easing: ease(easing.standard) });
    racketRotate.value = withTiming("0deg", { duration: 300, easing: ease(easing.standard) });
    racketOpacity.value = withDelay(300, withTiming(0, { duration: 220, easing: ease(easing.exit) }));

    // Shuttle flies to center — decelerating, physical curve.
    shuttleOpacity.value = withDelay(40, withTiming(1, { duration: 90 }));
    shuttleX.value = withDelay(40, withTiming(0, { duration: 560, easing: ease(easing.smooth) }));
    shuttleY.value = withDelay(40, withTiming(0, { duration: 560, easing: ease(easing.smooth) }));
    shuttleScale.value = withDelay(40, withTiming(1, { duration: 560, easing: ease(easing.smooth) }));
    shuttleRotate.value = withDelay(40, withTiming("0deg", { duration: 560, easing: ease(easing.smooth) }));

    // Settles into a small float as the wordmark appears — one unbroken curve.
    shuttleY.value = withDelay(600, withTiming(-22, { duration: 420, easing: ease(easing.smooth) }));
    textOpacity.value = withDelay(600, withTiming(1, { duration: 420 }));
    textY.value = withDelay(600, withTiming(0, { duration: 420, easing: ease(easing.standard) }));

    // Hold briefly, then hand off to the app underneath.
    fade.value = withDelay(1280, withTiming(0, { duration: 280, easing: ease(easing.exit) }, (f) => f && runOnJS(onFinish)()));
  }, [reduced]);

  const racketStyle = useAnimatedStyle(() => ({
    opacity: racketOpacity.value,
    transform: [
      { translateX: racketX.value }, { translateY: racketY.value },
      { scale: racketScale.value }, { rotate: racketRotate.value },
    ],
  }));
  const shuttleStyle = useAnimatedStyle(() => ({
    opacity: shuttleOpacity.value,
    transform: [
      { translateX: shuttleX.value }, { translateY: shuttleY.value },
      { scale: shuttleScale.value }, { rotate: shuttleRotate.value },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textY.value }],
  }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[styles.root, rootStyle]} pointerEvents="none">
      <Animated.View style={[styles.racket, racketStyle]}>
        <BadmintonRacketSvg size={190} />
      </Animated.View>
      <View style={styles.center}>
        <Animated.View style={shuttleStyle}>
          <ShuttlecockSvg size={110} />
        </Animated.View>
        <Animated.View style={[styles.textWrap, textStyle]}>
          <Text style={styles.word}>
            COURT<Text style={styles.wordAccent}>SIDE</Text>
          </Text>
          <Text style={styles.tag}>BADMINTON · TRACKED</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  racket: { position: "absolute" },
  center: { alignItems: "center", justifyContent: "center" },
  textWrap: { marginTop: 12, alignItems: "center" },
  word: { color: C.text, fontFamily: F.display, fontSize: 40, letterSpacing: 2, ...glow(C.red, 18, 0.5) },
  wordAccent: { color: C.red },
  tag: { color: C.accent, fontFamily: F.medium, fontSize: 13, marginTop: 8, letterSpacing: 4 },
});
