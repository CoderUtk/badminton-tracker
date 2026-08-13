import React, { useEffect } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import Animated, { useAnimatedProps, useSharedValue } from "react-native-reanimated";
import Icon from "./Icon";
import { elapsedMs, formatElapsed } from "../lib/elapsed";
import { C, F, space } from "../theme";

// Reanimated can drive a TextInput's `text` prop natively; it cannot drive a
// Text's children. This is the only way to update a string once a second
// without a React render.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Elapsed-match-time chip. The ONLY thing on the scoring screen that ticks.
 *
 * This exists as a separate component for one reason: MatchScreen used to hold
 * the clock in useState and re-render the entire screen — court, rails, ribbon,
 * rally dots — every second. uiautomator could never find the window idle
 * (audit A7), so the scoring screen was the one screen the audit could not
 * dump, and the re-render churn ran for the whole length of a match.
 *
 * The interval still runs on the JS thread (it is 1Hz; a UI-thread clock buys
 * nothing here) but it writes a shared value instead of React state, so the
 * update lands on one native text node and stops there.
 */
export default function ElapsedChip({
  startedAt,
  pausedMs,
  pausedSince,
}: {
  startedAt: number;
  pausedMs: number;
  pausedSince: number | null;
}) {
  const text = useSharedValue(formatElapsed(0));

  useEffect(() => {
    const tick = () => {
      text.value = formatElapsed(
        elapsedMs({ startedAt, now: Date.now(), pausedMs, pausedSince })
      );
    };
    // Paint immediately so the chip is never blank for up to a second, and so a
    // pause/resume shows its new frozen value without waiting for the interval.
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, pausedMs, pausedSince, text]);

  const animatedProps = useAnimatedProps(
    () => ({ text: text.value, defaultValue: text.value }) as Partial<TextInputProps>
  );

  return (
    <View style={s.chip} accessibilityRole="text" accessibilityLabel="Elapsed match time">
      <Icon name="time-outline" color={C.text2} size={12} />
      <AnimatedTextInput
        style={s.text}
        animatedProps={animatedProps}
        editable={false}
        // Not a field: no caret, no focus ring, no keyboard, no tab stop.
        caretHidden
        focusable={false}
        underlineColorAndroid="transparent"
        defaultValue={formatElapsed(0)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: "row", alignItems: "center", gap: space.xs,
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2,
    borderWidth: 1, borderColor: C.line,
  },
  // padding/margin zeroed because TextInput carries platform defaults that a
  // Text does not, and this has to sit on the same baseline the Text did.
  text: {
    color: C.text2, fontSize: 12, fontFamily: F.body,
    fontVariant: ["tabular-nums"],
    padding: 0, margin: 0, minWidth: 58,
  },
});
