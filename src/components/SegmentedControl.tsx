import React, { useEffect, useRef, useState } from "react";
import { Animated, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { C, MIN_TOUCH } from "../theme";

/** Sliding segmented control — the highlight animates between options instead of separate toggle chips. */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const indicator = useRef(new Animated.Value(0)).current;
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (!width) return;
    Animated.spring(indicator, {
      toValue: index * (width / options.length),
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  }, [index, width]);

  return (
    <View style={s.track} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View
          style={[s.indicator, { width: width / options.length - 4, transform: [{ translateX: indicator }] }]}
        />
      )}
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          disabled={opt.disabled}
          style={[s.item, opt.disabled && s.itemDisabled]}
          onPress={() => onChange(opt.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: opt.value === value, disabled: !!opt.disabled }}
          accessibilityLabel={opt.label}
        >
          <Text style={[s.itemText, opt.value === value && s.itemTextOn]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: "row", backgroundColor: C.card, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: C.line },
  indicator: { position: "absolute", top: 4, bottom: 4, left: 4, backgroundColor: C.red, borderRadius: 9 },
  item: { flex: 1, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  itemDisabled: { opacity: 0.4 },
  itemText: { color: C.text2, fontWeight: "800", fontSize: 14 },
  itemTextOn: { color: C.text },
});
