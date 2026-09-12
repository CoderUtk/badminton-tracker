import React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { focusRing } from "../theme";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Apple fluid springs: response time 0.3s (300ms) for press-in with critical damping
// (dampingRatio 1 = no wobble). Release uses 0.4s response for smooth settle.
// Springs are interruptible — a fast double-tap re-targets from live scale (never snaps).
const IN = { dampingRatio: 1, duration: 300, overshootClamping: false } as const;
const OUT = { dampingRatio: 0.9, duration: 400, overshootClamping: false } as const;

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
};

/** 
 * Pressable with fluid spring scale on press. Drop-in for taps that want premium feedback.
 * Emil's principle: scale(0.97) feels confident without over-animation. Origin-aware transforms
 * ensure the element scales from its visual center.
 */
export default function PressableScale({ style, scaleTo = 0.97, children, onPressIn, onPressOut, onFocus, onBlur, disabled, ...rest }: Props) {
  const [focused, setFocused] = React.useState(false);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  // Reduce Motion drops the scale but keeps the dim: opacity is the
  // non-vestibular half of this feedback, and removing it too would leave the
  // app's most-used control with no press response at all. Six other
  // components already gate this way; this is the one nearly every tappable
  // goes through.
  const reduced = useReducedMotion();

  const anim = useAnimatedStyle(() => ({
    transform: reduced ? [] : [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { 
        if (!disabled) {
          scale.value = withSpring(scaleTo, IN);
          opacity.value = withSpring(0.92, IN);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => { 
        scale.value = withSpring(1, OUT);
        opacity.value = withSpring(1, OUT);
        onPressOut?.(e);
      }}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      // Plain state rather than Pressable's style-as-function: this is an
      // Animated.createAnimatedComponent wrapper, and a function style there
      // mixes reanimated's style handling with RN's press-state callback.
      // focusRing is empty on native, so the extra entry is inert there.
      style={[style, anim, focused && focusRing]}
    >
      {children}
    </AnimatedPressable>
  );
}
