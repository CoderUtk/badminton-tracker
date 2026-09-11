import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { LogoMark } from "./Logo";
import Icon from "./Icon";
import { C } from "../theme";

/**
 * Custom `headerLeft` renderer for Stack screens.
 * Shows the native back chevron (when `canGoBack` is true) followed by the
 * LogoMark — so the logo always appears on the left without sacrificing back
 * navigation affordance.
 *
 * `onPress` defaults to `router.back()`: @react-navigation/native-stack's
 * `headerLeft` callback only ever supplies `{tintColor, canGoBack, label,
 * href}` (no `onPress`), unlike the older JS-stack header API this component
 * was written against, so a caller normally doesn't pass one.
 *
 * Usage:
 *   screenOptions={{ headerLeft: (props) => <HeaderLogoLeft {...props} /> }}
 */
export default function HeaderLogoLeft({
  canGoBack,
  onPress,
  tintColor,
}: {
  canGoBack?: boolean;
  onPress?: () => void;
  tintColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 4 }}>
      {canGoBack && (
        <Pressable
          onPress={onPress ?? (() => router.back())}
          hitSlop={8}
          style={{ padding: 6, marginRight: 2 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Icon name="chevron-back" color={tintColor ?? C.text} size={26} />
        </Pressable>
      )}
      <View style={{ paddingLeft: canGoBack ? 0 : 12 }}>
        <LogoMark size={26} />
      </View>
    </View>
  );
}
