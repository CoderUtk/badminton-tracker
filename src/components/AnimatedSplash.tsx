import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { C, F, glow } from "../theme";

/**
 * JS-side animated splash shown over the app while it boots. The native splash
 * (expo-splash-screen) hands off to this: the shuttlecock drops in with a small
 * bounce + rotation, the wordmark fades up, then the whole overlay fades out and
 * calls onFinish so the app underneath is revealed.
 */
export default function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordShift = useRef(new Animated.Value(12)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(wordShift, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(450),
      Animated.timing(fade, { toValue: 0, duration: 350, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onFinish());
  }, [logoScale, logoOpacity, spin, wordOpacity, wordShift, fade, onFinish]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }, { rotate }] }}>
        <Image source={require("../../assets/splash.png")} style={styles.logo} resizeMode="contain" />
      </Animated.View>
      <Animated.Text style={[styles.word, { opacity: wordOpacity, transform: [{ translateY: wordShift }] }]}>
        COURT<Animated.Text style={styles.wordAccent}>SIDE</Animated.Text>
      </Animated.Text>
      <Animated.Text style={[styles.tag, { opacity: wordOpacity }]}>BADMINTON · TRACKED</Animated.Text>
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
  logo: { width: 176, height: 176 },
  word: { color: C.text, fontFamily: F.display, fontSize: 40, letterSpacing: 2, marginTop: 6, ...glow(C.red, 18, 0.5) },
  wordAccent: { color: C.red },
  tag: { color: C.accent, fontFamily: F.medium, fontSize: 13, marginTop: 8, letterSpacing: 4 },
});
