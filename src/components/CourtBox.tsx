import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { CourtZone } from "../lib/courtZones";
import Icon from "./Icon";
import { C } from "../theme";

const LINE = "rgba(255,255,255,0.45)";

/** Everything the new-match screen needs to make a box editable. Omit to render read-only. */
export type CourtBoxEdit = {
  value: string;
  placeholder: string;
  editing: boolean;
  onNamePress: () => void;
  onChangeText: (text: string) => void;
  /** Enter/next: commit and move to the following slot. */
  onSubmit: () => void;
  /** Focus lost: stop editing this box if it is still the active one. */
  onEndEdit: () => void;
  onZonePress: () => void;
  /** Increments each time a serve pick is rejected and this box is the valid one. */
  pulseKey: number;
  /** True when this is the last editable slot, so Enter should dismiss the keyboard. */
  isLast: boolean;
};

/**
 * One service box. Read-only by default (score and watch screens); with `edit`
 * supplied the name becomes tappable, the box can host an inline field, and a
 * rejected serve pick flashes an outline here.
 */
export default function CourtBox({
  zone, name, color, isServer, servingColor, showDivider, suppressed = false, edit,
}: {
  zone: CourtZone;
  name: string | null;
  color: string;
  isServer: boolean;
  servingColor: string;
  showDivider: boolean;
  /** Covered by the name panel: dimmed and inert so the panel reads as a menu
   *  over an inactive area instead of two live controls colliding (audit H2). */
  suppressed?: boolean;
  edit?: CourtBoxEdit;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseKey = edit?.pulseKey ?? 0;

  useEffect(() => {
    if (!pulseKey) return;
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [pulseKey, pulse]);

  const usesPlaceholder = !!edit && !edit.value.trim();
  const label = edit ? edit.value.trim() || edit.placeholder : name;

  return (
    <Pressable
      style={[
        s.box,
        showDivider && s.boxDivider,
        isServer && [
          s.boxServing,
          {
            borderColor: servingColor,
            backgroundColor: servingColor === C.red
              ? "rgba(255,59,48,0.12)"
              : "rgba(59,130,246,0.12)",
          },
        ],
        suppressed && s.suppressed,
      ]}
      onPress={edit?.onZonePress}
      disabled={!edit || suppressed}
      pointerEvents={suppressed ? "none" : "auto"}
      accessible={!!edit && !suppressed}
      accessibilityElementsHidden={suppressed}
      importantForAccessibility={suppressed ? "no-hide-descendants" : "auto"}
    >
      {isServer && <View style={[s.dot, { backgroundColor: servingColor, shadowColor: servingColor }]} />}

      <Animated.View pointerEvents="none" style={[s.pulse, { opacity: pulse }]} />

      {edit?.editing ? (
        <TextInput
          autoFocus
          selectTextOnFocus
          style={[s.input, { color }]}
          value={edit.value}
          placeholder={edit.placeholder}
          placeholderTextColor={C.text2}
          onChangeText={edit.onChangeText}
          onSubmitEditing={edit.onSubmit}
          onBlur={edit.onEndEdit}
          returnKeyType={edit.isLast ? "done" : "next"}
          autoCapitalize="words"
          autoCorrect={false}
        />
      ) : zone.playerIdx !== null && label !== null ? (
        <Pressable
          style={s.player}
          onPress={edit?.onNamePress}
          disabled={!edit}
          hitSlop={8}
          accessible={!!edit}
        >
          <Icon name="person" color={color} size={15} />
          <Text
            style={[s.name, { color: usesPlaceholder ? C.text2 : color }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center" },
  boxDivider: { borderBottomWidth: 1, borderColor: LINE },
  boxServing: {
    borderWidth: 1.5,
    // borderColor and backgroundColor are overridden dynamically per serving team
  },
  suppressed: { opacity: 0.35 },
  dot: {
    position: "absolute", top: 10, right: 10,
    width: 14, height: 14, borderRadius: 7,
    shadowOpacity: 0.9, shadowRadius: 6, elevation: 4,
  },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2.5,
    borderColor: C.text,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  player: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6 },
  name: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  input: {
    alignSelf: "stretch", marginHorizontal: 10, paddingVertical: 4,
    fontSize: 16, fontWeight: "700", textAlign: "center",
    borderBottomWidth: 1, borderColor: LINE,
  },
});
