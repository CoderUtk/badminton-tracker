import React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

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
export default function PressableScale({ style, scaleTo = 0.97, children, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  
  const anim = useAnimatedStyle(() => ({ 
    transform: [{ scale: scale.value }],
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
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
