import { Platform } from "react-native";

/**
 * CourtSide theme — premium "sports game HUD" direction.
 * Deep near-black surfaces, action red primary, an electric-cyan accent for
 * highlights/glows, and the Russo One / Chakra Petch esports type pairing.
 */
export const C = {
  // base surfaces (deep, slightly cool black for depth)
  bg: "#0C0E12",
  bgElev: "#12151B",
  card: "#171A21",
  cardHi: "#1F232C",
  // Translucent, not solid: a hairline now composites correctly over the screen
  // gradient, a carved card, and a flat surface without being retuned per
  // background. lineHi doubles as the top-edge highlight in `carved`.
  line: "rgba(255,255,255,0.07)",
  lineHi: "rgba(255,255,255,0.15)",
  // brand + semantic
  red: "#FF3B30",
  redDeep: "#B3261E",
  blue: "#3B82F6",
  green: "#22C55E",
  amber: "#F59E0B",
  accent: "#22D3EE", // electric cyan — premium highlights + glow
  accentDeep: "#0E7490",
  // text
  // Not #FFFFFF. Pure white on a near-black ground glares and reads like the
  // OS high-contrast mode rather than a designed surface. Measures 16.5:1 on
  // C.bg, so the drop costs nothing against AA.
  text: "#F2F4F8",
  text2: "#9BA3B2",
  // Raised from #5C6472, which measured 3.24:1 on bg and 2.90:1 on cardHi —
  // the root of audit finding A8. This is the dimmest slate that still clears
  // 4.5:1 on every surface in this palette.
  text3: "#838B9D",
  // The old text3. Decorative only — inactive dots, icon washes, hairlines.
  // Never colour text with this; it fails AA by design.
  ghost: "#5C6472",
} as const;

/** Font families (loaded in the root layout via @expo-google-fonts). */
export const F = {
  display: "RussoOne_400Regular", // scores, wordmark, big numerals
  body: "ChakraPetch_400Regular",
  medium: "ChakraPetch_500Medium",
  semibold: "ChakraPetch_600SemiBold",
  bold: "ChakraPetch_700Bold",
} as const;

/** Gradients (for expo-linear-gradient). */
export const GRAD = {
  // Lit at the top, settling to base by the fold. Three stops, not two: a
  // linear two-stop ramp reads as a gradient, an eased one reads as light.
  screen: ["#0F1319", "#0A0C10", "#0C0E12"] as const,
  card: ["#1B1F27", "#141821"] as const,
  redCTA: ["#FF4D42", "#D42318"] as const,
  accent: ["#22D3EE", "#0E7490"] as const,
  court: ["#1A2A2E", "#14202A"] as const,
} as const;

/**
 * Accent rule for share cards. One rule, applied everywhere:
 *
 *   C.red    = identity and framing. Eyebrows, category pills, brand marks.
 *   C.accent = the earned thing. Winning score, champion name, unlocked badge.
 *
 * textGlow(C.accent) is reserved for the single hero element on a card. More
 * than one glowing element and neither reads as the point of the image.
 */

/** Neon glow presets — apply as shadow* props for a HUD feel. */
export const glow = (color: string, radius = 14, opacity = 0.55) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
});

/** Neon glow for text (uses textShadow, which Text supports on both platforms). */
export const textGlow = (color: string, radius = 12) => ({
  textShadowColor: color,
  textShadowRadius: radius,
  textShadowOffset: { width: 0, height: 0 },
});

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** 
 * Emil's custom easing curves: all animations use ease-out (never ease-in).
 * Exits should be faster than entrances (250ms exit vs 300ms entrance).
 */
export const easing = {
  // Apple's signature curve: ease-out with slight snap
  standard: [0.4, 0, 0.2, 1] as const,
  // Snappier for quick feedback (button presses, toggles)
  snappy: [0.25, 0.1, 0.25, 1] as const,
  // Smooth for page transitions and large movements
  smooth: [0.32, 0.72, 0, 1] as const,
  // Exit curve: faster, more direct
  exit: [0.4, 0, 1, 1] as const,
} as const;

/** Instant press feedback for any Pressable — subtle scale + dim. Transform/opacity only (GPU-safe). */
export const press = { transform: [{ scale: 0.97 }], opacity: 0.92 } as const;

/**
 * Keyboard focus ring for the web build. The app ships as a PWA as well as a
 * native app, and on the web a keyboard user had no indication whatsoever of
 * what was focused — WCAG 2.4.7. Native has no keyboard focus to draw, so this
 * is empty there rather than painting an outline nobody can reach.
 *
 * An outline, not a border: a border would change the element's box and shift
 * the layout the moment focus lands on it.
 */
export const focusRing =
  Platform.OS === "web"
    ? ({ outlineWidth: 2, outlineStyle: "solid", outlineColor: C.accent, outlineOffset: 2 } as const)
    : ({} as const);

/**
 * Readable content width. Every list screen was padding:16 against 100% width,
 * so on the desktop PWA a match card stretched to the full window with a name
 * at either end, and app.json declares supportsTablet with no size-class
 * branching. 640 keeps line lengths readable and is wider than any phone, so
 * it costs the phone layout nothing.
 */
export const screenMax = { width: "100%", maxWidth: 640, alignSelf: "center" } as const;

/** 8pt spatial grid. Every margin, padding and gap comes from here. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Android's minimum touch target, in dp. Applies on both axes. */
export const MIN_TOUCH = 48;

/**
 * Destructive recipe. Outlined, never filled: a red FILL means "primary
 * action" and nothing else, so Delete and Start a match can never look alike
 * (audit M2). Pair with dangerText and always confirm through AppDialog.
 */
export const danger = {
  backgroundColor: "transparent",
  borderWidth: 1.5,
  borderColor: C.red,
} as const;
export const dangerText = { color: C.red } as const;

/**
 * Selected state. Deliberately hueless — selection is a state, not an action,
 * so it gets elevation instead of colour. Cyan was considered and rejected: it
 * already means DRAFT, and its higher luminance would make a passive selected
 * chip louder than the primary CTA.
 */
export const selected = {
  backgroundColor: C.cardHi,
  borderWidth: 1,
  borderColor: C.lineHi,
} as const;
export const selectedText = { color: C.text } as const;
export const unselectedText = { color: C.text2 } as const;

/**
 * Ambient blooms painted behind every screen by <ScreenBackground>. A dark UI
 * needs an implied light source; without one the ground reads as a void and no
 * amount of card polish rescues it. Cyan sits top-centre behind the header,
 * red washes the top-right so the CTA has something to sit in.
 *
 * Opacities are deliberately under 0.2 — above that the wash starts competing
 * with C.accent as a highlight and the screen looks tinted rather than lit.
 */
export const BLOOM = [
  { color: C.accent, opacity: 0.16, cx: "50%", cy: "-8%", rx: "120%", ry: "52%" },
  { color: C.red, opacity: 0.11, cx: "88%", cy: "6%", rx: "90%", ry: "40%" },
] as const;

/** Grain opacity. Low enough to be invisible as texture, high enough to break
 *  the gradient banding that the blooms introduce on 6-bit Android panels. */
export const GRAIN_OPACITY = 0.055;

/**
 * Carved surface. A card lit from above: translucent white fill that falls off
 * downward, a bright top edge, a dark bottom shadow. Reads as cut from the
 * screen rather than pasted onto it, which is the single biggest difference
 * between a flat black app and one that looks expensive.
 *
 * Translucent rather than a flat colour on purpose — it composites over the
 * screen gradient, so a card near the lit top of a screen is legitimately
 * lighter than one near the bottom. `carvedFill` is the gradient for
 * expo-linear-gradient; `carved` is the frame that goes around it.
 */
export const carvedFill = ["rgba(255,255,255,0.055)", "rgba(255,255,255,0.018)"] as const;
export const carved = {
  borderWidth: 1,
  borderColor: C.line,
  borderTopColor: C.lineHi,
  shadowColor: "#000",
  shadowOpacity: 0.5,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

/**
 * Scoreboard type scale, in points.
 *
 * Lives here rather than in MatchScreen's StyleSheet so the hierarchy is
 * asserted in tests. Audit M8: the score was 32pt against a 26pt "+1" label and
 * 15pt names, so on a board meant to be read from across a court the buttons
 * were the dominant element.
 */
export const SCOREBOARD_TYPE = {
  score: 56,
  divider: 26,
  rail: 22,
  name: 13,
  timer: 12,
} as const;

/**
 * Type scale for the share cards, in points on the 1080x1920 capture canvas.
 *
 * Lives here rather than in each card's StyleSheet so the four cards cannot
 * drift apart again: before this existed, the match card's hero numeral was
 * ~324pt effective while every other card topped out at 56, so they did not
 * read as the same product.
 *
 * The floor is 18. These cards are captured at 1080 wide and viewed at phone
 * size after Instagram recompresses them, so small type disappears.
 */
export const CARD_TYPE = {
  hero: 180,     // the single dominant numeral or name on a card
  title: 56,     // card headline: SESSION RESULTS, badge title, champion name
  subtitle: 30,  // secondary name, standings row name
  body: 26,      // descriptive copy, chip text
  label: 22,     // eyebrows, stat captions, runner-up label
  caption: 18,   // date, watermark sub-line
} as const;
