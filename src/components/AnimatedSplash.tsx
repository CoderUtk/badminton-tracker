import React, { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from "react-native-reanimated";
import BadmintonRacketSvg from "./BadmintonRacketSvg";
import { LogoMark } from "./Logo";
import { C, F, glow } from "../theme";

const RACKET_W = 190;
const RACKET_H = RACKET_W * 1.2;

/**
 * Boot splash shown over the app while it loads. A racket swings in from the
 * left and recedes, the LogoMark shuttlecock (the same mark used in headers)
 * flies to center and settles, then the wordmark fades up.
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
  const textY = useSharedValue(24);

  const fade = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      racketOpacity.value = 0;
      shuttleOpacity.value = 1;
      shuttleX.value = 0;
      shuttleY.value = -28;
      shuttleScale.value = 1;
      shuttleRotate.value = "0deg";
      textOpacity.value = 1;
      textY.value = 0;
      fade.value = withDelay(600, withTiming(0, { duration: 300 }, (f) => f && runOnJS(onFinish)()));
      return;
    }

    // 1. Racket swing sequence
    racketOpacity.value = withTiming(1, { duration: 150 });
    racketX.value = withTiming(-width * 0.4, { duration: 400, easing: Easing.out(Easing.quad) });
    racketY.value = withTiming(-height * 0.22, { duration: 400, easing: Easing.out(Easing.quad) });
    racketScale.value = withTiming(1.05, { duration: 400 });
    racketRotate.value = withTiming("0deg", { duration: 400 });

    // Racket recedes
    racketOpacity.value = withDelay(400, withTiming(0, { duration: 300 }));
    racketX.value = withDelay(400, withTiming(-width * 0.7, { duration: 300 }));

    // 2. Shuttlecock shot sequence (direct into screen center)
    shuttleOpacity.value = withDelay(100, withTiming(1, { duration: 100 }));
    shuttleX.value = withDelay(100, withTiming(0, { duration: 900, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
    shuttleY.value = withDelay(100, withTiming(0, { duration: 900, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
    shuttleScale.value = withDelay(100, withTiming(1, { duration: 900 }));
    shuttleRotate.value = withDelay(100, withTiming("0deg", { duration: 900 }));

    // 3. Smooth upward float for shuttlecock when text appears
    shuttleY.value = withDelay(1250, withTiming(-28, { duration: 850, easing: Easing.bezier(0.16, 1, 0.3, 1) }));

    // 4. Branding text fade & slide up
    textOpacity.value = withDelay(1250, withTiming(1, { duration: 800 }));
    textY.value = withDelay(1250, withTiming(0, { duration: 800, easing: Easing.bezier(0.22, 1, 0.36, 1) }));

    // 5. Hold, then hand off to the app underneath
    fade.value = withDelay(2350, withTiming(0, { duration: 320 }, (f) => f && runOnJS(onFinish)()));
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
      <Animated.View style={[styles.centerAnchor, racketStyle]}>
        <BadmintonRacketSvg size={RACKET_W} />
      </Animated.View>
      <View style={styles.center}>
        <Animated.View style={shuttleStyle}>
          <LogoMark size={110} />
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
  // Anchored at screen center via fixed offsets (half of RACKET_W/RACKET_H)
  // rather than relying on Yoga to center an unsized absolute child — the
  // animated transform then carries it off-screen and back from that point.
  centerAnchor: { position: "absolute", top: "50%", left: "50%", marginLeft: -RACKET_W / 2, marginTop: -RACKET_H / 2 },
  center: { alignItems: "center", justifyContent: "center" },
  textWrap: { marginTop: 12, alignItems: "center" },
  word: { color: C.text, fontFamily: F.display, fontSize: 40, letterSpacing: 2, ...glow(C.red, 18, 0.5) },
  wordAccent: { color: C.red },
  tag: { color: C.accent, fontFamily: F.medium, fontSize: 13, marginTop: 8, letterSpacing: 4 },
});
