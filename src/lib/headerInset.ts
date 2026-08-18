import { Platform } from "react-native";

/**
 * Header heights, excluding the safe-area top inset.
 *
 * react-navigation exposes the real measured value through useHeaderHeight(),
 * but that hook only works INSIDE a screen — it needs the header's own context.
 * The inset has to be applied at the navigator level (one `contentStyle` per
 * stack instead of a padding edit on all sixteen screens), and there is no
 * header context there, so the value is reconstructed from the platform
 * defaults react-navigation itself uses.
 *
 * ponytail: platform constants, not a measurement. If a future
 * react-navigation changes its defaults, or a screen opts into a large title,
 * the gap under that header goes wrong by a few points and this is the knob.
 * The upgrade path is a `useHeaderHeight()` padding inside a shared <Screen>
 * wrapper — correct, but sixteen call sites instead of eight.
 */
// Platform.OS rather than Platform.select: the test environment's
// react-native mock provides OS but not select.
const BAR = Platform.OS === "ios" ? 44 : 56;

/** A sheet presentation uses the same taller bar on both platforms. */
const MODAL_BAR = 56;

/**
 * Top padding that puts a screen's content directly below a transparent
 * header, so the app-wide ground in app/_layout.tsx shows through the header
 * instead of a flat band capping it.
 *
 * @param safeAreaTop `useSafeAreaInsets().top` — the status bar / notch.
 * @param presentation "modal" for a sheet-presented stack screen.
 */
export function headerInset(
  safeAreaTop: number,
  presentation: "card" | "modal" = "card",
): number {
  // A modal sheet is inset from the top of the display, so the status bar is
  // not underneath its header and must not be added twice.
  if (presentation === "modal") return MODAL_BAR;
  return safeAreaTop + BAR;
}
