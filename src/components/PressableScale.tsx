import React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Apple fluid springs: press-in snappy + critically damped (no wobble while held);
// release settles critically damped. Springs are interruptible — a fast double
// tap re-targets from the live scale instead of snapping, so it never feels dead.
const IN = { dampingRatio: 1, duration: 180 } as const;
const OUT = { dampingRatio: 1, duration: 320 } as const;

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
};

/** Pressable with a spring scale on press. Drop-in for taps that want fluid feedback. */
export default function PressableScale({ style, scaleTo = 0.96, children, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { if (!disabled) scale.value = withSpring(scaleTo, IN); onPressIn?.(e); }}
      onPressOut={(e) => { scale.value = withSpring(1, OUT); onPressOut?.(e); }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
