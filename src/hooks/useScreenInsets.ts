import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "../theme";

/**
 * Safe-area padding for screens that dock a CTA to the bottom edge.
 *
 * RN 0.81 / Expo 54 force edge-to-edge on Android 15, so a screen that ignores
 * the bottom inset draws underneath the navigation bar. That is audit finding
 * H3: the New match CTA ran from y1456 to y1568 with the nav bar starting at
 * y1504, clipping the bottom 32dp of "Start scoring".
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top,
    bottom: insets.bottom,
    /** Bottom padding for a container whose last child is a docked CTA. */
    ctaPadding: insets.bottom + space.md,
  };
}
